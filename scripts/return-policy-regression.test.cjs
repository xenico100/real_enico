/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { createRequire } = require('node:module');
const nativeRequire = createRequire(path.resolve('package.json'));
const cache = new Map();
const owner = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', email: 'fixture@example.com', email_confirmed_at: '2026-01-01', is_anonymous: false };
let user = owner;
let row;
let beforeUpdate;
let readError;
let saveError;
let writes;
let updateFilters;
let clientCalls;

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://gkfupegrduencknzpzok.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'fixture-only';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'fixture-only';

function field(current, key) {
  return key === 'raw_payload->>customerUserId' ? current.raw_payload?.customerUserId ?? null : current[key];
}
function query(changes) {
  const predicates = [];
  const filter = (key, value) => {
    if (changes) updateFilters.push([key, value]);
    predicates.push(current => key === 'raw_payload' ? JSON.stringify(current.raw_payload) === value : field(current, key) === value);
    return q;
  };
  const q = {
    select: () => q,
    eq: filter,
    is: (key, value) => { predicates.push(current => field(current, key) === value); return q; },
    async maybeSingle() {
      if (changes && beforeUpdate) { const change = beforeUpdate; beforeUpdate = null; change(); }
      if (changes ? saveError : readError) return { data: null, error: { message: 'SECRET_DATABASE_ERROR' } };
      const found = row && predicates.every(predicate => predicate(row));
      if (found && changes) { writes.push(structuredClone(changes)); Object.assign(row, changes); }
      return { data: found ? structuredClone(row) : null, error: null };
    },
  };
  return q;
}
function load(file) {
  const absolute = path.resolve(file);
  if (cache.has(absolute)) return cache.get(absolute).exports;
  const mod = { exports: {} };
  cache.set(absolute, mod);
  const compiled = ts.transpileModule(fs.readFileSync(absolute, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  function requireMock(name) {
    if (/notifications|nicepayCancel|notificationProviders/.test(name)) throw new Error('Return requests must not notify or refund');
    if (name === '@supabase/supabase-js') return { createClient: () => {
      clientCalls += 1;
      return { auth: { getUser: async () => ({ data: { user }, error: null }) },
        from: () => ({ select: () => query(), update: changes => query(changes) }) };
    } };
    if (name.startsWith('.')) return load(path.join(path.dirname(absolute), name) + '.ts');
    if (name.startsWith('@/')) return load(path.resolve('src', name.slice(2)) + '.ts');
    return nativeRequire(name);
  }
  vm.runInThisContext(`(function(require,module,exports){${compiled}\n})`, { filename: absolute })(requireMock, mod, mod.exports);
  return mod.exports;
}
const policy = load('src/lib/orders/returnPolicy.ts');
const route = load('src/app/api/orders/my/return/route.ts');
const DAY = 86400000;
const NOW = Date.parse('2026-10-24T12:00:00.000Z');
function fixture(overrides = {}) {
  return { id: 'fixture-order', channel: 'member', payment_method: 'bank_transfer', payment_status: 'transfer_confirmed',
    shipping_status: 'delivered', delivered_at: new Date(Date.now() - DAY).toISOString(),
    raw_payload: { customerUserId: owner.id, notifications: { preserved: true } }, ...overrides };
}
function reset(overrides = {}) {
  row = fixture(overrides); user = owner; beforeUpdate = null; readError = false; saveError = false;
  writes = []; updateFilters = []; clientCalls = 0;
}
function request(body = { id: 'fixture-order', reason: '합성 테스트 사유' }, authorized = true) {
  return new Request('https://enicoveck.com/api/orders/my/return', { method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(authorized ? { Authorization: 'Bearer fixture-only' } : {}) },
    body: JSON.stringify(body) });
}

test('ordinary return eligibility includes exactly seven days and ends immediately after', () => {
  const order = fixture({ delivered_at: new Date(NOW - 7 * DAY).toISOString() });
  assert.equal(policy.getReturnEligibility(order, NOW).eligible, true);
  assert.equal(policy.getReturnEligibility(order, NOW).deadline, new Date(NOW).toISOString());
  assert.equal(policy.getReturnEligibility(order, NOW + 1).reason, 'window_elapsed');
});

test('eligibility requires delivered state and method-specific confirmed payment', () => {
  for (const shipping_status of ['preparing', 'shipping', 'unknown', null]) {
    assert.equal(policy.getReturnEligibility(fixture({ shipping_status })).reason, 'not_delivered');
  }
  for (const [payment_method, payment_status] of [['bank_transfer', 'pending_transfer'], ['bank_transfer', 'paid'], ['nicepay', 'captured'],
    ['paypal', 'paid'], ['unknown', 'paid'], ['nicepay', 'refund_pending'], ['paypal', 'cancelled']]) {
    assert.equal(policy.getReturnEligibility(fixture({ payment_method, payment_status })).reason, 'payment_unconfirmed');
  }
  for (const [payment_method, payment_status] of [['bank_transfer', 'transfer_confirmed'], ['nicepay', 'paid'], ['paypal', 'captured'], ['paypal', 'completed']]) {
    assert.equal(policy.getReturnEligibility(fixture({ payment_method, payment_status })).eligible, true);
  }
});

test('missing, invalid or future delivery time requires support; request projection excludes private fields', () => {
  for (const delivered_at of [null, '', 'invalid', new Date(NOW + 1).toISOString()]) {
    assert.equal(policy.getReturnEligibility(fixture({ delivered_at }), NOW).reason, 'delivery_time_missing');
  }
  const existing = { status: 'requested', requestedAt: new Date(NOW).toISOString(), requestedByUserId: 'SECRET_USER', reason: 'SECRET_REASON' };
  const projected = policy.getReturnEligibility(fixture({ raw_payload: { returnRequest: existing } }), NOW);
  assert.equal(projected.reason, 'already_requested');
  assert.deepEqual(projected.request, { status: 'requested', requestedAt: existing.requestedAt });
  assert.doesNotMatch(JSON.stringify(projected), /SECRET_/);
  for (const returnRequest of [{ status: 'approved' }, 'invalid', {}]) {
    assert.equal(policy.getReturnEligibility(fixture({ raw_payload: { returnRequest } }), NOW).reason, 'already_requested');
  }
});

test('endpoint rejects absent, unverified and anonymous identity before touching orders', async () => {
  reset();
  assert.equal((await route.POST(request(undefined, false))).status, 401);
  assert.equal(clientCalls, 0);
  for (const invalidUser of [null, { ...owner, email_confirmed_at: null }, { ...owner, is_anonymous: true }]) {
    user = invalidUser;
    assert.equal((await route.POST(request())).status, 401);
  }
  assert.equal(writes.length, 0);
});

test('foreign, unlinked and guest orders cannot be returned by reusing an email', async () => {
  for (const overrides of [{ raw_payload: { customerUserId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' } },
    { raw_payload: {} }, { channel: 'guest' }]) {
    reset(overrides);
    const response = await route.POST(request());
    assert.equal(response.status, 404);
    assert.doesNotMatch(JSON.stringify(await response.json()), /customerUserId|SECRET_DATABASE/);
    assert.equal(writes.length, 0);
  }
});

test('valid request stores an audited request only, preserving payment, shipping and notifications', async () => {
  reset();
  const original = structuredClone(row);
  const response = await route.POST(request());
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  const body = await response.json();
  assert.equal(body.saved, true);
  assert.equal(body.returnEligibility.reason, 'already_requested');
  assert.equal(row.raw_payload.returnRequest.status, 'requested');
  assert.equal(row.raw_payload.returnRequest.requestedByUserId, owner.id);
  assert.equal(row.raw_payload.returnRequest.reason, '합성 테스트 사유');
  assert.equal(row.raw_payload.customerUserId, owner.id);
  assert.deepEqual(row.raw_payload.notifications, original.raw_payload.notifications);
  assert.equal(row.payment_status, original.payment_status);
  assert.equal(row.shipping_status, original.shipping_status);
  assert.deepEqual(Object.keys(writes[0]).sort(), ['raw_payload', 'updated_at']);
  assert.doesNotMatch(JSON.stringify(body), /합성 테스트 사유|customerUserId|notifications|requestedByUserId/);
  assert.equal((await route.POST(request())).status, 409);
  assert.equal(writes.length, 1);
});

test('elapsed, missing, unpaid and undelivered states reject writes', async () => {
  for (const overrides of [{ delivered_at: new Date(Date.now() - 8 * DAY).toISOString() }, { delivered_at: null },
    { payment_status: 'pending_transfer' }, { shipping_status: 'shipping' }]) {
    reset(overrides);
    assert.equal((await route.POST(request())).status, 409);
    assert.equal(writes.length, 0);
  }
});

test('invalid reason/body is bounded and cannot write', async () => {
  reset();
  for (const body of [null, [], {}, { id: 'fixture-order', reason: '' }, { id: 'fixture-order', reason: 123 },
    { id: 'fixture-order', reason: 'x'.repeat(1001) }, { id: 'fixture-order', reason: 'x\u0000y' },
    { id: 123, reason: 'reason' }, { id: 'x'.repeat(101), reason: 'reason' }]) {
    assert.equal((await route.POST(request(body))).status, 400);
  }
  assert.equal((await route.POST(request({ id: 'fixture-order', reason: 'x'.repeat(5000) }))).status, 413);
  assert.equal(writes.length, 0);
});

test('concurrent eligibility, ownership, notification and return changes are never overwritten', async () => {
  for (const field of ['payment_method', 'payment_status', 'shipping_status', 'delivered_at', 'raw_payload', 'channel']) {
    reset();
    beforeUpdate = () => { row[field] = field === 'raw_payload' ? { customerUserId: owner.id, notifications: { concurrent: true } } : 'concurrent-value'; };
    assert.equal((await route.POST(request())).status, 409, field);
    assert.equal(writes.length, 0, field);
  }
  reset();
  beforeUpdate = () => { row.raw_payload.returnRequest = { status: 'requested', requestedAt: new Date().toISOString() }; };
  assert.equal((await route.POST(request())).status, 409);
  assert.equal(writes.length, 0);
  assert.ok(updateFilters.some(([key, value]) => key === 'raw_payload->>customerUserId' && value === owner.id));
  assert.ok(updateFilters.some(([key]) => key === 'raw_payload'));
});

test('database errors expose no private details and do not claim success', async () => {
  for (const failure of ['readError', 'saveError']) {
    reset();
    if (failure === 'readError') readError = true; else saveError = true;
    const response = await route.POST(request());
    assert.equal(response.status, 503);
    assert.doesNotMatch(JSON.stringify(await response.json()), /SECRET_DATABASE_ERROR|"saved":true/);
    assert.equal(writes.length, 0);
  }
});
