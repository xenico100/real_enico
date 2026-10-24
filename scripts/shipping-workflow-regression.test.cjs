/* eslint-disable @typescript-eslint/no-require-imports -- Node's isolated fixture runner. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { isDeepStrictEqual } = require('node:util');
const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const nativeRequire = require('node:module').createRequire(path.resolve('package.json'));

// Every query and every delivery is replaced at the import boundary. These
// fixtures never invoke the production database, auth, RPC or providers.
function harness(overrides = {}, hooks = {}) {
  const state = { row: {
    id: 'fixture-order', order_code: 'FIXTURE-ORDER', guest_order_number: null,
    channel: 'member', payment_method: 'bank_transfer', payment_status: 'transfer_confirmed',
    shipping_status: 'preparing', shipping_company: null, tracking_number: null, shipping_note: null,
    shipped_at: null, delivered_at: null, amount_total: 45000, currency: 'KRW', items: [],
    raw_payload: { customerUserId: 'fixture-member', checkout: { preserved: true } },
    created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z',
    ...clone(overrides),
  }, writes: [], notifications: [], rpcCalls: 0 };
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: hooks.userId || 'fixture-admin' } }, error: null }) },
    rpc: async () => { state.rpcCalls++; throw new Error('Unexpected RPC in shipping test'); },
    from(table) {
      assert.equal(table, 'orders');
      const filters = [];
      let update;
      const query = {
        select: () => query,
        eq(key, value) { filters.push({ key, value, kind: 'eq' }); return query; },
        neq(key, value) { filters.push({ key, value, kind: 'neq' }); return query; },
        order() { return query; },
        async limit() {
          const rows = [state.row].filter(row => filters.every(({ key, value, kind }) => {
            const actual = key === 'raw_payload->returnRequest->>status' ? row.raw_payload?.returnRequest?.status : row[key];
            return kind === 'neq' ? actual !== value : actual === value;
          }));
          return { data: clone(rows), error: null };
        },
        is(key, value) { filters.push({ key, value, kind: 'is' }); return query; },
        async maybeSingle() {
          if (hooks.readError && !update) return { data: null, error: { message: 'SECRET_DB_ERROR', code: 'XX999' } };
          if (update) {
            const write = { update, filters: clone(filters) }; state.writes.push(write);
            if (hooks.beforeUpdate) { const hook = hooks.beforeUpdate; hooks.beforeUpdate = null; hook(state); }
            if (hooks.updateError) return { data: null, error: { message: 'SECRET_DB_ERROR', code: 'XX999' } };
            const match = filters.every(({ key, value, kind }) => isDeepStrictEqual(state.row[key],
              key === 'raw_payload' && kind === 'eq' ? JSON.parse(value) : value));
            if (!match) return { data: null, error: null };
            Object.assign(state.row, clone(update));
          }
          return { data: clone(state.row), error: null };
        },
        update(value) { update = clone(value); return query; },
      };
      return query;
    },
  };
  const cache = new Map();
  function load(file) {
    const absolute = path.resolve(file);
    if (cache.has(absolute)) return cache.get(absolute).exports;
    const mod = { exports: {} }; cache.set(absolute, mod);
    const compiled = ts.transpileModule(fs.readFileSync(absolute, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    vm.runInThisContext(`(function(require,module,exports,process){${compiled}\n})`, { filename: absolute })(name => {
      if (name === 'server-only') return {};
      if (name === '@supabase/supabase-js') return { createClient: () => client };
      if (name === 'next/cache') return { revalidateTag() {} };
      if (name === '@/lib/security/identity') return { isPrimaryAdmin: user => user.id === 'fixture-admin' };
      if (name === '@/lib/orders/nicepayCancel') return { cancelNicepayOrder() { throw new Error('Unexpected payment cancellation'); } };
      if (name === '@/lib/supabase/projectGuard') return { assertExpectedSupabaseProject: () => 'https://fixture.invalid' };
      if (name === '@/lib/orders/notifications') return {
        getOrderNotificationSummary: () => null, getOrderNotificationHistory: () => [],
        projectPhoneRelayOrderNotifications: async (_client, orders) => orders,
        getCurrentOrderNotificationEvent: order => order.shipping_status === 'delivered' ? 'delivered'
          : order.shipping_status === 'shipping' ? 'shipping_started' : 'payment_confirmed',
        dispatchOrderNotifications: async (_client, id, event) => {
          state.notifications.push({ id, event });
          if (hooks.notificationThrow) throw new Error('SECRET_PROVIDER_ERROR');
          return { channels: { customerSms: { status: hooks.notificationStatus || 'queued' },
            customerEmail: { status: 'sent' } } };
        },
      };
      if (name.startsWith('@/')) return load(path.join('src', name.slice(2)) + '.ts');
      if (name.startsWith('./') || name.startsWith('../')) return load(path.resolve(path.dirname(absolute), name) + '.ts');
      return nativeRequire(name);
    }, mod, mod.exports, { env: { NEXT_PUBLIC_SUPABASE_ANON_KEY: 'fixture', SUPABASE_SERVICE_ROLE_KEY: 'fixture' } });
    return mod.exports;
  }
  const route = load('src/app/api/admin/orders/route.ts');
  return { state, load, patch: async (body) => {
    const response = await route.PATCH(new Request('http://localhost/api/admin/orders', {
      method: 'PATCH', headers: { authorization: 'Bearer fixture', 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }));
    return { status: response.status, body: await response.json() };
  } };
}
const tracking = { shippingCompany: '우체국', trackingNumber: '1234567890123' };
const shipped = { shipping_status: 'shipping', shipping_company: '우체국', tracking_number: '1234567890123', shipped_at: '2026-10-01T00:00:00.000Z' };

test('only authenticated admin can read pending return intake with an allowlisted request', async () => {
  const h = harness({ raw_payload: { secretProviderData: 'PRIVATE_PAYLOAD', returnRequest: {
    status: 'requested', requestedAt: '2026-10-24T00:00:00Z', reason: 'Synthetic return reason', requestedByUserId: 'PRIVATE_USER',
  } } });
  const route = h.load('src/app/api/admin/orders/route.ts');
  assert.equal((await route.GET(new Request('http://localhost/api/admin/orders?returns=1'))).status, 401);
  const foreign = harness({}, { userId: 'fixture-customer' }).load('src/app/api/admin/orders/route.ts');
  assert.equal((await foreign.GET(new Request('http://localhost/api/admin/orders?returns=1', { headers: { authorization: 'Bearer fixture' } }))).status, 403);
  const response = await route.GET(new Request('http://localhost/api/admin/orders?returns=1', { headers: { authorization: 'Bearer fixture' } }));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body.orders[0].returnRequest, { status: 'requested', requestedAt: '2026-10-24T00:00:00Z', reason: 'Synthetic return reason' });
  assert.doesNotMatch(JSON.stringify(body), /PRIVATE_/);
  h.state.row.raw_payload.returnRequest.status = 'completed';
  assert.equal((await (await route.GET(new Request('http://localhost/api/admin/orders?returns=1', { headers: { authorization: 'Bearer fixture' } }))).json()).orders.length, 0);
  assert.equal(h.state.writes.length, 0);
  assert.equal(h.state.notifications.length, 0);
});

test('shipping advances explicitly, records history, and preserves first shipment/delivery times', async () => {
  const h = harness();
  assert.equal((await h.patch({ id: 'fixture-order', shippingStatus: 'shipping', ...tracking })).status, 200);
  const firstShippedAt = h.state.row.shipped_at;
  assert.ok(firstShippedAt);
  assert.equal(h.state.row.delivered_at, null);
  assert.deepEqual(h.state.notifications.map(x => x.event), ['shipping_started']);
  assert.equal((await h.patch({ id: 'fixture-order', shippingStatus: 'delivered' })).status, 200);
  const firstDeliveredAt = h.state.row.delivered_at;
  assert.ok(firstDeliveredAt);
  assert.equal(h.state.row.shipped_at, firstShippedAt);
  const before = clone(h.state.row);
  assert.equal((await h.patch({ id: 'fixture-order', shippingStatus: 'delivered' })).status, 200);
  assert.deepEqual(h.state.row, before);
  assert.equal(h.state.row.delivered_at, firstDeliveredAt);
  assert.equal(h.state.writes.length, 2);
  assert.equal(h.state.notifications.length, 2);
  assert.deepEqual(h.state.row.raw_payload.shippingHistory.map(x => [x.from, x.to]), [['preparing', 'shipping'], ['shipping', 'delivered']]);
  assert.deepEqual(h.state.row.raw_payload.checkout, { preserved: true });
});

for (const [from, to] of [['preparing', 'delivered'], ['shipping', 'preparing'], ['delivered', 'shipping'], ['delivered', 'preparing']]) {
  test(`rejects invalid shipping transition ${from} → ${to} without writes or notifications`, async () => {
    const h = harness({ ...shipped, shipping_status: from, delivered_at: from === 'delivered' ? '2026-10-03T00:00:00.000Z' : null });
    const before = clone(h.state.row);
    const result = await h.patch({ id: 'fixture-order', shippingStatus: to });
    assert.equal(result.status, 409);
    assert.deepEqual(h.state.row, before);
    assert.equal(h.state.writes.length, 0); assert.equal(h.state.notifications.length, 0);
  });
}

test('outbound states require both carrier and tracking, including corrections that clear them', async () => {
  for (const patch of [{}, { shippingCompany: '우체국' }, { trackingNumber: '1234567890123' }]) {
    const h = harness();
    assert.equal((await h.patch({ id: 'fixture-order', shippingStatus: 'shipping', ...patch })).status, 409);
    assert.equal(h.state.writes.length, 0);
  }
  for (const patch of [{ shippingCompany: '' }, { trackingNumber: ' ' }]) {
    const h = harness(shipped);
    assert.equal((await h.patch({ id: 'fixture-order', ...patch })).status, 409);
    assert.equal(h.state.writes.length, 0);
  }
});

test('all unconfirmed/cancelled payment states block outbound and shipment corrections', async () => {
  for (const [method, status] of [['bank_transfer', 'pending_transfer'], ['nicepay', 'pending_payment'],
    ['nicepay', 'approval_processing'], ['nicepay', 'cancel_processing'], ['paypal', 'unknown'],
    ['bank_transfer', 'refund_pending'], ['bank_transfer', 'cancelled']]) {
    for (const current of ['preparing', 'shipping']) {
      const h = harness({ ...shipped, shipping_status: current, payment_method: method, payment_status: status });
      const result = await h.patch({ id: 'fixture-order', shippingStatus: 'shipping', trackingNumber: 'NEW-TRACK' });
      assert.equal(result.status, 409, `${method}/${status}/${current}`);
      assert.equal(h.state.writes.length, 0); assert.equal(h.state.notifications.length, 0);
    }
  }
});

test('partial note/payment saves preserve omitted shipment details and original timestamps', async () => {
  const h = harness({ ...shipped, shipping_status: 'delivered', delivered_at: '2026-10-03T00:00:00.000Z' });
  const response = await h.patch({ id: 'fixture-order', shippingNote: '메모 정정', paymentStatus: 'transfer_confirmed' });
  assert.equal(response.status, 200);
  for (const key of ['shipping_status', 'shipping_company', 'tracking_number', 'shipped_at']) assert.equal(h.state.row[key], { ...shipped, shipping_status: 'delivered' }[key]);
  assert.equal(h.state.row.delivered_at, '2026-10-03T00:00:00.000Z');
  assert.equal(h.state.notifications.length, 0);
  assert.equal(h.state.row.raw_payload.shippingHistory[0].kind, 'details_changed');
});

test('legacy unknown shipment timestamp is preserved when delivery is confirmed', async () => {
  const h = harness({ ...shipped, shipped_at: null });
  assert.equal((await h.patch({ id: 'fixture-order', shippingStatus: 'delivered' })).status, 200);
  assert.equal(h.state.row.shipped_at, null);
  assert.ok(h.state.row.delivered_at);
});

test('tracking-only correction dispatches a new shipment event once and increments durable revision', async () => {
  const h = harness(shipped);
  assert.equal((await h.patch({ id: 'fixture-order', trackingNumber: 'CORRECTED-TRACK' })).status, 200);
  assert.equal(h.state.row.raw_payload.shippingNotificationRevision, 1);
  assert.equal(h.state.row.raw_payload.shippingHistory[0].kind, 'tracking_corrected');
  assert.equal(h.state.row.shipped_at, shipped.shipped_at);
  assert.equal(h.state.notifications.length, 1);
  assert.equal((await h.patch({ id: 'fixture-order', trackingNumber: 'CORRECTED-TRACK' })).status, 200);
  assert.equal(h.state.writes.length, 1); assert.equal(h.state.notifications.length, 1);
  assert.equal((await h.patch({ id: 'fixture-order', trackingNumber: shipped.tracking_number })).status, 200);
  assert.equal(h.state.row.raw_payload.shippingNotificationRevision, 2);
  assert.equal(h.state.notifications.length, 2);
});

for (const notificationStatus of ['failed', 'unknown', 'sending', 'not_configured']) {
  test(`saved shipment and ${notificationStatus} notification are reported separately`, async () => {
    const h = harness(shipped, { notificationStatus });
    const response = await h.patch({ id: 'fixture-order', trackingNumber: 'CORRECTED-TRACK' });
    assert.equal(response.status, 200);
    assert.equal(response.body.saved, true);
    assert.equal(response.body.notificationOutcome, 'attention_required');
    assert.match(response.body.message, /저장은 완료/);
    assert.equal(h.state.row.tracking_number, 'CORRECTED-TRACK');
  });
}

test('thrown notification failure leaves shipment saved with explicit attention outcome and no private error', async () => {
  const h = harness(shipped, { notificationThrow: true });
  const response = await h.patch({ id: 'fixture-order', trackingNumber: 'CORRECTED-TRACK' });
  assert.equal(response.status, 200); assert.equal(response.body.saved, true);
  assert.equal(response.body.notificationOutcome, 'attention_required');
  assert.doesNotMatch(JSON.stringify(response.body), /SECRET_PROVIDER_ERROR/);
  assert.equal(h.state.row.tracking_number, 'CORRECTED-TRACK');
});

for (const field of ['tracking_number', 'shipping_company', 'shipping_note', 'shipped_at', 'delivered_at', 'raw_payload']) {
  test(`concurrent ${field} change rejects stale write without losing other work`, async () => {
    const value = field === 'raw_payload' ? { preserved: 'concurrent notification' } : 'concurrent-value';
    const h = harness(shipped, { beforeUpdate: state => { state.row[field] = value; } });
    const response = await h.patch({ id: 'fixture-order', trackingNumber: 'CORRECTED-TRACK' });
    assert.equal(response.status, 409); assert.deepEqual(h.state.row[field], value);
    assert.equal(h.state.notifications.length, 0);
  });
}

test('malformed request values cannot silently change shipping', async () => {
  const h = harness(shipped);
  for (const body of [null, [], 'invalid', { id: 'fixture-order', shippingStatus: 123 },
    { id: 'fixture-order', trackingNumber: null }, { id: 'fixture-order', shippingCompany: {} },
    { id: 'fixture-order', shippingNote: 'a\u0000b' }, { id: 'fixture-order', trackingNumber: 'x'.repeat(121) }]) {
    assert.equal((await h.patch(body)).status, 400);
  }
  assert.equal(h.state.writes.length, 0);
});

test('database read/update errors expose safe messages', async () => {
  for (const hook of [{ readError: true }, { updateError: true }]) {
    const h = harness(shipped, hook);
    const response = await h.patch({ id: 'fixture-order', trackingNumber: 'CORRECTED-TRACK' });
    assert.equal(response.status, 500);
    assert.doesNotMatch(JSON.stringify(response.body), /SECRET_DB_ERROR/);
    assert.equal(h.state.notifications.length, 0);
  }
});


test('PATCH cannot bypass shipped-order refund restrictions using a payment-only save', async () => {
  for (const shipping_status of ['shipping', 'delivered']) {
    for (const [payment_status, paymentStatus] of [['transfer_confirmed', 'refund_pending'], ['refund_pending', 'cancelled']]) {
      const h = harness({ ...shipped, shipping_status, payment_status });
      assert.equal((await h.patch({ id: 'fixture-order', paymentStatus })).status, 409);
      assert.equal(h.state.writes.length, 0);
    }
  }
});
