/* eslint-disable @typescript-eslint/no-require-imports -- Node's isolated CommonJS test runner. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { createRequire } = require('node:module');

// Every dependency below is in memory. These tests never reach a database,
// payment provider, or email provider.
const nativeRequire = createRequire(path.resolve('package.json'));
const cache = new Map();
const owner = {
  id: '6b46e3bc-dbda-49c3-a800-b7d1badf91e1',
  email: 'morba9850@gmail.com',
  email_confirmed_at: '2026-01-01',
  is_anonymous: false,
};
const member = {
  id: 'member-fixture',
  email: 'member@example.com',
  email_confirmed_at: '2026-01-01',
  is_anonymous: false,
};
let currentUser = member;
let rows = [];
let beforeUpdate = null;
let bankConfirmRpcError = null;
let bankConfirmRpcCalls = 0;
const revalidatedTags = [];

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://gkfupegrduencknzpzok.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-only';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-only';
process.env.RESEND_API_KEY = 'test-only';

function matchesIlike(value, pattern) {
  const text = String(value || '').toLowerCase();
  const target = String(pattern).toLowerCase();
  return target.startsWith('%') ? text.endsWith(target.slice(1)) : text === target;
}

function createQuery(kind, changes = null) {
  const predicates = [];
  let ordering = null;
  let offset = 0;
  let limit = Infinity;
  const query = {
    select: () => query,
    eq: (key, value) => { predicates.push(row => row[key] === value); return query; },
    neq: (key, value) => { predicates.push(row => row[key] !== value); return query; },
    is: (key, value) => { predicates.push(row => row[key] === value); return query; },
    ilike: (key, pattern) => { predicates.push(row => matchesIlike(row[key], pattern)); return query; },
    order: (key, options) => { ordering = { key, ascending: options?.ascending !== false }; return query; },
    limit: (value) => { limit = value; return query; },
    range: (from, to) => { offset = from; limit = to - from + 1; return query; },
    maybeSingle: async () => {
      if (kind === 'update' && beforeUpdate) {
        const callback = beforeUpdate;
        beforeUpdate = null;
        callback(rows);
      }
      const row = rows.find(candidate => predicates.every(predicate => predicate(candidate)));
      if (!row) return { data: null, error: null };
      if (kind === 'update') Object.assign(row, changes);
      return { data: { ...row }, error: null };
    },
    returns: async () => ({ data: query.result(), error: null }),
    result: () => {
      let result = rows.filter(candidate => predicates.every(predicate => predicate(candidate)));
      if (ordering) {
        result = result.sort((a, b) => {
          const comparison = String(a[ordering.key] || '').localeCompare(String(b[ordering.key] || ''));
          return ordering.ascending ? comparison : -comparison;
        });
      }
      return result.slice(offset, offset + limit).map(row => ({ ...row }));
    },
    then: (resolve, reject) => Promise.resolve({ data: query.result(), error: null }).then(resolve, reject),
  };
  return query;
}

function load(file) {
  const absolute = path.resolve(file);
  if (cache.has(absolute)) return cache.get(absolute).exports;
  const testModule = { exports: {} };
  cache.set(absolute, testModule);
  const compiled = ts.transpileModule(fs.readFileSync(absolute, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  function mockRequire(name) {
    if (name === 'server-only') return {};
    if (name === 'next/cache') return {
      revalidateTag: (...args) => { revalidatedTags.push(args); },
    };
    if (name === '@supabase/supabase-js') return {
      createClient: () => ({
        auth: { getUser: async () => ({ data: { user: currentUser }, error: null }) },
        rpc: async (name, args) => {
          if (name !== 'confirm_bank_transfer_order') return { data: true, error: null };
          bankConfirmRpcCalls += 1;
          if (bankConfirmRpcError) return { data: null, error: bankConfirmRpcError };
          const row = rows.find(candidate => candidate.id === args.p_order_id);
          if (!row || row.payment_status !== 'pending_transfer') {
            return { data: null, error: { code: 'P0001', message: 'not pending' } };
          }
          row.payment_status = 'transfer_confirmed';
          return { data: true, error: null };
        },
        from: () => ({
          select: () => createQuery('select'),
          update: changes => createQuery('update', changes),
        }),
      }),
    };
    if (name.startsWith('@/')) {
      const base = path.resolve('src', name.slice(2));
      return load(fs.existsSync(`${base}.ts`) ? `${base}.ts` : `${base}.tsx`);
    }
    return nativeRequire(name);
  }
  vm.runInThisContext(`(function(require,module,exports,fetch){${compiled}\n})`, { filename: absolute })(
    mockRequire,
    testModule,
    testModule.exports,
    async () => ({ ok: true, json: async () => ({}) }),
  );
  return testModule.exports;
}

function fixture(overrides = {}) {
  return {
    id: 'order-1', order_code: 'ORDER-1', guest_order_number: null,
    channel: 'member', payment_method: 'bank_transfer', payment_status: 'pending_transfer',
    shipping_status: 'preparing', customer_email: member.email,
    customer_name: 'Test', customer_phone: '010-1111-1234', customer_country: '대한민국',
    customer_address: 'Test address', raw_payload: {}, items: [], amount_total: 10000,
    created_at: '2026-10-06T10:00:00Z',
    ...overrides,
  };
}

function request(url, method = 'GET', body) {
  return new Request(url, {
    method,
    headers: { Authorization: 'Bearer fixture', ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

const memberList = load('src/app/api/orders/my/route.ts');
const memberCancel = load('src/app/api/orders/my/cancel/route.ts');
const adminOrders = load('src/app/api/admin/orders/route.ts');
const guestLookup = load('src/app/api/orders/guest-lookup/route.ts');
const { hashGuestLookupPassword } = load('src/lib/orders/guestLookup.ts');

test('member list and cancellation exclude guest orders sharing the same email', async () => {
  currentUser = member;
  rows = [fixture(), fixture({ id: 'guest-1', channel: 'guest' })];
  const list = await memberList.GET(request('http://localhost/api/orders/my'));
  assert.equal(list.status, 200);
  assert.deepEqual((await list.json()).orders.map(order => order.id), ['order-1']);
  const cancellation = await memberCancel.POST(request('http://localhost/api/orders/my/cancel', 'POST', { id: 'guest-1' }));
  assert.equal(cancellation.status, 404);
  assert.equal(rows[1].payment_status, 'pending_transfer');
});

test('unpaid member bank order is cancelled without claiming a refund', async () => {
  currentUser = member;
  rows = [fixture()];
  const response = await memberCancel.POST(request('http://localhost/api/orders/my/cancel', 'POST', { id: 'order-1' }));
  assert.equal(response.status, 200);
  assert.equal(rows[0].payment_status, 'cancelled');
  assert.equal(rows[0].raw_payload.cancellation.status, 'cancelled_unpaid');
  assert.equal(rows[0].raw_payload.refundStatus, undefined);
});

test('confirmed bank transfer becomes refund pending, not automatically refunded', async () => {
  currentUser = member;
  rows = [fixture({ payment_status: 'transfer_confirmed' })];
  const response = await memberCancel.POST(request('http://localhost/api/orders/my/cancel', 'POST', { id: 'order-1' }));
  assert.equal(response.status, 200);
  assert.equal(rows[0].payment_status, 'refund_pending');
  assert.equal(rows[0].raw_payload.refundStatus, 'pending');
});

test('member cancellation cannot overwrite shipping that starts after the read', async () => {
  currentUser = member;
  rows = [fixture()];
  beforeUpdate = value => { value[0].shipping_status = 'shipping'; };
  const response = await memberCancel.POST(request('http://localhost/api/orders/my/cancel', 'POST', { id: 'order-1' }));
  assert.equal(response.status, 409);
  assert.equal(rows[0].payment_status, 'pending_transfer');
});

test('admin cannot mark provider payment cancelled without a provider cancellation', async () => {
  currentUser = owner;
  for (const payment_method of ['nicepay', 'paypal']) {
    rows = [fixture({ payment_method, payment_status: payment_method === 'nicepay' ? 'paid' : 'captured' })];
    const response = await adminOrders.PATCH(request('http://localhost/api/admin/orders', 'PATCH', {
      id: 'order-1', paymentStatus: 'cancelled',
    }));
    assert.equal(response.status, 409);
    assert.notEqual(rows[0].payment_status, 'cancelled');
  }
});

test('NICE cancellation-in-progress cannot be manually cleared or shipped', async () => {
  currentUser = owner;
  rows = [fixture({ payment_method: 'nicepay', payment_status: 'cancel_processing' })];
  const statusResponse = await adminOrders.PATCH(request('http://localhost/api/admin/orders', 'PATCH', {
    id: 'order-1', paymentStatus: 'paid',
  }));
  assert.equal(statusResponse.status, 409);
  const shippingResponse = await adminOrders.PATCH(request('http://localhost/api/admin/orders', 'PATCH', {
    id: 'order-1', paymentStatus: 'cancel_processing', shippingStatus: 'shipping',
  }));
  assert.equal(shippingResponse.status, 409);
  assert.equal(rows[0].payment_status, 'cancel_processing');
  assert.equal(rows[0].shipping_status, 'preparing');
});

test('NICE approval-in-progress cannot be overwritten by admin edits or shipping', async () => {
  currentUser = owner;
  rows = [fixture({ payment_method: 'nicepay', payment_status: 'approval_processing' })];
  for (const payload of [
    { paymentStatus: 'paid' },
    { paymentStatus: 'approval_processing', shippingStatus: 'shipping' },
    { paymentStatus: 'approval_processing', shippingNote: 'ship early' },
  ]) {
    const response = await adminOrders.PATCH(request('http://localhost/api/admin/orders', 'PATCH', {
      id: 'order-1', ...payload,
    }));
    assert.equal(response.status, 409);
  }
  assert.equal(rows[0].payment_status, 'approval_processing');
  assert.equal(rows[0].shipping_status, 'preparing');
  assert.equal(rows[0].shipping_note, undefined);
});

test('bank payment statuses advance only through allowed transitions', async () => {
  currentUser = owner;
  for (const [current, requested] of [
    ['pending_transfer', 'refund_pending'],
    ['transfer_confirmed', 'pending_transfer'],
    ['transfer_confirmed', 'cancelled'],
    ['refund_pending', 'transfer_confirmed'],
    ['refund_pending', 'pending_transfer'],
    ['cancelled', 'transfer_confirmed'],
    ['cancelled', 'pending_transfer'],
  ]) {
    rows = [fixture({ payment_status: current })];
    const response = await adminOrders.PATCH(request('http://localhost/api/admin/orders', 'PATCH', {
      id: 'order-1', paymentStatus: requested,
    }));
    assert.equal(response.status, 409, `${current} -> ${requested}`);
    assert.equal(rows[0].payment_status, current);
  }
});

test('confirmed bank transfer must pass through refund pending before refund completion', async () => {
  currentUser = owner;
  rows = [fixture({ payment_status: 'transfer_confirmed' })];
  const requestRefund = await adminOrders.PATCH(request('http://localhost/api/admin/orders', 'PATCH', {
    id: 'order-1', paymentStatus: 'refund_pending',
  }));
  assert.equal(requestRefund.status, 200);
  assert.equal(rows[0].payment_status, 'refund_pending');
  const completeRefund = await adminOrders.PATCH(request('http://localhost/api/admin/orders', 'PATCH', {
    id: 'order-1', paymentStatus: 'cancelled',
  }));
  assert.equal(completeRefund.status, 200);
  assert.equal(rows[0].payment_status, 'cancelled');
  assert.equal(rows[0].raw_payload.refundStatus, 'completed');
});

test('bank confirmation uses atomic RPC, refreshes product cache, and never separately updates status', async () => {
  currentUser = owner;
  const orderId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  rows = [fixture({ id: orderId })];
  bankConfirmRpcError = null;
  bankConfirmRpcCalls = 0;
  revalidatedTags.length = 0;
  const response = await adminOrders.PATCH(request('http://localhost/api/admin/orders', 'PATCH', {
    id: orderId, paymentStatus: 'transfer_confirmed', shippingStatus: 'preparing',
    shippingCompany: '우체국', trackingNumber: '', shippingNote: '',
  }));
  assert.equal(response.status, 200);
  assert.equal(rows[0].payment_status, 'transfer_confirmed');
  assert.equal(bankConfirmRpcCalls, 1);
  assert.deepEqual(revalidatedTags, [['storefront-products', 'max']]);
});

test('atomic bank confirmation conflict leaves the order pending and requires reconciliation', async () => {
  currentUser = owner;
  const orderId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  rows = [fixture({ id: orderId })];
  bankConfirmRpcError = { code: 'P0001', message: 'already claimed' };
  bankConfirmRpcCalls = 0;
  const response = await adminOrders.PATCH(request('http://localhost/api/admin/orders', 'PATCH', {
    id: orderId, paymentStatus: 'transfer_confirmed',
  }));
  bankConfirmRpcError = null;
  assert.equal(response.status, 409);
  assert.equal(bankConfirmRpcCalls, 1);
  assert.equal(rows[0].payment_status, 'pending_transfer');
});

test('bank confirmation rejects a combined shipping change before calling the RPC', async () => {
  currentUser = owner;
  const orderId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  rows = [fixture({ id: orderId })];
  bankConfirmRpcCalls = 0;
  const response = await adminOrders.PATCH(request('http://localhost/api/admin/orders', 'PATCH', {
    id: orderId, paymentStatus: 'transfer_confirmed', shippingStatus: 'shipping',
  }));
  assert.equal(response.status, 409);
  assert.equal(bankConfirmRpcCalls, 0);
  assert.equal(rows[0].payment_status, 'pending_transfer');
});

test('unpaid bank and pending provider orders cannot begin shipping', async () => {
  currentUser = owner;
  for (const [payment_method, payment_status] of [
    ['bank_transfer', 'pending_transfer'],
    ['nicepay', 'pending_payment'],
    ['paypal', 'pending_payment'],
  ]) {
    rows = [fixture({ payment_method, payment_status })];
    const response = await adminOrders.PATCH(request('http://localhost/api/admin/orders', 'PATCH', {
      id: 'order-1', shippingStatus: 'shipping',
    }));
    assert.equal(response.status, 409, `${payment_method}/${payment_status}`);
    assert.equal(rows[0].shipping_status, 'preparing');
  }
});

test('even the owner cannot hard-delete a paid order', async () => {
  currentUser = owner;
  rows = [fixture({ payment_status: 'transfer_confirmed' })];
  const response = await adminOrders.DELETE(request('http://localhost/api/admin/orders?id=order-1', 'DELETE'));
  assert.equal(response.status, 409);
  assert.equal(rows.length, 1);
});

test('admin can cancel a guest unpaid bank order, preserving admin scope', async () => {
  currentUser = owner;
  rows = [fixture({ channel: 'guest' })];
  const response = await adminOrders.POST(request('http://localhost/api/admin/orders', 'POST', {
    id: 'order-1', action: 'cancel_payment',
  }));
  assert.equal(response.status, 200);
  assert.equal(rows[0].payment_status, 'cancelled');
  assert.equal(rows[0].raw_payload.cancellation.status, 'cancelled_unpaid');
});

test('admin bank cancellation does not overwrite a concurrent payment confirmation', async () => {
  currentUser = owner;
  rows = [fixture({ channel: 'guest' })];
  beforeUpdate = value => { value[0].payment_status = 'transfer_confirmed'; };
  const response = await adminOrders.POST(request('http://localhost/api/admin/orders', 'POST', {
    id: 'order-1', action: 'cancel_payment',
  }));
  assert.equal(response.status, 409);
  assert.equal(rows[0].payment_status, 'transfer_confirmed');
});

test('guest lookup can find an older order beyond the former 200-order window', async () => {
  currentUser = null;
  const decoys = Array.from({ length: 201 }, (_, index) => fixture({
    id: `decoy-${index}`, channel: 'guest', customer_phone: '010-9999-1234',
    guest_order_number: `GUEST-20261006-${String(index).padStart(8, '0')}`,
    guest_password_hash: null,
    created_at: new Date(Date.UTC(2026, 9, 6, 10, 0, 0) - index * 1000).toISOString(),
  }));
  const target = fixture({
    id: 'old-guest', channel: 'guest', customer_phone: '010-1111-1234',
    guest_order_number: 'GUEST-20261005-ABCDEF12',
    guest_password_hash: hashGuestLookupPassword('secret-pass'),
    created_at: '2026-10-05T10:00:00Z',
  });
  rows = [...decoys, target];
  const response = await guestLookup.POST(request('http://localhost/api/orders/guest-lookup', 'POST', {
    phone: '010-1111-1234', password: 'secret-pass',
  }));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).order.id, 'old-guest');
});

test('guest order-number lookup still verifies both phone and password', async () => {
  currentUser = null;
  rows = [fixture({
    id: 'guest-1', channel: 'guest', guest_order_number: 'GUEST-20261005-ABCDEF12',
    guest_password_hash: hashGuestLookupPassword('secret-pass'),
  })];
  const base = { guestOrderNumber: 'GUEST-20261005-ABCDEF12', password: 'secret-pass' };
  const wrongPhone = await guestLookup.POST(request('http://localhost/api/orders/guest-lookup', 'POST', {
    ...base, phone: '010-2222-1234',
  }));
  assert.equal(wrongPhone.status, 401);
  const correct = await guestLookup.POST(request('http://localhost/api/orders/guest-lookup', 'POST', {
    ...base, phone: '010-1111-1234',
  }));
  assert.equal(correct.status, 200);
  assert.equal((await correct.json()).order.matchedBy, 'order_number');
});
