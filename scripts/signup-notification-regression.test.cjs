/* eslint-disable @typescript-eslint/no-require-imports -- Network-free Auth/provider fixtures. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const ts = require('typescript');

const id = '11111111-1111-4111-8111-111111111111';
const secret = 'fixture-webhook-secret-with-at-least-32-characters';
const NOW = Date.parse('2026-11-04T10:00:00Z');
class FixtureDate extends Date {
  constructor(...args) { super(...(args.length ? args : [NOW])); }
  static now() { return NOW; }
}

function fixture(options = {}) {
  let user = { id, email: 'new-member@example.com', created_at: new Date(NOW - 1000).toISOString(),
    email_confirmed_at: null, is_anonymous: false, app_metadata: { provider: 'email' }, user_metadata: {}, ...options.user };
  const env = { RESEND_API_KEY: 'fixture-private-api-key', SIGNUP_NOTIFICATION_WEBHOOK_SECRET: secret,
    AUTH_FROM_EMAIL: 'ENICO VECK <auth@example.com>', ORDER_NOTIFICATION_EMAIL: 'owner@example.com', ...options.env };
  const calls = [];
  const updates = [];
  const lookups = [];
  const budgets = [];
  const deferred = [];
  const client = { auth: { admin: {
    async getUserById(target) { lookups.push(target); return { data: { user }, error: options.authError || null }; },
    async updateUserById(target, patch) {
      updates.push({ target, patch });
      if (options.saveFailures > 0) { options.saveFailures -= 1; return { error: new Error('private database error') }; }
      user = { ...user, app_metadata: { ...user.app_metadata, ...patch.app_metadata } };
      return { data: { user }, error: null };
    },
  } } };
  const cache = new Map();
  function load(relative) {
    const absolute = path.resolve(relative);
    if (cache.has(absolute)) return cache.get(absolute).exports;
    const mod = { exports: {} }; cache.set(absolute, mod);
    const source = ts.transpileModule(fs.readFileSync(absolute, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    vm.runInNewContext(`(function(require,module,exports){${source}\n})`, {
      process: { env }, Buffer, AbortSignal, Date: FixtureDate, TextDecoder, Request, Response, Headers, URL,
      fetch: async (url, config) => {
        calls.push({ url, config });
        return options.fetch ? options.fetch(calls.length, config) : new Response(JSON.stringify({ id: 'fixture-email-id' }));
      },
    }, { filename: absolute })(name => {
      if (name === 'server-only') return {};
      if (name === 'node:crypto') return crypto;
      if (name === 'next/server') return { NextResponse: Response, after: callback => deferred.push(callback) };
      if (name === 'next/headers') return { cookies: async () => ({ getAll: () => [], set() {} }) };
      if (name === '@/lib/supabaseAdmin') return { getSupabaseAdminClient: () => client };
      if (name === '@/lib/security/identity') return {
        PRIMARY_ADMIN_EMAIL: 'owner-default@example.com',
        isVerifiedMember: candidate => Boolean(candidate && candidate.email && candidate.email_confirmed_at && !candidate.is_anonymous),
        safeRedirectPath: relative => relative || '/',
      };
      if (name === '@/lib/unified-admin') return { getUnifiedAdminUrl: () => 'https://admin.example.com/?site=enico&view=members' };
      if (name === '@/lib/supabase/projectGuard') return { assertExpectedSupabaseProject: () => 'https://fixture.supabase.co' };
      if (name === '@/lib/security/requestBudget') return { requestBudget: async (...args) => { budgets.push(args); return options.blocked ? Response.json({}, { status: 429 }) : null; } };
      if (name === '@supabase/supabase-js') return { createClient: () => ({ auth: { getUser: async () => ({ data: { user }, error: null }) } }) };
      if (name === '@supabase/ssr') return { createServerClient: () => ({ auth: {
        exchangeCodeForSession: async () => ({ data: { user }, error: options.callbackError || null }),
        verifyOtp: async () => ({ data: { user }, error: options.callbackError || null }),
      } }) };
      if (name.startsWith('@/')) return load(path.join('src', `${name.slice(2)}.ts`));
      if (name.startsWith('./') || name.startsWith('../')) return load(path.resolve(path.dirname(absolute), `${name}.ts`));
      throw new Error(`Unexpected fixture import ${name}`);
    }, mod, mod.exports);
    return mod.exports;
  }
  return { load, calls, updates, lookups, budgets, deferred, env, user: () => user,
    patchUser: patch => { user = { ...user, ...patch }; } };
}

test('anonymous chat visitors, missing email, future/old dates do not send signup mail', async () => {
  for (const user of [{ is_anonymous: true }, { is_anonymous: undefined, app_metadata: { provider: 'anonymous' } },
    { is_anonymous: undefined, app_metadata: { providers: ['anonymous'] } }, { email: '' },
    { created_at: 'invalid-date' }, { created_at: new Date(NOW + 5000).toISOString() },
    { created_at: new Date(NOW - 86400001).toISOString() }]) {
    const f = fixture({ user });
    const result = await f.load('src/lib/auth/signupNotification.ts').notifySignup(id);
    assert.equal(result.status, 'skipped'); assert.equal(f.calls.length, 0); assert.equal(f.updates.length, 0);
  }
});

test('canonical registered flag overrides stale anonymous provider metadata after signup conversion', async () => {
  const f = fixture({ user: { is_anonymous: false, app_metadata: { provider: 'anonymous', providers: ['anonymous', 'email'] } } });
  assert.equal((await f.load('src/lib/auth/signupNotification.ts').notifySignup(id)).status, 'sent');
});

test('enabled-at cutoff skips earlier accounts and rejects invalid configuration before lookup', async () => {
  const f = fixture({ env: { SIGNUP_NOTIFICATION_ENABLED_AT: new Date(NOW).toISOString() } });
  assert.equal((await f.load('src/lib/auth/signupNotification.ts').notifySignup(id)).status, 'skipped');
  assert.equal(f.calls.length, 0);
  for (const cutoff of ['', 'not-a-date', '2026-02-30T10:00:00Z']) {
    const invalid = fixture({ env: { SIGNUP_NOTIFICATION_ENABLED_AT: cutoff } });
    assert.equal((await invalid.load('src/lib/auth/signupNotification.ts').notifySignup(id)).code, 'SIGNUP_CUTOFF_INVALID');
    assert.equal(invalid.lookups.length, 0); assert.equal(invalid.calls.length, 0);
  }
});

test('new unconfirmed signup is sent to configured administrator and marked server-side', async () => {
  const f = fixture({ user: { user_metadata: { full_name: 'PRIVATE MEMBER', phone: 'PRIVATE PHONE' } } });
  const { notifySignup } = f.load('src/lib/auth/signupNotification.ts');
  assert.equal((await notifySignup(id)).status, 'sent');
  assert.equal(f.calls.length, 1); assert.equal(f.updates.length, 1);
  const { url, config } = f.calls[0];
  assert.equal(url, 'https://api.resend.com/emails'); assert.equal(config.redirect, 'error');
  assert.match(config.headers['Idempotency-Key'], /^enico-signup\/[a-f0-9]{64}$/);
  const body = JSON.parse(config.body);
  assert.deepEqual(body.to, ['owner@example.com']);
  assert.ok(body.text.includes(id)); assert.ok(body.text.includes('https://admin.example.com/'));
  assert.ok(!config.body.includes('PRIVATE MEMBER')); assert.ok(!config.body.includes('PRIVATE PHONE'));
  assert.ok(!config.body.includes('new-member@example.com'));
  assert.ok(f.updates[0].patch.app_metadata.signup_admin_notification_sent_at);
  assert.equal(f.updates[0].patch.app_metadata.signup_admin_notification_provider_id, 'fixture-email-id');
  assert.equal((await notifySignup(id)).status, 'already_sent'); assert.equal(f.calls.length, 1);
});

test('user-editable metadata cannot spoof the server-owned sent marker', async () => {
  const f = fixture({ user: { user_metadata: { signup_admin_notification_sent_at: 'spoofed' } } });
  assert.equal((await f.load('src/lib/auth/signupNotification.ts').notifySignup(id)).status, 'sent');
  assert.equal(f.calls.length, 1);
});

test('temporary provider failure and contact edits safely retry identical event body and key', async () => {
  const f = fixture({ fetch: n => new Response(JSON.stringify(n === 1 ? { message: 'private failure detail' } : { id: 'retry-email' }), { status: n === 1 ? 503 : 200 }) });
  const { notifySignup } = f.load('src/lib/auth/signupNotification.ts');
  const failure = await notifySignup(id);
  assert.equal(failure.status, 'retryable'); assert.equal(f.updates.length, 0);
  assert.ok(!JSON.stringify(failure).includes('private failure detail'));
  f.patchUser({ user_metadata: { full_name: 'edited name', phone: 'edited phone' } });
  assert.equal((await notifySignup(id)).status, 'sent');
  assert.equal(f.calls[0].config.headers['Idempotency-Key'], f.calls[1].config.headers['Idempotency-Key']);
  assert.equal(f.calls[0].config.body, f.calls[1].config.body);
});

test('uncertain send or failed receipt save remains retryable using same provider key', async () => {
  const f = fixture({ saveFailures: 1 });
  const { notifySignup } = f.load('src/lib/auth/signupNotification.ts');
  assert.equal((await notifySignup(id)).code, 'RECEIPT_SAVE_FAILED');
  assert.equal((await notifySignup(id)).status, 'sent');
  assert.equal(f.calls[0].config.body, f.calls[1].config.body);
  assert.equal(f.calls[0].config.headers['Idempotency-Key'], f.calls[1].config.headers['Idempotency-Key']);
  const unknown = fixture({ fetch: async () => { throw new Error('private network data'); } });
  const result = await unknown.load('src/lib/auth/signupNotification.ts').notifySignup(id);
  assert.equal(result.status, 'retryable'); assert.ok(!JSON.stringify(result).includes('private network data'));
});

test('invalid configuration and explicit provider rejection never mark signup as sent', async () => {
  for (const env of [{ RESEND_API_KEY: '' }, { AUTH_FROM_EMAIL: 'invalid\nBcc: attacker@example.com' }, { SIGNUP_NOTIFICATION_EMAIL: 'bad-address' }]) {
    const f = fixture({ env });
    assert.equal((await f.load('src/lib/auth/signupNotification.ts').notifySignup(id)).status, 'not_configured');
    assert.equal(f.calls.length, 0); assert.equal(f.updates.length, 0);
  }
  const f = fixture({ fetch: async () => new Response('{}', { status: 422 }) });
  assert.equal((await f.load('src/lib/auth/signupNotification.ts').notifySignup(id)).status, 'rejected');
  assert.equal(f.updates.length, 0);
});

test('malformed successful provider receipts remain retryable and never mark the signup', async () => {
  for (const body of ['{}', '{"id":null}', '{"id":" "}', 'not-json']) {
    const f = fixture({ fetch: async () => new Response(body) });
    assert.equal((await f.load('src/lib/auth/signupNotification.ts').notifySignup(id)).code, 'RESEND_OUTCOME_UNKNOWN');
    assert.equal(f.updates.length, 0);
  }
});

function webhook(headers = {}, body = { type: 'INSERT', schema: 'auth', table: 'users', record: { id } }) {
  return new Request('https://store.example.com/api/auth/signup-webhook', { method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
}

test('signup webhook authenticates before parsing or fetching any member', async () => {
  const f = fixture(); const { POST } = f.load('src/app/api/auth/signup-webhook/route.ts');
  for (const headers of [{}, { 'x-signup-webhook-secret': 'wrong-secret' }]) {
    assert.equal((await POST(webhook(headers))).status, 401);
  }
  assert.equal(f.lookups.length, 0); assert.equal(f.calls.length, 0);
  const absent = fixture({ env: { SIGNUP_NOTIFICATION_WEBHOOK_SECRET: '' } });
  assert.equal((await absent.load('src/app/api/auth/signup-webhook/route.ts').POST(webhook())).status, 503);
});

test('signed webhook validates event and ID, ignores forged member fields and bounds JSON', async () => {
  const f = fixture(); const { POST } = f.load('src/app/api/auth/signup-webhook/route.ts');
  const headers = { 'x-signup-webhook-secret': secret };
  const response = await POST(webhook(headers, { type: 'INSERT', schema: 'auth', table: 'users',
    record: { id, email: 'forged@example.com', is_anonymous: true, to: 'attacker@example.com' } }));
  assert.equal(response.status, 200); assert.deepEqual(f.lookups, [id]);
  assert.ok(!f.calls[0].config.body.includes('forged@example.com'));
  for (const body of [{ type: 'UPDATE', schema: 'auth', table: 'users', record: { id } },
    { type: 'INSERT', schema: 'public', table: 'users', record: { id } },
    { type: 'INSERT', schema: 'auth', table: 'users', record: { id: 'bad-id' } }]) {
    assert.equal((await POST(webhook(headers, body))).status, 400);
  }
  assert.equal((await POST(webhook(headers, { padding: 'x'.repeat(17000) }))).status, 413);
});

test('browser notification requires verified account and uses a retry budget instead of day-long preclaim', async () => {
  const f = fixture(); const { POST } = f.load('src/app/api/auth/signup-notify/route.ts');
  const request = () => new Request('https://store.example.com/api/auth/signup-notify', { method: 'POST', headers: { Authorization: 'Bearer fixture' } });
  assert.equal((await POST(new Request('https://store.example.com', { method: 'POST' }))).status, 401);
  assert.equal((await POST(request())).status, 401);
  f.patchUser({ email_confirmed_at: new Date().toISOString() });
  assert.equal((await POST(request())).status, 200);
  assert.equal(f.budgets[0][1], 'signup-notify-retry');
  assert.equal(f.budgets[0][2], 6); assert.equal(f.budgets[0][3], 60);
});

test('successful code and OTP callbacks redirect before background Auth lookup or mail', async () => {
  for (const query of ['code=fixture-code', 'token_hash=fixture-token&type=signup']) {
    const f = fixture();
    const { GET } = f.load('src/app/auth/callback/route.ts');
    const response = await GET(new Request(`https://store.example.com/auth/callback?${query}`));
    assert.equal(response.headers.get('Location'), 'https://store.example.com/');
    assert.equal(f.deferred.length, 1); assert.equal(f.lookups.length, 0); assert.equal(f.calls.length, 0);
    await f.deferred[0]();
    assert.equal(f.calls.length, 1);
  }
});

test('failed authentication callback never schedules signup notification', async () => {
  const f = fixture({ callbackError: new Error('fixture authentication failure') });
  const { GET } = f.load('src/app/auth/callback/route.ts');
  const response = await GET(new Request('https://store.example.com/auth/callback?code=fixture-code'));
  assert.ok(response.headers.get('Location').endsWith('/?auth_error=1'));
  assert.equal(f.deferred.length, 0); assert.equal(f.calls.length, 0);
});
