/* eslint-disable @typescript-eslint/no-require-imports -- Node's isolated CommonJS test runner. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');
const ts = require('typescript');

// The database is an atomic, in-memory CAS fixture. Providers are replaced at
// the import boundary, so production credentials can never send messages here.
const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const channels = ['adminEmail', 'customerEmail', 'customerSms', 'adminSms'];

function load(send) {
  const cache = new Map();
  function loadFile(file) {
    const absolute = path.resolve(file);
    if (cache.has(absolute)) return cache.get(absolute).exports;
    const mod = { exports: {} };
    cache.set(absolute, mod);
    const compiled = ts.transpileModule(fs.readFileSync(absolute, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    vm.runInThisContext(`(function(require,module,exports,process){${compiled}\n})`, { filename: absolute })(name => {
      if (name === 'server-only') return {};
      if (name === 'node:crypto') return crypto;
      if (name === './notificationProviders') return { sendOrderNotificationMessage: send };
      if (name.startsWith('./')) return loadFile(path.join(path.dirname(absolute), name + '.ts'));
      throw new Error('Unexpected notification import: ' + name);
    }, mod, mod.exports, { env: { ORDER_NOTIFICATION_EMAIL: 'owner@example.test', ADMIN_NOTIFICATION_PHONE: '01099998888' } });
    return mod.exports;
  }
  return loadFile('src/lib/orders/notifications.ts');
}

function fixture(overrides = {}) {
  return {
    id: 'order-fixture', order_code: 'ENICO-TEST-1', guest_order_number: null,
    channel: 'member', payment_method: 'bank_transfer', payment_status: 'pending_transfer',
    amount_total: 123000, currency: 'KRW', customer_name: '테스트 주문자',
    customer_email: 'customer@example.test', customer_phone: '01012345678',
    bank_name: '테스트은행', bank_account_number: 'fixture-account',
    items: [{ id: 'product-1', name: 'BLUEPRINT PANTS', quantity: 1 }],
    shipping_status: null, shipping_company: null, tracking_number: null,
    raw_payload: { checkout: { source: 'fixture', nested: ['keep', 7] } },
    ...overrides,
  };
}

function eventKey(order, event) {
  const shipping = event === 'shipping_started' || event === 'delivered'
    ? `${order.shipping_company}:${order.tracking_number}` : '';
  return crypto.createHash('sha256').update(`${order.id}:${event}:${shipping}`).digest('hex');
}

function dbFixture(initial, hooks = {}) {
  const db = { row: clone(initial), writes: [], reads: 0 };
  db.client = {
    from(table) {
      assert.equal(table, 'orders');
      const filters = [];
      let payload;
      const query = {
        select() { return query; },
        update(value) { payload = clone(value); return query; },
        eq(key, value) { filters.push({ kind: 'eq', key, value }); return query; },
        is(key, value) { filters.push({ kind: 'is', key, value }); return query; },
        async maybeSingle() {
          if (!payload) {
            db.reads += 1;
            const snapshot = clone(db.row);
            if (hooks.afterRead) await hooks.afterRead(db, db.reads);
            return { data: snapshot, error: null };
          }
          const write = { filters: clone(filters), payload: clone(payload), matched: false };
          db.writes.push(write);
          if (hooks.beforeWrite) await hooks.beforeWrite(db, write, db.writes.length);
          const matched = filters.every(filter => {
            const actual = db.row[filter.key];
            if (filter.kind === 'is') return actual === filter.value;
            if (filter.key === 'raw_payload') {
              // PostgreSQL jsonb equality compares the entire JSON value, not
              // containment of selected keys. It also distinguishes JSON text.
              return isDeepStrictEqual(actual, JSON.parse(filter.value));
            }
            return isDeepStrictEqual(actual, filter.value);
          });
          write.matched = matched;
          if (!matched) return { data: null, error: null };
          Object.assign(db.row, clone(payload));
          if (hooks.afterWrite) await hooks.afterWrite(db, write, db.writes.length);
          return { data: { id: db.row.id }, error: null };
        },
      };
      return query;
    },
  };
  return db;
}

test('concurrent dispatchers claim each order/event/channel once using complete raw JSON equality', async () => {
  const db = dbFixture(fixture());
  const calls = [];
  const subject = load(async message => {
    calls.push(clone(message));
    // Let the other dispatcher inspect the durable sending claim.
    await new Promise(resolve => setImmediate(resolve));
    return { status: 'sent', providerId: 'fixture-' + message.channel };
  });
  await Promise.all(Array.from({ length: 3 }, () => subject.dispatchOrderNotifications(db.client, db.row.id, 'order_received')));
  assert.equal(calls.length, 4);
  for (const channel of channels) assert.equal(calls.filter(call => call.channel === channel).length, 1, channel);
  const summary = subject.getOrderNotificationSummary(db.row.raw_payload);
  for (const channel of channels) assert.equal(summary.channels[channel].status, 'sent', channel);
  assert.ok(db.writes.some(write => !write.matched), 'the fixture must exercise a losing CAS claim');
  for (const write of db.writes) {
    assert.equal(write.filters.filter(filter => filter.key === 'raw_payload').length, 1);
    assert.ok(write.filters.some(filter => filter.key === 'payment_status'));
  }
  assert.deepEqual(db.row.raw_payload.checkout, { source: 'fixture', nested: ['keep', 7] });
  assert.ok(calls.some(call => call.channel === 'adminSms' && call.to === '01099998888'));
  assert.ok(calls.some(call => call.channel === 'customerSms' && call.to === '01012345678'));
});

test('a provider result preserves cancellation and unrelated metadata committed during delivery', async () => {
  const db = dbFixture(fixture());
  const subject = load(async () => {
    db.row.payment_status = 'cancelled';
    db.row.raw_payload = { ...db.row.raw_payload,
      cancellation: { reason: 'customer-request', audit: { actor: 'fixture-owner' } },
      refundStatus: 'requested', paymentReceiptUrl: 'https://fixture.invalid/receipt',
    };
    return { status: 'sent', providerId: 'accepted-before-cancellation' };
  });
  await subject.dispatchOrderNotifications(db.client, db.row.id, 'order_received', { channels: ['customerSms'] });
  assert.equal(db.row.payment_status, 'cancelled');
  assert.deepEqual(db.row.raw_payload.cancellation, { reason: 'customer-request', audit: { actor: 'fixture-owner' } });
  assert.equal(db.row.raw_payload.refundStatus, 'requested');
  assert.equal(db.row.raw_payload.paymentReceiptUrl, 'https://fixture.invalid/receipt');
  assert.deepEqual(db.row.raw_payload.checkout, { source: 'fixture', nested: ['keep', 7] });
  assert.equal(subject.getOrderNotificationSummary(db.row.raw_payload).channels.customerSms.status, 'sent');
});

test('unrelated raw metadata added before a claim forces a retry rather than being overwritten', async () => {
  const db = dbFixture(fixture(), {
    beforeWrite(state, _write, number) {
      if (number === 1) state.row.raw_payload.otherTransaction = { id: 'must-survive', receipt: ['A', 'B'] };
    },
  });
  let calls = 0;
  const subject = load(async () => { calls += 1; return { status: 'sent', providerId: 'fixture-cas' }; });
  await subject.dispatchOrderNotifications(db.client, db.row.id, 'order_received', { channels: ['customerEmail'] });
  assert.equal(db.writes[0].matched, false);
  assert.equal(calls, 1);
  assert.deepEqual(db.row.raw_payload.otherTransaction, { id: 'must-survive', receipt: ['A', 'B'] });
});

for (const status of ['sent', 'unknown', 'sending']) {
  test(`${status} channels never resend, even through an explicit administrator retry`, async () => {
    const order = fixture();
    const key = eventKey(order, 'order_received');
    order.raw_payload.notifications = { version: 1, events: { [key]: {
      event: 'order_received', eventKey: key, createdAt: '2026-10-15T00:00:00.000Z',
      channels: { customerSms: { status, attemptId: 'existing-attempt' } },
    } } };
    const db = dbFixture(order);
    const subject = load(async () => { throw new Error('Existing acceptance or uncertain result must never resend'); });
    for (const retry of [false, true]) {
      const result = await subject.dispatchOrderNotifications(db.client, order.id, 'order_received', { channels: ['customerSms'], retry });
      assert.equal(result.channels.customerSms.status, status);
    }
    assert.equal(db.writes.length, 0);
  });
}

test('unknown provider outcomes remain durable and are not automatically retried', async () => {
  const db = dbFixture(fixture());
  let calls = 0;
  const subject = load(async () => { calls += 1; return { status: 'unknown', errorCode: 'OUTCOME_UNKNOWN' }; });
  await subject.dispatchOrderNotifications(db.client, db.row.id, 'order_received', { channels: ['adminSms'] });
  await subject.dispatchOrderNotifications(db.client, db.row.id, 'order_received', { channels: ['adminSms'], retry: true });
  assert.equal(calls, 1);
  assert.equal(subject.getOrderNotificationSummary(db.row.raw_payload).channels.adminSms.status, 'unknown');
});

test('events that do not match current payment or shipping state never claim or send', async () => {
  for (const [overrides, event] of [
    [{}, 'payment_confirmed'],
    [{ payment_status: 'transfer_confirmed' }, 'order_received'],
    [{ payment_status: 'cancelled', shipping_status: 'shipping' }, 'shipping_started'],
    [{ payment_status: 'refund_pending' }, 'refunded'],
    [{ payment_status: 'cancelled', raw_payload: { refundStatus: 'requested' } }, 'refunded'],
  ]) {
    const db = dbFixture(fixture(overrides));
    const subject = load(async () => { throw new Error('State mismatch must not send'); });
    const result = await subject.dispatchOrderNotifications(db.client, db.row.id, event);
    assert.equal(db.writes.length, 0);
    for (const channel of channels) {
      assert.equal(result.channels[channel].status, 'skipped');
      assert.equal(result.channels[channel].errorCode, 'order_state_changed');
    }
  }
});

test('refund-pending messages never claim that the money has already been refunded', async () => {
  const db = dbFixture(fixture({ payment_status: 'refund_pending' }));
  const calls = [];
  const subject = load(async message => { calls.push(message); return { status: 'sent', providerId: 'fixture-refund' }; });
  await subject.dispatchOrderNotifications(db.client, db.row.id, 'refund_pending', { channels: ['adminSms', 'customerEmail'] });
  assert.equal(calls.length, 2);
  for (const message of calls) {
    assert.match(message.subject, /환불 진행 중/);
    assert.doesNotMatch(message.subject, /환불 완료/);
    assert.match(message.text, /실제 환불 완료와는 구분/);
    assert.doesNotMatch(message.text, /환불 완료되었습니다|환불이 완료/);
    assert.ok(!message.text.includes('fixture-account'));
  }
});

test('a shipping-state change during claim prevents the stale shipping message', async () => {
  const order = fixture({ payment_status: 'transfer_confirmed', shipping_status: 'shipping',
    shipping_company: '배송사A', tracking_number: 'TRACK-OLD' });
  const db = dbFixture(order, { beforeWrite(state, _write, number) {
    if (number === 1) state.row.shipping_status = 'delivered';
  } });
  let calls = 0;
  const subject = load(async () => { calls += 1; return { status: 'sent' }; });
  await subject.dispatchOrderNotifications(db.client, db.row.id, 'shipping_started', { channels: ['customerSms'] });
  assert.equal(db.writes[0].matched, false);
  assert.equal(calls, 0);
  assert.equal(db.row.shipping_status, 'delivered');
  assert.equal(db.row.raw_payload.notifications, undefined);
});

test('tracking changes during a claim cannot create a second notification for the same latest shipment', async () => {
  const order = fixture({ payment_status: 'transfer_confirmed', shipping_status: 'shipping',
    shipping_company: '배송사A', tracking_number: 'TRACK-OLD' });
  const db = dbFixture(order, { beforeWrite(state, _write, number) {
    if (number === 1) {
      state.row.shipping_company = '배송사B';
      state.row.tracking_number = 'TRACK-NEW';
    }
  } });
  const calls = [];
  const subject = load(async message => { calls.push(message); return { status: 'sent', providerId: 'fixture-tracking' }; });
  await subject.dispatchOrderNotifications(db.client, db.row.id, 'shipping_started', { channels: ['customerSms'] });
  await subject.dispatchOrderNotifications(db.client, db.row.id, 'shipping_started', { channels: ['customerSms'] });
  assert.equal(db.writes[0].matched, false);
  assert.equal(calls.length, 1, 'the latest shipment must have exactly one accepted message');
  assert.match(calls[0].text, /TRACK-NEW/);
  assert.doesNotMatch(calls[0].text, /TRACK-OLD/);
});

test('a state transition after claiming is rechecked before contacting any provider', async () => {
  const order = fixture({ payment_status: 'transfer_confirmed', shipping_status: 'shipping',
    shipping_company: '배송사A', tracking_number: 'TRACK-OLD' });
  const db = dbFixture(order, { afterWrite(state, _write, number) {
    if (number === 1) {
      state.row.shipping_status = 'delivered';
      state.row.raw_payload.deliveryAudit = { source: 'concurrent-transition' };
    }
  } });
  let calls = 0;
  const subject = load(async () => { calls += 1; return { status: 'sent' }; });
  await subject.dispatchOrderNotifications(db.client, db.row.id, 'shipping_started', { channels: ['customerSms'] });
  assert.equal(calls, 0);
  assert.equal(db.row.shipping_status, 'delivered');
  assert.deepEqual(db.row.raw_payload.deliveryAudit, { source: 'concurrent-transition' });
  const channel = subject.getOrderNotificationSummary(db.row.raw_payload).channels.customerSms;
  assert.equal(channel.status, 'skipped');
  assert.equal(channel.errorCode, 'order_state_changed');
});

test('notification history exposes only safe channel status metadata', () => {
  const order = fixture();
  const key = eventKey(order, 'order_received');
  order.raw_payload.privatePaymentToken = 'must-not-leak';
  order.raw_payload.notifications = { version: 1, events: { [key]: {
    event: 'order_received', eventKey: key, createdAt: '2026-10-15T00:00:00.000Z',
    channels: { customerSms: { status: 'unknown', attemptId: 'internal-attempt', attemptedAt: '2026-10-15T00:00:00.000Z',
      providerId: 'fixture-provider', errorCode: 'UNKNOWN', to: '01012345678', text: 'private-message' },
    injected: { status: 'sent', providerId: 'must-not-leak' } },
  } } };
  const subject = load(async () => { throw new Error('Read-only history'); });
  const history = subject.getOrderNotificationHistory(order.raw_payload);
  assert.equal(history.length, 1);
  assert.deepEqual(Object.keys(history[0].channels), ['customerSms']);
  assert.deepEqual(history[0].channels.customerSms, {
    status: 'unknown', attemptedAt: '2026-10-15T00:00:00.000Z', providerId: 'fixture-provider', errorCode: 'UNKNOWN',
  });
  const serialized = JSON.stringify(history);
  for (const secret of ['must-not-leak', 'internal-attempt', '01012345678', 'private-message']) assert.ok(!serialized.includes(secret));
});


test('uppercase PayPal completion dispatches the same paid event without changing financial state', async () => {
  const db = dbFixture(fixture({ payment_method: 'paypal', payment_status: 'COMPLETED' }));
  const calls = [];
  const subject = load(async message => { calls.push(message); return { status: 'sent', providerId: 'paypal-mail' }; });
  await subject.dispatchOrderNotifications(db.client, db.row.id, 'payment_confirmed', { channels: ['customerEmail'] });
  assert.equal(calls.length, 1);
  assert.equal(db.row.payment_status, 'COMPLETED');
  assert.match(calls[0].text, /입금·결제 확인/);
});
