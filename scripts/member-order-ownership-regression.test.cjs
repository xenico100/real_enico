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
const member = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', email: 'reused@example.com', email_confirmed_at: '2026-10-15', is_anonymous: false };
const previousMemberId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
let rows = [];
let beforeUpdate = null;
let updates = 0;
let notifications = 0;
let providerCancels = 0;
let selections = [];
let updateFilters = [];

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://gkfupegrduencknzpzok.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-only';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-only';

function field(row, key) {
  if (key === 'raw_payload->>customerUserId') return row.raw_payload?.customerUserId ?? null;
  return row[key];
}

function createQuery(changes) {
  const predicates = [];
  let head = false;
  let limit = Infinity;
  const filter = (key, value, predicate) => {
    if (changes) updateFilters.push([key, value]);
    predicates.push(predicate);
    return query;
  };
  const query = {
    select(columns, options = {}) { head = options.head === true; selections.push({ columns, head }); return query; },
    eq: (key, value) => filter(key, value, row => key === 'raw_payload' ? JSON.stringify(row.raw_payload) === value : field(row, key) === value),
    is: (key, value) => filter(key, value, row => field(row, key) === value),
    neq: (key, value) => filter(key, value, row => field(row, key) !== value),
    ilike: (key, value) => filter(key, value, row => String(field(row, key) || '').toLowerCase() === value.toLowerCase()),
    order: () => query,
    limit(value) { limit = value; return query; },
    result() { return rows.filter(row => predicates.every(predicate => predicate(row))).slice(0, limit); },
    async maybeSingle() {
      if (changes && beforeUpdate) { const mutate = beforeUpdate; beforeUpdate = null; mutate(); }
      const row = query.result()[0];
      if (row && changes) { Object.assign(row, changes); updates += 1; }
      return { data: row ? structuredClone(row) : null, error: null };
    },
    then(resolve, reject) {
      const matches = query.result();
      return Promise.resolve({ data: head ? null : structuredClone(matches), count: head ? matches.length : undefined, error: null }).then(resolve, reject);
    },
  };
  return query;
}

function load(file) {
  const absolute = path.resolve(file);
  if (cache.has(absolute)) return cache.get(absolute).exports;
  const mod = { exports: {} };
  cache.set(absolute, mod);
  const js = ts.transpileModule(fs.readFileSync(absolute, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  function requireMock(name) {
    if (name === 'server-only') return {};
    if (name === '@supabase/supabase-js') return { createClient: () => ({
      auth: { getUser: async () => ({ data: { user: member }, error: null }) },
      from: () => ({ select: (...args) => createQuery().select(...args), update: changes => createQuery(changes) }),
    }) };
    if (name === '@/lib/orders/notifications') return { dispatchOrderNotifications: async () => { notifications += 1; } };
    if (name === '@/lib/orders/nicepayCancel') return { cancelNicepayOrder: async () => { providerCancels += 1; throw new Error('Unexpected provider cancellation'); } };
    if (name.startsWith('.')) return load(path.join(path.dirname(absolute), name) + '.ts');
    if (name.startsWith('@/')) {
      const base = path.resolve('src', name.slice(2));
      return load(`${base}.ts`);
    }
    return nativeRequire(name);
  }
  vm.runInThisContext(`(function(require,module,exports){${js}\n})`, { filename: absolute })(requireMock, mod, mod.exports);
  return mod.exports;
}

function fixture(id, owner, overrides = {}) {
  return {
    id, order_code: id, channel: 'member', customer_email: member.email,
    payment_method: 'bank_transfer', payment_status: 'pending_transfer', shipping_status: 'preparing',
    raw_payload: owner ? { customerUserId: owner } : {}, customer_address: `PRIVATE ADDRESS ${id}`,
    amount_total: 123000, items: [], ...overrides,
  };
}
const list = load('src/app/api/orders/my/route.ts');
const cancel = load('src/app/api/orders/my/cancel/route.ts');
const ownership = load('src/lib/orders/memberOrderOwnership.ts');
function request(id) {
  return new Request(`https://enicoveck.com/api/orders/my${id ? '/cancel' : ''}`, {
    method: id ? 'POST' : 'GET', headers: { Authorization: 'Bearer fixture', ...(id ? { 'Content-Type': 'application/json' } : {}) },
    ...(id ? { body: JSON.stringify({ id }) } : {}),
  });
}

test('a reused email cannot expose another immutable account or unlinked legacy orders', async () => {
  rows = [fixture('own', member.id, { customer_email: 'my-old-email@example.com' }), fixture('previous', previousMemberId), fixture('legacy', null), fixture('guest', member.id, { channel: 'guest' })];
  selections = [];
  const response = await list.GET(request());
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.deepEqual(payload.orders.map(order => order.id), ['own']);
  assert.equal(payload.legacyLinkRequired, true);
  assert.match(payload.message, /연결 확인/);
  assert.ok(!JSON.stringify(payload).includes('PRIVATE ADDRESS previous'));
  assert.ok(!JSON.stringify(payload).includes('PRIVATE ADDRESS legacy'));
  assert.ok(selections.some(query => query.columns === 'id' && query.head));
});

test('a linked order stays with the same account after its email changes', async () => {
  rows = [fixture('own', member.id, { customer_email: 'old@example.com' })];
  const payload = await (await list.GET(request())).json();
  assert.equal(payload.orders[0].id, 'own');
  assert.equal(payload.legacyLinkRequired, false);
});

test('foreign, guest and unlinked legacy orders cannot trigger payment cancellation', async () => {
  rows = [fixture('previous', previousMemberId, { payment_method: 'nicepay', payment_status: 'paid' }), fixture('legacy', null), fixture('guest', member.id, { channel: 'guest' })];
  updates = 0; providerCancels = 0;
  for (const id of ['previous', 'legacy', 'guest']) {
    const response = await cancel.POST(request(id));
    assert.equal(response.status, 404);
    assert.ok(!JSON.stringify(await response.json()).includes('PRIVATE ADDRESS'));
  }
  assert.equal(updates, 0);
  assert.equal(providerCancels, 0);
});

test('unpaid cancellation preserves account binding and refuses concurrent notification metadata changes', async () => {
  rows = [fixture('own', member.id)];
  beforeUpdate = () => { rows[0].raw_payload = { customerUserId: member.id, notifications: { sent: true } }; };
  updateFilters = []; updates = 0; notifications = 0;
  assert.equal((await cancel.POST(request('own'))).status, 409);
  assert.equal(rows[0].payment_status, 'pending_transfer');
  assert.equal(rows[0].raw_payload.notifications.sent, true);
  assert.ok(updateFilters.some(([key, value]) => key === 'raw_payload->>customerUserId' && value === member.id));
  assert.ok(updateFilters.some(([key]) => key === 'raw_payload'));
  assert.equal(updates, 0);
  assert.equal(notifications, 0);
  beforeUpdate = null;
  assert.equal((await cancel.POST(request('own'))).status, 200);
  assert.equal(rows[0].payment_status, 'cancelled');
  assert.equal(rows[0].raw_payload.customerUserId, member.id);
  assert.equal(rows[0].raw_payload.notifications.sent, true);
});

test('ownership requires an explicit valid member UUID and never falls back to email', () => {
  assert.equal(ownership.isMemberOrderOwner(fixture('own', member.id), member.id), true);
  for (const raw_payload of [null, {}, { customerUserId: 'not-a-uuid' }, { customerUserId: previousMemberId }]) {
    assert.equal(ownership.isMemberOrderOwner({ channel: 'member', raw_payload }, member.id), false);
  }
  assert.equal(ownership.isMemberOrderOwner({ channel: 'guest', raw_payload: { customerUserId: member.id } }, member.id), false);
});
