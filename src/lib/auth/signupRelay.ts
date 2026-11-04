import 'server-only';
import { timingSafeEqual } from 'node:crypto';
import { parseSignupCutoff } from './signupEligibility';
import { readJsonObject, RequestBodyError } from '../security/requestBody';
import { PRIMARY_ADMIN_EMAIL } from '@/lib/security/identity';

type Config = { to: string; from: string; resendApiKey: string };
type Dependencies = {
  secret: () => string | undefined;
  enabledAt: () => string | undefined;
  config: () => Config;
  fetcher?: typeof fetch;
  now?: () => number;
};
const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';
const isEmail = (value: string) => value.length <= 254 && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(value);
const isSender = (value: string) => {
  if (/[\r\n]/.test(value)) return false;
  const wrapped = value.match(/^[^<>]*<([^<>]+)>$/);
  return isEmail((wrapped ? wrapped[1] : value).trim());
};
const escapeHtml = (value: string) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');

/** No credentials are exported to the caller or the other storefront. */
export function getSignupRelayConfig(): Config {
  return {
    to: text(process.env.SIGNUP_NOTIFICATION_EMAIL) || text(process.env.ORDER_NOTIFICATION_EMAIL) || PRIMARY_ADMIN_EMAIL,
    from: text(process.env.ORDER_FROM_EMAIL) || text(process.env.AUTH_FROM_EMAIL) || 'ENICO VECK Auth <onboarding@resend.dev>',
    resendApiKey: text(process.env.RESEND_API_KEY),
  };
}

/** This immutable content must stay identical to Mongsangin's direct sender. */
export function buildMongsanginSignupRelayEmail(userId: string, createdAt: string, config: Pick<Config, 'to' | 'from'>) {
  const message = ['몽상인에 신규 회원이 가입했습니다.', `회원 ID: ${userId}`, `가입 시각: ${createdAt}`, '',
    '회원 정보 확인: https://enico-mongsangin-admin.vercel.app/?site=mongsangin&view=members'].join('\n');
  return { from: config.from, to: [config.to], subject: '[몽상인] 신규 회원가입 알림', text: message,
    html: `<div lang="ko" style="font-family:Arial,sans-serif;line-height:1.6"><h2>신규 회원가입</h2><p style="white-space:pre-wrap">${escapeHtml(message)}</p></div>` };
}

export function createSignupRelayHandler(dependencies: Dependencies) {
  return async (request: Request) => {
    const json = (value: Record<string, string | boolean>, status = 200) =>
      Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } });
    const secret = text(dependencies.secret());
    if (Buffer.byteLength(secret) < 48) return json({ error: 'relay_not_configured' }, 503);
    const actual = Buffer.from(request.headers.get('x-signup-relay-secret') || ''), expected = Buffer.from(secret);
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return json({ error: 'unauthorized' }, 401);
    try {
      const cutoff = parseSignupCutoff(dependencies.enabledAt());
      if (!cutoff.ok) return json({ error: 'notification_cutoff_invalid' }, 503);
      const body = await readJsonObject(request, 16 * 1024);
      if (Object.keys(body).some(key => !['site', 'userId', 'createdAt'].includes(key)) || body.site !== 'mongsangin'
        || typeof body.userId !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(body.userId)
        || typeof body.createdAt !== 'string') return json({ error: 'invalid_relay_event' }, 400);
      const creation = parseSignupCutoff(body.createdAt);
      if (!creation.ok || creation.at === null) return json({ error: 'invalid_event_time' }, 400);
      const age = (dependencies.now || Date.now)() - creation.at;
      if (age < 0 || age >= 86400000 || (cutoff.at !== null && creation.at < cutoff.at)) return json({ error: 'event_outside_signup_window' }, 400);
      const config = dependencies.config();
      if (!config.resendApiKey || !isEmail(config.to) || !isSender(config.from)) return json({ error: 'email_not_configured' }, 503);
      const response = await (dependencies.fetcher || fetch)('https://api.resend.com/emails', {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10_000),
        headers: { Authorization: `Bearer ${config.resendApiKey}`, 'Content-Type': 'application/json',
          'Idempotency-Key': `mongsangin-signup/${body.userId}` },
        body: JSON.stringify(buildMongsanginSignupRelayEmail(body.userId, body.createdAt, config)),
      });
      if (!response.ok) return json({ error: 'relay_email_unavailable' }, response.status === 429 || response.status === 409 || response.status >= 500 ? 503 : 502);
      const receipt = await response.json().catch(() => null) as { id?: unknown } | null;
      if (!receipt || typeof receipt.id !== 'string' || !receipt.id.trim()) return json({ error: 'relay_outcome_unknown' }, 503);
      return json({ id: receipt.id });
    } catch (error) {
      return json({ error: 'signup_relay_unavailable' }, error instanceof RequestBodyError ? error.status : 503);
    }
  };
}
