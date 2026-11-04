import { timingSafeEqual } from 'node:crypto';
import { isAnonymousSignup, parseSignupCutoff, type SignupIdentity } from './signupEligibility';

export type SweepUser = SignupIdentity & { id: string; email?: string | null; created_at: string };
type Dependencies = {
  secret: () => string | undefined;
  enabledAt: () => string | undefined;
  marker: string;
  listUsers: (page: number, perPage: number) => Promise<{ users: SweepUser[] }>;
  notify: (userId: string) => Promise<{ ok: boolean; status: string }>;
  now?: () => number;
};

const PER_PAGE = 1000, MAX_PAGES = 20, MAX_CANDIDATES = 10;
const SCAN_BUDGET_MS = 8_000, TOTAL_BUDGET_MS = 50_000, BATCH_RESERVE_MS = 20_000;

/** Bounded, retryable recovery pass. Responses contain counts and completeness only. */
export function createSignupSweepHandler(dependencies: Dependencies) {
  return async (request: Request) => {
    const json = (data: Record<string, number | boolean | string>, status = 200) =>
      Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
    const secret = dependencies.secret()?.trim() || '';
    if (secret.length < 32) return json({ error: 'notification_not_configured' }, 503);
    const actual = Buffer.from(request.headers.get('x-signup-webhook-secret') || ''), expected = Buffer.from(secret);
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return json({ error: 'unauthorized' }, 401);
    const cutoff = parseSignupCutoff(dependencies.enabledAt());
    if (!cutoff.ok) return json({ error: 'notification_cutoff_invalid' }, 503);

    const now = dependencies.now || Date.now;
    const startedAt = now();
    let scanned = 0, pages = 0, skipped = 0, notified = 0, failed = 0, anonymous = 0, emailMissing = 0;
    let complete = false;
    const candidates: string[] = [], seen = new Set<string>();
    try {
      for (let page = 1; page <= MAX_PAGES; page += 1) {
        if (now() - startedAt >= SCAN_BUDGET_MS) break;
        const { users } = await dependencies.listUsers(page, PER_PAGE);
        pages += 1;
        for (const user of users) {
          if (seen.has(user.id)) continue;
          seen.add(user.id); scanned += 1;
          const createdAt = Date.parse(user.created_at), age = now() - createdAt;
          const isAnonymous = isAnonymousSignup(user), email = user.email?.trim() || '';
          if (isAnonymous) anonymous += 1;
          if (!email) emailMissing += 1;
          if (isAnonymous || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)
            || !Number.isFinite(age) || age < 0 || age >= 86400000
            || (cutoff.at !== null && createdAt < cutoff.at) || user.app_metadata?.[dependencies.marker]) {
            skipped += 1;
          } else {
            candidates.push(user.id);
          }
        }
        if (users.length < PER_PAGE) { complete = true; break; }
        if (candidates.length >= MAX_CANDIDATES) break;
      }
      let attempted = 0;
      const selected = candidates.slice(0, MAX_CANDIDATES);
      // Two parallel requests, with time reserved for Auth read + provider + receipt.
      for (let offset = 0; offset < selected.length; offset += 2) {
        if (TOTAL_BUDGET_MS - (now() - startedAt) < BATCH_RESERVE_MS) break;
        const batch = selected.slice(offset, offset + 2);
        const outcomes = await Promise.all(batch.map(async userId => {
          try { return await dependencies.notify(userId); } catch { return { ok: false, status: 'failed' }; }
        }));
        attempted += batch.length;
        for (const result of outcomes) {
          if (!result.ok) failed += 1;
          else if (result.status === 'sent') notified += 1;
          else skipped += 1;
        }
      }
      const more = !complete || attempted < candidates.length || failed > 0;
      return json({ notified, skipped, failed, scanned, pages, anonymous, emailMissing, partial: more, more });
    } catch {
      return json({ error: 'notification_sweep_unavailable', notified, skipped, failed, scanned, pages, anonymous, emailMissing, partial: true, more: true }, 503);
    }
  };
}
