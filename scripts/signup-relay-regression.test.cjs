/* eslint-disable @typescript-eslint/no-require-imports -- Isolated Auth relay/provider fixtures. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const crypto = require('node:crypto');
const NOW = Date.parse('2026-11-04T10:00:00Z');
const ID = '11111111-1111-4111-8111-111111111111';
const CREATED_AT = new Date(NOW - 1000).toISOString();
const SECRET = 'fixture-relay-secret-that-is-at-least-forty-eight-bytes-long';

function load(relative) {
  const absolute = path.resolve(relative), mod = { exports: {} };
  const source = ts.transpileModule(fs.readFileSync(absolute, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(`(function(require,module,exports){${source}\n})`, {
    Response, Request, Headers, TextDecoder, Buffer, AbortSignal, Date, process: { env: {} },
  }, { filename: absolute })(name => {
    if (name === 'server-only') return {};
    if (name === 'node:crypto') return crypto;
    if (name === '@/lib/security/identity') return { PRIMARY_ADMIN_EMAIL: 'owner-default@example.com' };
    if (name.startsWith('.')) return load(path.resolve(path.dirname(absolute), `${name}.ts`));
    throw new Error(`Unexpected fixture dependency ${name}`);
  }, mod, mod.exports);
  return mod.exports;
}
const relay = load('src/lib/auth/signupRelay.ts');

function fixture(options = {}) {
  const calls = [];
  const config = { to: 'fixed-owner@example.com', from: 'ENICO VECK <fixed-sender@example.com>', resendApiKey: 'fixture-private-resend-key', ...options.config };
  const handler = relay.createSignupRelayHandler({ secret: () => options.secret ?? SECRET,
    enabledAt: () => options.enabledAt, config: () => config, now: () => NOW,
    fetcher: async (url, init) => { calls.push({ url, init }); return options.fetcher ? options.fetcher(url, init) : new Response('{"id":"fixture-provider-receipt"}'); },
  });
  return { handler, calls, config, request: (body = { site: 'mongsangin', userId: ID, createdAt: CREATED_AT }, secret = SECRET) =>
    new Request('https://enicoveck.com/api/auth/signup-relay', { method: 'POST', headers: { 'x-signup-relay-secret': secret }, body: JSON.stringify(body) }) };
}

test('relay requires its own long secret before any email configuration or request is used', async () => {
  const f = fixture();
  assert.equal((await f.handler(f.request(undefined, 'wrong'))).status, 401);
  assert.equal(f.calls.length, 0);
  const short = fixture({ secret: 'short' });
  assert.equal((await short.handler(short.request())).status, 503); assert.equal(short.calls.length, 0);
});

test('relay accepts only fixed-site UUID and ISO creation time with no recipient fields', async () => {
  for (const patch of [{ site: 'enico' }, { userId: 'invalid' }, { createdAt: 'invalid' }, { createdAt: '2026-02-30T10:00:00Z' },
    { from: 'attacker@example.com' }, { to: 'attacker@example.com' }, { email: 'member@example.com' }, { html: 'injected' }]) {
    const f = fixture();
    assert.equal((await f.handler(f.request({ site: 'mongsangin', userId: ID, createdAt: CREATED_AT, ...patch }))).status, 400);
    assert.equal(f.calls.length, 0);
  }
  const large = fixture();
  assert.equal((await large.handler(large.request({ padding: 'x'.repeat(17000) }))).status, 413);
});

test('relay refuses old, future and before-enabled signup timestamps; invalid cutoff fails closed', async () => {
  for (const createdAt of [new Date(NOW + 1000).toISOString(), new Date(NOW - 86400000).toISOString()]) {
    const f = fixture(); assert.equal((await f.handler(f.request({ site: 'mongsangin', userId: ID, createdAt }))).status, 400); assert.equal(f.calls.length, 0);
  }
  const before = fixture({ enabledAt: new Date(NOW).toISOString() });
  assert.equal((await before.handler(before.request())).status, 400); assert.equal(before.calls.length, 0);
  const invalid = fixture({ enabledAt: 'invalid' });
  assert.equal((await invalid.handler(invalid.request())).status, 503); assert.equal(invalid.calls.length, 0);
});

test('relay uses only fixed server config and the exact stable Mongsangin message/key', async () => {
  const f = fixture();
  const response = await f.handler(f.request());
  assert.equal(response.status, 200); assert.deepEqual(await response.json(), { id: 'fixture-provider-receipt' });
  const { url, init } = f.calls[0];
  assert.equal(url, 'https://api.resend.com/emails'); assert.equal(init.redirect, 'error');
  assert.equal(init.headers['Idempotency-Key'], `mongsangin-signup/${ID}`);
  const message = JSON.parse(init.body);
  assert.deepEqual(message.to, ['fixed-owner@example.com']); assert.equal(message.from, f.config.from);
  assert.ok(message.text.includes(ID)); assert.ok(!message.text.includes('fixture-private-resend-key'));
  await f.handler(f.request());
  assert.equal(f.calls[0].init.headers['Idempotency-Key'], f.calls[1].init.headers['Idempotency-Key']);
  assert.equal(f.calls[0].init.body, f.calls[1].init.body);
});

test('relay validates provider receipt and never returns role, auth or provider error contents', async () => {
  for (const [body, status] of [['{}', 200], ['{"id":" "}', 200], ['not-json', 200], ['{"message":"private role error"}', 403], ['{"message":"private outage"}', 503]]) {
    const f = fixture({ fetcher: async () => new Response(body, { status }) });
    const response = await f.handler(f.request());
    assert.ok(response.status >= 500); assert.ok(!(await response.text()).includes('private'));
  }
  const network = fixture({ fetcher: async () => { throw new Error('private secret network info'); } });
  assert.equal((await network.handler(network.request())).status, 503);
  for (const config of [{ resendApiKey: '' }, { to: 'bad-recipient' }, { from: 'Sender\nBcc: attacker@example.com' }]) {
    const f = fixture({ config }); assert.equal((await f.handler(f.request())).status, 503); assert.equal(f.calls.length, 0);
  }
});

test('relay preserves the fixed Mongsangin email contract without requiring another repository', () => {
  const config = { to: 'owner@example.com', from: 'Sender <sender@example.com>' };
  const expected = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/mongsangin-signup-email.json'), 'utf8'));
  assert.equal(JSON.stringify(relay.buildMongsanginSignupRelayEmail(ID, CREATED_AT, config)), JSON.stringify(expected));
});
