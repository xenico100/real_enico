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
const channels = ['adminEmail', 'customerEmail'];

function load(send, relay = {}, env = {}) {
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
      if (name === './phoneRelay') return {
        enqueuePhoneRelayMessage: relay.enqueue || (async () => ({ status: 'not_configured' })),
        getPhoneRelayHealth: relay.health || (async () => ({ ready: false })),
        getPhoneRelayOrderRevision: relay.revision || (order => crypto.createHash('sha256')
          .update(JSON.stringify([order.payment_status, order.shipping_status, order.shipping_company, order.tracking_number]))
          .digest('hex')),
      };
      if (name.startsWith('./')) return loadFile(path.join(path.dirname(absolute), name + '.ts'));
      throw new Error('Unexpected notification import: ' + name);
    }, mod, mod.exports, { env: { ORDER_NOTIFICATION_EMAIL: 'owner@example.test', ADMIN_NOTIFICATION_PHONE: '01099998888', ...env } });
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
      if (table === 'phone_relay_jobs') {
        let eventKeys = [];
        const query = {
          select() { return query; }, in(_field, values) { eventKeys = values; return query; }, eq() { return query; },
          then(resolve, reject) { return Promise.resolve({ data: (hooks.relayJobs || []).filter(job => eventKeys.includes(job.event_key)),
            error: hooks.relayReadError ? { code: 'FIXTURE_UNAVAILABLE' } : null }).then(resolve, reject); },
        };
        return query;
      }
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
  assert.equal(calls.length, 2);
  for (const channel of channels) assert.equal(calls.filter(call => call.channel === channel).length, 1, channel);
  const summary = subject.getOrderNotificationSummary(db.row.raw_payload);
  for (const channel of channels) assert.equal(summary.channels[channel].status, 'sent', channel);
  assert.ok(db.writes.some(write => !write.matched), 'the fixture must exercise a losing CAS claim');
  for (const write of db.writes) {
    assert.equal(write.filters.filter(filter => filter.key === 'raw_payload').length, 1);
    assert.ok(write.filters.some(filter => filter.key === 'payment_status'));
  }
  assert.deepEqual(db.row.raw_payload.checkout, { source: 'fixture', nested: ['keep', 7] });
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
  await subject.dispatchOrderNotifications(db.client, db.row.id, 'order_received', { channels: ['customerEmail'] });
  assert.equal(db.row.payment_status, 'cancelled');
  assert.deepEqual(db.row.raw_payload.cancellation, { reason: 'customer-request', audit: { actor: 'fixture-owner' } });
  assert.equal(db.row.raw_payload.refundStatus, 'requested');
  assert.equal(db.row.raw_payload.paymentReceiptUrl, 'https://fixture.invalid/receipt');
  assert.deepEqual(db.row.raw_payload.checkout, { source: 'fixture', nested: ['keep', 7] });
  assert.equal(subject.getOrderNotificationSummary(db.row.raw_payload).channels.customerEmail.status, 'sent');
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

for (const status of ['queued', 'claimed', 'submitted', 'stale', 'sent', 'unknown', 'sending']) {
  test(`${status} channels never resend, even through an explicit administrator retry`, async () => {
    const order = fixture();
    const key = eventKey(order, 'order_received');
    order.raw_payload.notifications = { version: 1, events: { [key]: {
      event: 'order_received', eventKey: key, createdAt: '2026-10-15T00:00:00.000Z',
      channels: { customerEmail: { status, attemptId: 'existing-attempt' } },
    } } };
    const db = dbFixture(order);
    const subject = load(async () => { throw new Error('Existing acceptance or uncertain result must never resend'); });
    for (const retry of [false, true]) {
      const result = await subject.dispatchOrderNotifications(db.client, order.id, 'order_received', { channels: ['customerEmail'], retry });
      assert.equal(result.channels.customerEmail.status, status);
    }
    assert.equal(db.writes.length, 0);
  });
}

test('unknown provider outcomes remain durable and are not automatically retried', async () => {
  const db = dbFixture(fixture());
  let calls = 0;
  const subject = load(async () => { calls += 1; return { status: 'unknown', errorCode: 'OUTCOME_UNKNOWN' }; });
  await subject.dispatchOrderNotifications(db.client, db.row.id, 'order_received', { channels: ['adminEmail'] });
  await subject.dispatchOrderNotifications(db.client, db.row.id, 'order_received', { channels: ['adminEmail'], retry: true });
  assert.equal(calls, 1);
  assert.equal(subject.getOrderNotificationSummary(db.row.raw_payload).channels.adminEmail.status, 'unknown');
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
  await subject.dispatchOrderNotifications(db.client, db.row.id, 'refund_pending', { channels: ['adminEmail', 'customerEmail'] });
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
  await subject.dispatchOrderNotifications(db.client, db.row.id, 'shipping_started', { channels: ['customerEmail'] });
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
  await subject.dispatchOrderNotifications(db.client, db.row.id, 'shipping_started', { channels: ['customerEmail'] });
  await subject.dispatchOrderNotifications(db.client, db.row.id, 'shipping_started', { channels: ['customerEmail'] });
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
  await subject.dispatchOrderNotifications(db.client, db.row.id, 'shipping_started', { channels: ['customerEmail'] });
  assert.equal(calls, 0);
  assert.equal(db.row.shipping_status, 'delivered');
  assert.deepEqual(db.row.raw_payload.deliveryAudit, { source: 'concurrent-transition' });
  const channel = subject.getOrderNotificationSummary(db.row.raw_payload).channels.customerEmail;
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
    status: 'unknown', attemptedAt: '2026-10-15T00:00:00.000Z', providerId: 'fixture-provider', errorCode: 'UNKNOWN', deliveryConfirmed: false,
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
  assert.match(calls[0].text, /PayPal 결제 완료/);
});

test('bank-transfer pending guidance contains exact total, order number, bank and holder but no paid claim', async () => {
  const db = dbFixture(fixture());
  const calls = [];
  const subject = load(async message => { calls.push(message); return { status: 'sent' }; });
  await subject.dispatchOrderNotifications(db.client, db.row.id, 'order_received', { channels: ['customerEmail'] });
  assert.equal(calls.length, 1);
  assert.match(calls[0].subject, /입금 대기/);
  assert.match(calls[0].text, /주문번호: ENICO-TEST-1/);
  assert.match(calls[0].text, /입금할 금액: 123,000원/);
  assert.match(calls[0].text, /테스트은행 fixture-account/);
  assert.match(calls[0].text, /예금주:/);
  assert.doesNotMatch(calls[0].text, /카드 결제가 승인|입금이 확인되었습니다/);
});

test('persisted approved card orders get payment-complete copy without a transfer request', async () => {
  const db = dbFixture(fixture({ payment_method: 'nicepay', payment_status: 'paid' }));
  const calls = [];
  const subject = load(async message => { calls.push(message); return { status: 'sent' }; });
  await subject.dispatchOrderNotifications(db.client, db.row.id, 'payment_confirmed', { channels: ['customerEmail'] });
  assert.equal(calls.length, 1);
  assert.match(calls[0].subject, /카드 결제 완료/);
  assert.match(calls[0].text, /카드 결제가 승인되었습니다/);
  assert.match(calls[0].text, /추가 입금은 필요하지 않습니다/);
  assert.doesNotMatch(calls[0].text, /fixture-account|예금주:|입금할 금액:|입금 대기/);
});

test('bank-paid copy acknowledges confirmed remittance without requesting a second payment', async () => {
  const db = dbFixture(fixture({ payment_status: 'transfer_confirmed' }));
  const calls = [];
  const subject = load(async message => { calls.push(message); return { status: 'sent' }; });
  await subject.dispatchOrderNotifications(db.client, db.row.id, 'payment_confirmed', { channels: ['customerEmail'] });
  assert.equal(calls.length, 1);
  assert.match(calls[0].subject, /입금 확인 완료/);
  assert.match(calls[0].text, /입금이 확인되었습니다/);
  assert.doesNotMatch(calls[0].text, /fixture-account|예금주:|입금할 금액:/);
});

test('unapproved, ambiguous and mismatched payment states never dispatch a paid notification', async () => {
  for (const [payment_method, payment_status] of [
    ['nicepay', 'pending_payment'], ['nicepay', 'approval_processing'], ['nicepay', 'captured'],
    ['bank_transfer', 'pending_transfer'], ['bank_transfer', 'paid'], ['unknown', 'paid'],
  ]) {
    const db = dbFixture(fixture({ payment_method, payment_status }));
    const subject = load(async () => { throw new Error('Unverified state must not send'); });
    await subject.dispatchOrderNotifications(db.client, db.row.id, 'payment_confirmed');
    assert.equal(db.writes.length, 0);
  }
});

test('tracking corrections have durable revisions, truthful copy, and one delivery per revision', async () => {
  const order = fixture({ payment_status: 'transfer_confirmed', shipping_status: 'shipping',
    shipping_company: '우체국', tracking_number: 'TRACK-A' });
  const db = dbFixture(order);
  const messages = [];
  const subject = load(async message => { messages.push(clone(message)); return { status: 'sent', providerId: 'fixture-' + messages.length }; });
  await subject.dispatchOrderNotifications(db.client, order.id, 'shipping_started', { channels: ['customerEmail'] });
  assert.match(messages[0].subject, /배송 시작/);
  for (const [revision, number] of [[1, 'TRACK-B'], [2, 'TRACK-A']]) {
    db.row.tracking_number = number;
    db.row.raw_payload.shippingNotificationRevision = revision;
    db.row.raw_payload.shippingHistory = [...(db.row.raw_payload.shippingHistory || []), {
      actor: 'admin', kind: 'tracking_corrected', changedAt: new Date().toISOString(),
      from: 'shipping', to: 'shipping', previousCompany: '우체국', shippingCompany: '우체국',
      previousTrackingNumber: revision === 1 ? 'TRACK-A' : 'TRACK-B', trackingNumber: number,
    }];
    db.row.raw_payload.shippingHistory.push({ actor: 'admin', kind: 'details_changed', changedAt: new Date().toISOString(),
      from: 'shipping', to: 'shipping', shippingCompany: '우체국', trackingNumber: number });
    await subject.dispatchOrderNotifications(db.client, order.id, 'shipping_started', { channels: ['customerEmail'] });
    await subject.dispatchOrderNotifications(db.client, order.id, 'shipping_started', { channels: ['customerEmail'], retry: true });
    assert.equal(messages.length, revision + 1);
    assert.match(messages[revision].subject, /배송 정보 정정/);
    assert.match(messages[revision].text, new RegExp('운송장: ' + number));
    assert.match(messages[revision].text, /최신 택배사와 운송장/);
  }
  assert.equal(new Set(messages.map(message => message.eventKey)).size, 3);
  assert.equal(subject.getOrderNotificationHistory(db.row.raw_payload).length, 3);
});

test('provider throws become persisted uncertain results, never a duplicate retry', async () => {
  const db = dbFixture(fixture());
  let calls = 0;
  const subject = load(async () => { calls++; throw new Error('SECRET_PROVIDER_FAILURE'); });
  const first = await subject.dispatchOrderNotifications(db.client, db.row.id, 'order_received', { channels: ['customerEmail'] });
  assert.equal(first.channels.customerEmail.status, 'unknown');
  assert.equal(first.channels.customerEmail.errorCode, 'notification_provider_outcome_unknown');
  assert.doesNotMatch(JSON.stringify(db.row.raw_payload), /SECRET_PROVIDER_FAILURE/);
  await subject.dispatchOrderNotifications(db.client, db.row.id, 'order_received', { channels: ['customerEmail'], retry: true });
  assert.equal(calls, 1);
});


test('Alimtalk mode concurrently dispatches exactly one Kakao message without a phone/LMS fallback', async () => {
  const db = dbFixture(fixture());
  const calls = [];
  const subject = load(async message => {
    calls.push(message);
    await new Promise(resolve => setImmediate(resolve));
    return { status: 'sent', provider: 'solapi_alimtalk', providerId: 'kakao-accepted' };
  }, { enqueue: async () => { throw new Error('Kakao mode must not enqueue SMS'); } },
  { ORDER_CUSTOMER_MESSAGE_CHANNEL: 'alimtalk' });
  await Promise.all([1, 2, 3].map(() => subject.dispatchOrderNotifications(db.client, db.row.id, 'order_received', { channels: ['customerSms'] })));
  assert.equal(calls.length, 1);
  const message = calls[0];
  assert.equal(message.channel, 'customerKakao');
  assert.equal(message.to, db.row.customer_phone);
  assert.match(message.text, /현재 입금 대기 상태/);
  assert.doesNotMatch(message.text, /결제가 확인|상품이 발송/);
  assert.equal(message.alimtalk.variables['#{주문번호}'], db.row.order_code);
  assert.equal(message.alimtalk.variables['#{입금액}'], '123,000원');
  const summary = subject.getOrderNotificationSummary(db.row.raw_payload);
  assert.equal(summary.channels.customerKakao.provider, 'solapi_alimtalk');
  assert.equal(summary.channels.customerKakao.deliveryConfirmed, false);
  assert.equal(summary.channels.customerSms, undefined);
});

for (const status of ['not_configured', 'failed', 'unknown']) test(`Kakao ${status} cannot fall through to SMS and ambiguous retries cannot duplicate`, async () => {
  const db = dbFixture(fixture());
  const calls = [];
  const subject = load(async message => { calls.push(message); return { status }; },
    { enqueue: async () => { throw new Error('Unexpected phone relay'); } }, { ORDER_CUSTOMER_MESSAGE_CHANNEL: 'alimtalk' });
  const summary = await subject.dispatchOrderNotifications(db.client, db.row.id, 'order_received', { channels: ['customerSms'] });
  assert.equal(summary.channels.customerKakao.status, status);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].channel, 'customerKakao');
  if (status === 'unknown') {
    await subject.dispatchOrderNotifications(db.client, db.row.id, 'order_received', { channels: ['customerSms'], retry: true });
    assert.equal(calls.length, 1);
  }
});

for (const status of ['queued', 'claimed', 'submitted', 'stale', 'sent', 'unknown', 'sending']) test(`switching to Kakao never repeats a prior ${status} SMS`, async () => {
  const order = fixture();
  const key = eventKey(order, 'order_received');
  order.raw_payload.notifications = { events: { [key]: { event: 'order_received', eventKey: key,
    createdAt: new Date().toISOString(), channels: { customerSms: { status } } } } };
  const db = dbFixture(order);
  const subject = load(async () => { throw new Error('Duplicate transport'); }, {}, { ORDER_CUSTOMER_MESSAGE_CHANNEL: 'alimtalk' });
  await subject.dispatchOrderNotifications(db.client, order.id, 'order_received', { channels: ['customerSms'], retry: true });
  assert.equal(db.writes.length, 0);
});

test('paid bank, Nicepay and PayPal orders use payment copy; unsupported events cannot masquerade as paid', async () => {
  for (const [payment_method, payment_status] of [['bank_transfer', 'transfer_confirmed'], ['nicepay', 'paid'], ['paypal', 'captured']]) {
    const db = dbFixture(fixture({ payment_method, payment_status }));
    const calls = [];
    const subject = load(async message => { calls.push(message); return { status: 'sent' }; }, {}, { ORDER_CUSTOMER_MESSAGE_CHANNEL: 'alimtalk' });
    await subject.dispatchOrderNotifications(db.client, db.row.id, 'payment_confirmed', { channels: ['customerSms'] });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].alimtalk.event, 'payment_confirmed');
    assert.match(calls[0].text, /주문 결제가 확인되었습니다/);
    assert.doesNotMatch(calls[0].text, /입금계좌|입금 대기/);
  }
  const db = dbFixture(fixture({ payment_status: 'cancelled' }));
  const subject = load(async () => { throw new Error('No approved cancellation template'); }, {}, { ORDER_CUSTOMER_MESSAGE_CHANNEL: 'alimtalk' });
  const result = await subject.dispatchOrderNotifications(db.client, db.row.id, 'cancelled', { channels: ['customerSms'] });
  assert.equal(result.channels.customerKakao.status, 'skipped');
});

test('shipping Alimtalk uses saved carrier/tracking and refuses an incomplete shipment', async () => {
  for (const tracking_number of ['1234567890123', null]) {
    const db = dbFixture(fixture({ payment_status: 'transfer_confirmed', shipping_status: 'shipping',
      shipping_company: '우체국택배', tracking_number }));
    const calls = [];
    const subject = load(async message => { calls.push(message); return { status: 'sent' }; }, {}, { ORDER_CUSTOMER_MESSAGE_CHANNEL: 'alimtalk' });
    const result = await subject.dispatchOrderNotifications(db.client, db.row.id, 'shipping_started', { channels: ['customerSms'] });
    assert.equal(calls.length, tracking_number ? 1 : 0);
    if (tracking_number) {
      assert.equal(calls[0].alimtalk.variables['#{송장번호}'], tracking_number);
      assert.equal(calls[0].alimtalk.variables['#{택배사}'], '우체국택배');
    } else assert.equal(result.channels.customerKakao.status, 'skipped');
  }
});
