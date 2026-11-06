/* eslint-disable @typescript-eslint/no-require-imports */
// Isolated route tests: no network, database, payment, or notification provider calls.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const crypto = require('node:crypto');

function load(file, mocks) {
  const compiled = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const mod = { exports: {} };
  vm.runInThisContext(`(function(require,module,exports){${compiled}\n})`)(name => {
    if (Object.hasOwn(mocks, name)) return mocks[name];
    throw new Error(`Unexpected dependency: ${name}`);
  }, mod, mod.exports);
  return mod.exports;
}
const guest = load('src/lib/orders/guestLookup.ts', { crypto });
const bank = load('src/lib/orders/bankAccount.ts', {});
const validation = load('src/lib/orders/checkoutValidation.ts', {});
const raw = load('src/lib/orders/rawPayload.ts', {});
class OrderValidationError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
const customer = { name: 'Test', email: 'test@example.com', phone: '01012345678', country: '대한민국', address: 'Seoul test address' };
const items = [{ id: 'product-1', selectedSize: 'M', quantity: 1, name: 'Original', category: 'tops', unitPrice: 10000, lineTotal: 10000 }];
const pricing = { subtotal: 10000, shipping: 3000, tax: 0, total: 13000, currency: 'KRW' };
function body(changes = {}) {
  return { transactionId: 'ORDER-123456', channel: 'guest', guestLookupPassword: 'test-password', customer: { ...customer }, items, pricing, ...changes };
}
function saved(changes = {}) {
  return { id: 'order-1', order_code: 'ORDER-123456', channel: 'guest', payment_method: 'bank_transfer', payment_status: 'pending_transfer',
    guest_order_number: 'GUEST-ORIGINAL', guest_password_hash: guest.hashGuestLookupPassword('test-password'),
    raw_payload: { customer, customerUserId: null, bankAccount: bank.BANK_ACCOUNT }, items,
    currency: 'KRW', amount_total: 13000, amount_subtotal: 10000, amount_shipping: 3000, amount_tax: 0,
    bank_name: 'Original bank', bank_account_number: 'original-account', ...changes };
}
function harness(options = {}) {
  let rows = options.rows || [];
  const calls = { canonical: 0, insert: 0, notifications: 0 };
  const client = { from: table => {
    assert.equal(table, 'orders');
    const filters = [];
    const query = {
      select: () => query,
      eq: (key, value) => { filters.push(row => row[key] === value); return query; },
      limit: async () => ({ data: rows.filter(row => filters.every(filter => filter(row))), error: options.readError || null }),
      insert: payload => { calls.insert++; return { select: () => ({ single: async () => {
        if (options.race) { rows = [options.race]; return { data: null, error: { code: '23505' } }; }
        if (options.insertError) return { data: null, error: options.insertError };
        rows.push({ id: 'new-order', ...payload });
        return { data: { id: 'new-order' }, error: null };
      } }) }; },
    };
    return query;
  } };
  const route = load('src/app/api/orders/bank-transfer/route.ts', {
    '@supabase/supabase-js': { createClient: () => client },
    'next/server': { NextResponse: { json: (data, init) => Response.json(data, init) } },
    '@/lib/security/requestBudget': { requestBudget: async () => null },
    '@/lib/security/requestBody': { readJsonObject: request => request.json() },
    '@/lib/supabase/projectGuard': { assertExpectedSupabaseProject: () => 'https://test.invalid' },
    '@/lib/orders/guestLookup': guest,
    '@/lib/orders/rawPayload': raw,
    '@/lib/orders/checkoutValidation': validation,
    '@/lib/orders/bankAccount': bank,
    '@/lib/orders/notifications': { dispatchOrderNotifications: async () => { calls.notifications++; return { channels: {} }; } },
    '@/lib/orders/serverOrderValidation': {
      OrderValidationError, normalizeTransactionId: value => value,
      getOrderErrorStatus: error => error.status || 500,
      authenticateOrderRequest: async () => ({ user: options.user || null }),
      buildCanonicalOrder: async () => {
        calls.canonical++;
        if (options.soldOut) throw new OrderValidationError('Sold out', 409);
        return { items, pricing };
      },
    },
  });
  return { calls, rows: () => rows, post: payload => route.POST(new Request('https://test.invalid', { method: 'POST', body: JSON.stringify(payload) })) };
}
process.env.SUPABASE_SERVICE_ROLE_KEY = 'in-memory-test';

test('response-loss retry returns original receipt before inventory checks, without insert or notification', async () => {
  const h = harness({ rows: [saved()], soldOut: true });
  const res = await h.post(body());
  assert.equal(res.status, 200);
  const receipt = await res.json();
  assert.equal(receipt.recovered, true);
  assert.equal(receipt.guestOrderNumber, 'GUEST-ORIGINAL');
  assert.equal(receipt.bankAccount.accountNumber, 'original-account');
  assert.equal(receipt.pricing.total, 13000);
  assert.equal(receipt.guest_password_hash, undefined);
  assert.deepEqual(h.calls, { canonical: 0, insert: 0, notifications: 0 });
});
test('guest password, customer, items and amount must match original request', async () => {
  for (const changes of [
    { guestLookupPassword: 'wrong-pass' }, { customer: { ...customer, address: 'different' } },
    { customer: { ...customer, email: 'other@example.com' } },
    { items: [{ ...items[0], selectedSize: 'L' }] }, { items: [{ ...items[0], quantity: 2 }] },
    { pricing: { ...pricing, total: 13001 } }, { items: [] },
  ]) {
    const h = harness({ rows: [saved()] });
    const res = await h.post(body(changes));
    assert.equal(res.status, 409);
    const result = await res.json();
    assert.equal(result.guestOrderNumber, undefined);
    assert.equal(result.bankAccount, undefined);
    assert.equal(h.calls.insert, 0);
  }
});
test('member retry requires exact user ownership; shared email cannot grant access', async () => {
  for (const id of ['member-1', 'member-2']) {
    const h = harness({ user: { id, email: customer.email }, rows: [saved({ channel: 'member', raw_payload: { customer, customerUserId: 'member-1' } })] });
    const res = await h.post(body({ channel: 'member' }));
    assert.equal(res.status, id === 'member-1' ? 200 : 409);
  }
});
test('concurrent unique insert conflict recovers winning order without duplicate notification', async () => {
  const h = harness({ race: saved() });
  const res = await h.post(body());
  assert.equal(res.status, 200);
  assert.equal((await res.json()).guestOrderNumber, 'GUEST-ORIGINAL');
  assert.deepEqual(h.calls, { canonical: 1, insert: 1, notifications: 0 });
});
test('non-pending order only offers lookup, never new transfer instructions', async () => {
  for (const payment_status of ['paid', 'transfer_confirmed', 'cancelled', 'refund_pending']) {
    const h = harness({ rows: [saved({ payment_status })] });
    const res = await h.post(body());
    assert.equal(res.status, 409);
    const result = await res.json();
    assert.equal(result.code, 'ORDER_LOOKUP_REQUIRED');
    assert.equal(result.bankAccount, undefined);
    assert.equal(h.calls.insert, 0);
  }
});
test('new order is saved once, and the next retry does not dispatch again', async () => {
  const h = harness();
  assert.equal((await h.post(body())).status, 200);
  assert.equal((await h.post(body())).status, 200);
  assert.equal(h.rows().length, 1);
  assert.equal(h.calls.notifications, 1);
});
test('database failures do not expose schema details or proceed to insert', async () => {
  for (const options of [{ readError: { code: '42P01', message: 'private-table-name' } }, { insertError: { code: '42703', message: 'private-column-name' } }]) {
    const h = harness(options);
    const res = await h.post(body());
    assert.ok(res.status >= 500);
    assert.doesNotMatch(JSON.stringify(await res.json()), /private-|Supabase|orders_setup/);
    assert.equal(h.calls.notifications, 0);
  }
});
test('invalid phone or email is rejected before any persistence', async () => {
  for (const changes of [{ phone: 'abc' }, { email: 'a@' }]) {
    const h = harness();
    assert.equal((await h.post(body({ customer: { ...customer, ...changes } }))).status, 400);
    assert.equal(h.calls.insert, 0);
  }
});
test('unique conflict cannot recover a different owner or a different original cart', async () => {
  for (const race of [saved({ guest_password_hash: guest.hashGuestLookupPassword('other-password') }), saved({ items: [{ ...items[0], id: 'other-product' }] })]) {
    const h = harness({ race });
    const res = await h.post(body());
    assert.equal(res.status, 409);
    assert.equal((await res.json()).guestOrderNumber, undefined);
    assert.equal(h.calls.notifications, 0);
  }
});
test('legacy order without binding data fails closed instead of returning a receipt', async () => {
  const h = harness({ rows: [saved({ raw_payload: {} })] });
  assert.equal((await h.post(body())).status, 409);
  assert.equal(h.calls.insert, 0);
});

test('only validation after a confirmed missing order signals safe restart', async () => {
  const absent = harness({ soldOut: true });
  const response = await absent.post(body());
  assert.equal(response.status, 409);
  assert.equal((await response.json()).code, 'ORDER_NOT_CREATED');
  assert.equal(absent.calls.insert, 0);
  for (const options of [
    { rows: [saved()], soldOut: true },
    { rows: [saved({ payment_status: 'cancelled' })] },
    { rows: [saved({ guest_password_hash: guest.hashGuestLookupPassword('different') })] },
    { readError: { code: '42P01' } },
    { insertError: { code: '42703' } },
    { race: saved({ items: [] }) },
  ]) {
    const h = harness(options);
    assert.equal((await (await h.post(body())).json()).safeToRestart, undefined);
  }
  const invalid = harness({ rows: [saved()] });
  assert.equal((await (await invalid.post(body({ customer: { ...customer, phone: 'invalid' } }))).json()).safeToRestart, undefined);
});
