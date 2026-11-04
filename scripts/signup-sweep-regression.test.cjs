/* eslint-disable @typescript-eslint/no-require-imports -- Network-free sweep fixtures. */
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const crypto = require('node:crypto');
function load(file) {
  const absolute = path.resolve(file);
  const mod = { exports: {} };
  const source = ts.transpileModule(fs.readFileSync(absolute, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(`(function(require,module,exports){${source}\n})`, { Response, Buffer, Date }, { filename: absolute })(
    name => name === 'node:crypto' ? crypto : load(path.resolve(path.dirname(absolute), `${name}.ts`)), mod, mod.exports);
  return mod.exports;
}
const { createSignupSweepHandler } = load('src/lib/auth/signupSweep.ts');
const NOW = Date.parse('2026-11-04T10:00:00Z');
const SECRET = 'fixture-sweep-secret-with-at-least-32-characters';
const member = (id, patch = {}) => ({ id, email: `${id}@example.com`, is_anonymous: false,
  created_at: new Date(NOW - 1000).toISOString(), app_metadata: {}, ...patch });

function fixture(options = {}) {
  const calls = { pages: [], users: [], active: 0, maxActive: 0 };
  const handler = createSignupSweepHandler({
    secret: () => SECRET, enabledAt: () => options.enabledAt, marker: 'sent',
    now: () => NOW + (options.elapsed?.() || 0),
    listUsers: async (page, perPage) => {
      calls.pages.push([page, perPage]);
      if (options.listError) throw new Error('private database contents');
      return { users: options.page ? options.page(page) : options.users || [] };
    },
    notify: async id => {
      calls.users.push(id); calls.active++; calls.maxActive = Math.max(calls.maxActive, calls.active);
      try { await Promise.resolve(); return options.notify ? await options.notify(id) : { ok: true, status: 'sent' }; }
      finally { calls.active--; }
    }
  });
  return { calls, handler, request: (secret = SECRET) => new Request('https://app.example.com/api/auth/signup-sweep',
    { method: 'POST', headers: { 'x-signup-webhook-secret': secret } }) };
}

test('sweep authenticates and validates cutoff before querying users', async () => {
  const f = fixture();
  assert.equal((await f.handler(f.request('wrong'))).status, 401);
  assert.equal(f.calls.pages.length, 0);
  const bad = fixture({ enabledAt: 'invalid-cutoff' });
  assert.equal((await bad.handler(bad.request())).status, 503);
  assert.equal(bad.calls.pages.length, 0);
});

test('sweep skips anonymous, old, malformed, already-notified and pre-cutoff accounts', async () => {
  const f = fixture({ enabledAt: new Date(NOW - 2000).toISOString(), users: [
    member('regular'), member('converted', { app_metadata: { provider: 'anonymous', providers: ['anonymous', 'email'] } }),
    member('anonymous', { is_anonymous: true }), member('legacy-anonymous', { is_anonymous: undefined, app_metadata: { provider: 'anonymous' } }),
    member('no-email', { email: '' }), member('old', { created_at: new Date(NOW - 86400000).toISOString() }),
    member('invalid', { created_at: 'bad-date' }), member('future', { created_at: new Date(NOW + 1000).toISOString() }),
    member('marked', { app_metadata: { sent: 'already' } }), member('before-enabled', { created_at: new Date(NOW - 3000).toISOString() })
  ] });
  const response = await f.handler(f.request());
  const result = await response.json();
  assert.equal(response.status, 200); assert.equal(result.notified, 2); assert.equal(result.skipped, 8);
  assert.equal(result.anonymous, 2); assert.equal(result.emailMissing, 1);
  assert.equal(result.partial, false); assert.deepEqual(f.calls.users, ['regular', 'converted']);
  assert.ok(!JSON.stringify(result).includes('example.com')); assert.ok(!JSON.stringify(result).includes('converted'));
});

test('sweep processes at most ten candidates with concurrency two and reports remaining work', async () => {
  const f = fixture({ users: Array.from({ length: 12 }, (_, n) => member(`member-${n}`)) });
  const result = await (await f.handler(f.request())).json();
  assert.equal(result.notified, 10); assert.equal(f.calls.users.length, 10); assert.equal(f.calls.maxActive, 2);
  assert.equal(result.more, true); assert.equal(result.partial, true);
});

test('sweep caps full pagination at twenty pages and never claims a complete scan', async () => {
  const f = fixture({ page: page => Array.from({ length: 1000 }, (_, n) => member(`p${page}-${n}`, { created_at: new Date(NOW - 90000000).toISOString() })) });
  const result = await (await f.handler(f.request())).json();
  assert.equal(f.calls.pages.length, 20); assert.equal(result.scanned, 20000); assert.equal(result.pages, 20);
  assert.ok(f.calls.pages.every(([, perPage]) => perPage === 1000));
  assert.equal(result.partial, true); assert.equal(result.more, true); assert.equal(result.notified, 0);
});

test('sweep preserves failed attempts for later retry and emits only safe count fields', async () => {
  const f = fixture({ users: [member('member-1'), member('member-2')], notify: async () => { throw new Error('private provider contents'); } });
  const result = await (await f.handler(f.request())).json();
  assert.equal(result.failed, 2); assert.equal(result.more, true); assert.equal(result.notified, 0);
  assert.ok(!JSON.stringify(result).includes('private')); assert.ok(!JSON.stringify(result).includes('member-1'));
  const unavailable = fixture({ listError: true });
  const response = await unavailable.handler(unavailable.request());
  assert.equal(response.status, 503); assert.ok(!(await response.text()).includes('private database contents'));
});

test('sweep stops before another slow batch can exceed its remaining runtime budget', async () => {
  let elapsed = 0;
  const f = fixture({ users: Array.from({ length: 10 }, (_, n) => member(`member-${n}`)),
    elapsed: () => elapsed, notify: async () => { elapsed += 13000; return { ok: true, status: 'sent' }; } });
  const result = await (await f.handler(f.request())).json();
  assert.equal(result.notified, 2); assert.equal(result.partial, true); assert.equal(result.more, true);
});
