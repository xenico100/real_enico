/* eslint-disable @typescript-eslint/no-require-imports -- Isolated mock-only regression runner. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { createRequire } = require('node:module');
const nativeRequire = createRequire(path.resolve('package.json'));

// No live database, auth service, provider or network is used. All credentials
// are inert fixture strings and every database/auth boundary is replaced here.
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://gkfupegrduencknzpzok.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'fixture-anon';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'fixture-service';
const owner = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', email: 'fixture-owner@example.test', email_confirmed_at: '2026-10-01', is_anonymous: false };
const otherId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const productId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const otherProductId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const eventKey = 'a'.repeat(64);
let user = owner;
let tables;
let queries;
let errors;
let ignoreOwnership;

function reset() {
  user = owner; tables = { orders: [], products: [], phone_relay_jobs: [] };
  queries = []; errors = {}; ignoreOwnership = false;
}
reset();
function valueAt(row, key) { return key === 'raw_payload->>customerUserId' ? row.raw_payload?.customerUserId ?? null : row[key]; }
function query(table) {
  const state = { table, columns: '', filters: [], head: false };
  queries.push(state);
  const api = {
    select(columns, options = {}) { state.columns = columns; state.head = Boolean(options.head); return api; },
    eq(key, value) { state.filters.push(['eq', key, value]); return api; },
    is(key, value) { state.filters.push(['is', key, value]); return api; },
    neq(key, value) { state.filters.push(['neq', key, value]); return api; },
    in(key, value) { state.filters.push(['in', key, value]); return api; },
    ilike(key, value) { state.filters.push(['ilike', key, value]); return api; },
    order() { return api; }, limit() { return api; },
    then(resolve, reject) {
      const matches = (tables[table] || []).filter(row => state.filters.every(([op, key, expected]) => {
        if (ignoreOwnership && key === 'raw_payload->>customerUserId' && op === 'eq') return true;
        const actual = valueAt(row, key);
        if (op === 'neq') return actual !== expected;
        if (op === 'in') return expected.includes(actual);
        if (op === 'ilike') return String(actual || '').toLowerCase() === expected.toLowerCase();
        return actual === expected;
      }));
      const error = errors[table] || null;
      return Promise.resolve({ data: state.head || error ? null : structuredClone(matches), count: state.head ? matches.length : undefined, error }).then(resolve, reject);
    },
  };
  return api;
}
const client = { from: query, auth: { getUser: async () => ({ data: { user }, error: null }) } };
const cache = new Map();
function load(file) {
  const absolute = path.resolve(file);
  if (cache.has(absolute)) return cache.get(absolute).exports;
  const mod = { exports: {} }; cache.set(absolute, mod);
  const compiled = ts.transpileModule(fs.readFileSync(absolute, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInThisContext(`(function(require,module,exports){${compiled}\n})`, { filename: absolute })(name => {
    if (name === 'server-only') return {};
    if (name === '@supabase/supabase-js') return { createClient: () => client };
    if (name.startsWith('@/')) return load(path.join('src', name.slice(2)) + '.ts');
    if (name.startsWith('.')) return load(path.join(path.dirname(absolute), name) + '.ts');
    return nativeRequire(name);
  }, mod, mod.exports);
  return mod.exports;
}
const route = load('src/app/api/orders/my/route.ts');
const view = load('src/lib/orders/customerOrderView.ts');
function request(token = 'fixture') { return new Request('https://enicoveck.com/api/orders/my', { headers: token ? { Authorization: `Bearer ${token}` } : {} }); }
function item(overrides = {}) { return { id: productId, name: 'FIXTURE ARCHIVE JACKET', category: '아우터', selectedSize: 'M', quantity: 2, unitPrice: 10000, lineTotal: 20000, ...overrides }; }
function order(id = 'own', overrides = {}) { return { id, channel: 'member', payment_method: 'bank_transfer', payment_status: 'pending_transfer', shipping_status: 'preparing', amount_total: 23000, currency: 'KRW', items: [item()], customer_email: owner.email, raw_payload: { customerUserId: owner.id }, ...overrides }; }
function event(channels, overrides = {}) { return { event: 'payment_confirmed', eventKey, createdAt: '2026-10-20T01:00:00.000Z', channels, ...overrides }; }
function withEvent(entry) { return { customerUserId: owner.id, notifications: { events: { fixture: entry } } }; }
function job(overrides = {}) { return { id: 'job-fixture', order_id: 'own', kind: 'customer_sms', event_key: `${eventKey}:customerSms`, status: 'queued', created_at: '2026-10-20T01:00:00Z', claimed_at: null, claim_expires_at: null, acknowledged_at: null, expires_at: '2099-01-01T00:00:00Z', ...overrides }; }

test('member ownership gates every image and notification enrichment query', async () => {
  reset();
  tables.orders = [order(), order('foreign', { items: [item({ id: otherProductId })], raw_payload: { customerUserId: otherId } }), order('legacy', { raw_payload: {} }), order('guest', { channel: 'guest' })];
  // Even if an upstream mock unexpectedly returns an extra row, the explicit
  // application ownership check must run before enrichment/serialization.
  ignoreOwnership = true;
  tables.products = [{ id: productId, is_published: true, thumbnail_url: 'https://cdn.example.test/fixture.jpg' }, { id: otherProductId, is_published: true, thumbnail_url: 'https://cdn.example.test/FOREIGN.jpg' }];
  const response = await route.GET(request());
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.deepEqual(payload.orders.map(row => row.id), ['own']);
  assert.equal(payload.legacyLinkRequired, true);
  assert.equal(payload.orders[0].items[0].image, 'https://cdn.example.test/fixture.jpg');
  assert.ok(!JSON.stringify(payload).includes('FOREIGN'));
  assert.ok(queries.some(q => q.table === 'orders' && q.filters.some(([op, key, val]) => op === 'eq' && key === 'raw_payload->>customerUserId' && val === owner.id)));
  for (const q of queries.filter(q => q.table === 'products')) {
    assert.equal(q.columns, 'id, thumbnail_url, images, is_published');
    assert.deepEqual(q.filters.find(([op, key]) => op === 'in' && key === 'id')[2], [productId]);
  }
});

test('items preserve purchased name, option, individual quantity and prices while dropping arbitrary JSON', async () => {
  reset();
  tables.orders = [order('own', { items: JSON.stringify([item({ image: 'https://attacker.example.test/secret', customerEmail: 'hidden@example.test', provider: { token: 'SECRET' }, raw: { private: 'SECRET' } })]) })];
  tables.products = [{ id: productId, is_published: true, title: 'RENAMED CATALOG TITLE', price: 99, thumbnail_url: 'https://cdn.example.test/public.jpg', raw: { SECRET: true } }];
  const payload = await (await route.GET(request())).json();
  assert.deepEqual(payload.orders[0].items, [{ id: productId, name: 'FIXTURE ARCHIVE JACKET', category: '아우터', selectedSize: 'M', quantity: 2, unitPrice: 10000, lineTotal: 20000, image: 'https://cdn.example.test/public.jpg' }]);
  assert.ok(!JSON.stringify(payload).includes('SECRET'));
  assert.ok(!JSON.stringify(payload).includes('attacker'));
});

test('unpublished drafts and unsafe image URLs are not exposed; existing archive policy is preserved', async () => {
  reset();
  const archiveId = '7cd29c56-20a4-4677-813e-adbf1043b256';
  tables.products = [{ id: productId, is_published: false, thumbnail_url: 'https://cdn.example.test/DRAFT.jpg' }, { id: archiveId, is_published: false, thumbnail_url: 'javascript:alert(1)', images: ['https://user:secret@cdn.example.test/private.jpg', '/fixture/archive.jpg'] }];
  const results = await view.attachCustomerOrderImages(client, [{ items: [item(), item({ id: archiveId })] }]);
  assert.equal(results[0].items[0].image, '');
  assert.equal(results[0].items[1].image, '/fixture/archive.jpg');
  errors.products = { message: 'PRIVATE DB ERROR', code: '42P01' };
  const withoutCatalog = await view.attachCustomerOrderImages(client, [{ items: view.getCustomerOrderItems([item()]) }]);
  assert.equal(withoutCatalog[0].items[0].image, '');
});

test('customer notification fields are allowlisted, with channel-specific events and truthful provider acceptance', async () => {
  reset();
  tables.orders = [order('own', { raw_payload: withEvent(event({ customerSms: { status: 'sent', attemptedAt: '2026-10-20T01:01:00Z', providerId: 'PRIVATE_PROVIDER_ID', errorCode: 'PRIVATE_ERROR', to: '01000000000', email: 'private@example.test' }, customerEmail: { status: 'failed', errorCode: 'PRIVATE_ERROR' }, adminEmail: { status: 'sent', providerId: 'ADMIN_SECRET' } })) })];
  const payload = await (await route.GET(request())).json();
  assert.deepEqual(payload.orders[0].notifications, { customerSms: { status: 'sent', event: 'payment_confirmed', updatedAt: '2026-10-20T01:01:00.000Z' }, customerEmail: { status: 'failed', event: 'payment_confirmed', updatedAt: '2026-10-20T01:00:00.000Z' } });
  const result = JSON.stringify(payload.orders[0].notifications);
  for (const secret of ['PRIVATE', '01000000000', 'private@example.test', 'ADMIN_SECRET', 'providerId', 'errorCode', 'adminEmail']) assert.ok(!result.includes(secret), secret);
});

test('relay queue, claim, local submission and expiration never imply delivery', async () => {
  reset();
  const rows = [order('own', { raw_payload: withEvent(event({ customerSms: { status: 'queued', provider: 'phone_relay', providerId: 'job-fixture' } })) })];
  for (const [status, extras, expected] of [
    ['queued', {}, 'queued'],
    ['claimed', { claimed_at: '2026-10-20T01:05:00Z', claim_expires_at: '2099-01-01T00:00:00Z' }, 'claimed'],
    ['submitted', { acknowledged_at: '2026-10-20T01:06:00Z' }, 'submitted'],
    ['submitted', {}, 'unknown'],
    ['queued', { expires_at: '2000-01-01T00:00:00Z' }, 'stale'],
  ]) {
    tables.phone_relay_jobs = [job({ status, ...extras })];
    const summary = (await view.attachCustomerOrderNotifications(client, rows)).get('own');
    assert.equal(summary.customerSms.status, expected);
    assert.notEqual(summary.customerSms.status, 'delivered');
  }
  const relayQuery = queries.find(q => q.table === 'phone_relay_jobs');
  assert.ok(relayQuery.filters.some(([op, key, value]) => op === 'in' && key === 'order_id' && value.includes('own')));
  assert.ok(relayQuery.filters.some(([op, key, value]) => op === 'eq' && key === 'kind' && value === 'customer_sms'));
  assert.ok(!relayQuery.columns.includes('to'));
  assert.ok(!relayQuery.columns.includes('body'));
});

test('missing, inaccessible or mismatched relay metadata remains unknown', async () => {
  reset();
  const rows = [order('own', { raw_payload: withEvent(event({ customerSms: { status: 'queued', provider: 'phone_relay', providerId: 'job-fixture' } })) })];
  for (const jobs of [[], [job({ order_id: 'foreign' })], [job({ event_key: `${'b'.repeat(64)}:customerSms` })], [job({ id: 'another-job' })]]) {
    tables.phone_relay_jobs = jobs;
    assert.equal((await view.attachCustomerOrderNotifications(client, rows)).get('own').customerSms.status, 'unknown');
  }
  errors.phone_relay_jobs = { code: '42501', message: 'PRIVATE_PERMISSION_ERROR' };
  tables.phone_relay_jobs = [job()];
  assert.equal((await view.attachCustomerOrderNotifications(client, rows)).get('own').customerSms.status, 'unknown');
});

test('manual Gmail and unknown notification data are never manufactured into successful sends', async () => {
  reset();
  const raw = withEvent(event({ customerSms: { status: 'delivered', deliveryConfirmed: true }, adminEmail: { status: 'sent' } }));
  raw.manualGmailSent = true;
  raw.gmail = { status: 'sent', email: 'private@example.test' };
  raw.notifications.events.unknown = event({ customerEmail: { status: 'sent' } }, { event: 'PRIVATE_EVENT', eventKey: 'b'.repeat(64), createdAt: '2026-10-20T02:00:00Z' });
  const summary = (await view.attachCustomerOrderNotifications(client, [order('own', { raw_payload: raw })])).get('own');
  assert.equal(summary.customerSms.status, 'unknown');
  assert.equal(summary.customerEmail, undefined);
  assert.ok(!JSON.stringify(summary).includes('PRIVATE_EVENT'));
});

test('a later admin-only event does not erase the latest recorded customer-channel result', async () => {
  reset();
  const raw = withEvent(event({ customerEmail: { status: 'sent' } }));
  raw.notifications.events.later = event({ adminEmail: { status: 'sent' } }, { event: 'shipping_started', eventKey: 'b'.repeat(64), createdAt: '2026-10-20T02:00:00Z' });
  const summary = (await view.attachCustomerOrderNotifications(client, [order('own', { raw_payload: raw })])).get('own');
  assert.equal(summary.customerEmail.event, 'payment_confirmed');
});

test('unauthenticated and unverified users cannot query orders, products or queue metadata', async () => {
  reset();
  assert.equal((await route.GET(request(''))).status, 401);
  user = { ...owner, email_confirmed_at: null };
  assert.equal((await route.GET(request())).status, 401);
  user = null;
  assert.equal((await route.GET(request())).status, 401);
  assert.equal(queries.length, 0);
});

test('customer-facing database and project configuration errors disclose no internal details', async () => {
  reset();
  for (const code of ['42P01', '42703', '42501']) {
    errors.orders = { code, message: 'PRIVATE_PROVIDER_SECRET_AND_DB_DETAIL' };
    const response = await route.GET(request());
    assert.equal(response.status, 500);
    const message = JSON.stringify(await response.json());
    assert.ok(!message.includes('PRIVATE'));
    assert.ok(!message.includes('sql/'));
    assert.ok(!message.includes('Supabase'));
  }
  errors = {};
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://wrong-project.supabase.co';
  const response = await route.GET(request());
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://gkfupegrduencknzpzok.supabase.co';
  assert.equal(response.status, 500);
  assert.ok(!JSON.stringify(await response.json()).includes('gkfupegrduencknzpzok'));
});
