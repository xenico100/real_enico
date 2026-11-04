import 'server-only';

import { createHash } from 'node:crypto';
import { getSupabaseAdminClient } from '@/lib/supabaseAdmin';
import { PRIMARY_ADMIN_EMAIL } from '@/lib/security/identity';
import { getUnifiedAdminUrl } from '@/lib/unified-admin';
import { isAnonymousSignup, parseSignupCutoff } from './signupEligibility';

const MAX_SIGNUP_AGE_MS = 24 * 60 * 60 * 1000;
const SENT_MARKER = 'signup_admin_notification_sent_at';

export type SignupNotificationResult =
  | { ok: true; status: 'sent' | 'already_sent' | 'skipped' }
  | { ok: false; status: 'not_configured' | 'retryable' | 'rejected'; code: string };

function text(value: unknown) { return typeof value === 'string' ? value.trim() : ''; }
function isEmail(value: string) {
  return value.length <= 254 && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(value);
}
function isSender(value: string) {
  if (/[\r\n]/.test(value)) return false;
  const wrapped = value.match(/^[^<>]*<([^<>]+)>$/);
  return isEmail((wrapped ? wrapped[1] : value).trim());
}

/** Shared by the database webhook, confirmation callback and browser retry.
 * Identity always comes from Auth, never member fields supplied by the caller. */
export async function notifySignup(userId: string): Promise<SignupNotificationResult> {
  try {
    const cutoff = parseSignupCutoff(process.env.SIGNUP_NOTIFICATION_ENABLED_AT);
    if (!cutoff.ok) return { ok: false, status: 'not_configured', code: 'SIGNUP_CUTOFF_INVALID' };
    const client = getSupabaseAdminClient({ timeoutMs: 5_000 });
    const { data, error } = await client.auth.admin.getUserById(userId);
    if (error || !data.user) return { ok: false, status: 'retryable', code: 'AUTH_LOOKUP_FAILED' };
    const user = data.user;
    const createdAt = Date.parse(user.created_at);
    const age = Date.now() - createdAt;
    if (isAnonymousSignup(user) || !isEmail(text(user.email)) || !Number.isFinite(age) || age < 0 || age >= MAX_SIGNUP_AGE_MS
      || (cutoff.at !== null && createdAt < cutoff.at)) return { ok: true, status: 'skipped' };
    if (text(user.app_metadata?.[SENT_MARKER])) return { ok: true, status: 'already_sent' };

    const apiKey = text(process.env.RESEND_API_KEY);
    const to = text(process.env.SIGNUP_NOTIFICATION_EMAIL) || text(process.env.ORDER_NOTIFICATION_EMAIL) || PRIMARY_ADMIN_EMAIL;
    const from = text(process.env.AUTH_FROM_EMAIL) || text(process.env.ORDER_FROM_EMAIL)
      || 'ENICO VECK Auth <onboarding@resend.dev>';
    if (!apiKey || !isEmail(to) || !isSender(from)) return { ok: false, status: 'not_configured', code: 'EMAIL_CONFIG_MISSING' };

    // Keep event content immutable: editing a name/contact between retries must
    // not invalidate the provider's idempotency key. Details stay behind admin auth.
    const body = {
      from, to: [to], subject: '[ENICO VECK] 신규 회원가입',
      text: ['에니코 벡에 새 회원이 가입했습니다.', '', `회원 ID: ${user.id}`,
        `가입 시각: ${new Date(createdAt).toISOString()}`, '',
        `회원 정보 확인: ${getUnifiedAdminUrl('enico', 'members') || 'https://enico-mongsangin-admin.vercel.app/?site=enico&view=members'}`].join('\n'),
    };
    const idempotencyKey = `enico-signup/${createHash('sha256').update(user.id).digest('hex')}`;
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10_000),
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify(body),
    });
    if (!response.ok) return {
      ok: false, status: response.status === 429 || response.status === 409 || response.status >= 500 ? 'retryable' : 'rejected',
      code: `RESEND_HTTP_${response.status}`,
    };
    const receipt = await response.json().catch(() => null) as { id?: unknown } | null;
    if (!receipt || typeof receipt.id !== 'string' || !receipt.id.trim()) return { ok: false, status: 'retryable', code: 'RESEND_OUTCOME_UNKNOWN' };
    // Auth merges these server-owned app_metadata keys. A failed save remains
    // retryable using exactly the same provider key and immutable payload.
    const { error: saveError } = await client.auth.admin.updateUserById(user.id, {
      app_metadata: { [SENT_MARKER]: new Date().toISOString(), signup_admin_notification_provider_id: receipt.id },
    });
    if (saveError) return { ok: false, status: 'retryable', code: 'RECEIPT_SAVE_FAILED' };
    return { ok: true, status: 'sent' };
  } catch {
    return { ok: false, status: 'retryable', code: 'SIGNUP_NOTIFICATION_UNAVAILABLE' };
  }
}
