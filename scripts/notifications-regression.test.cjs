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

function load(send, relay = {}) {
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

for (const status of ['queued', 'claimed', 'submitted', 'stale', 'sent', 'unknown', 'sending']) {
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

test('a durable phone job precedes the owner wake-up email and never also calls the SMS provider', async () => {
  const db = dbFixture(fixture());
  const calls = [];
  const jobs = [];
  const subject = load(async message => {
    calls.push(clone(message));
    assert.equal(jobs.length, 1, 'the phone job must already exist before any owner email is sent');
    return { status: 'sent', providerId: 'provider-' + message.channel };
  }, { enqueue: async (client, message) => {
    assert.equal(client, db.client);
    jobs.push(clone(message));
    return { status: 'queued', providerId: 'phone-job-fixture' };
  }, revision: order => `revision-${order.payment_status}`, health: async () => ({ ready: true }) });
  const result = await subject.dispatchOrderNotifications(db.client, db.row.id, 'order_received');
  assert.equal(result.channels.customerSms.status, 'queued');
  assert.equal(result.channels.customerSms.providerId, 'phone-job-fixture');
  assert.deepEqual(calls.map(message => message.channel), ['adminEmail', 'customerEmail']);
  assert.equal(result.channels.adminSms.status, 'skipped');
  assert.equal(result.channels.adminSms.errorCode, 'PHONE_RELAY_OWNER_LOCAL_NOTIFICATION');
  assert.match(calls[0].subject, /^\[ENICO PHONE\] /);
  assert.doesNotMatch(calls[1].subject, /^\[ENICO PHONE\] /);
  assert.equal(jobs[0].orderId, db.row.id);
  assert.equal(jobs[0].event, 'order_received');
  assert.equal(jobs[0].eventRevision, 'revision-pending_transfer');
  assert.equal(jobs[0].to, db.row.customer_phone);
  assert.equal(jobs[0].eventKey, `${eventKey(db.row, 'order_received')}:customerSms`);
  await subject.dispatchOrderNotifications(db.client, db.row.id, 'order_received', { retry: true });
  assert.equal(jobs.length, 1, 'an administrator retry must not enqueue the accepted phone job again');
  assert.equal(calls.length, 2);
});

test('a phone queue failure remains uncertain without a second provider or wake-up instruction', async () => {
  const db = dbFixture(fixture());
  const calls = [];
  const subject = load(async message => {
    calls.push(message);
    return { status: 'sent', providerId: 'owner-email' };
  }, { enqueue: async () => { throw new Error('database response lost after insert'); } });
  const result = await subject.dispatchOrderNotifications(db.client, db.row.id, 'order_received',
    { channels: ['adminEmail', 'customerSms'] });
  assert.equal(result.channels.customerSms.status, 'unknown');
  assert.equal(result.channels.customerSms.errorCode, 'PHONE_RELAY_ENQUEUE_OUTCOME_UNKNOWN');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].channel, 'adminEmail');
  assert.doesNotMatch(calls[0].subject, /^\[ENICO PHONE\] /);
});

test('concurrent dispatchers cannot consume the owner email claim before the phone job is committed', async () => {
  const db = dbFixture(fixture());
  let releaseQueue;
  const queueWait = new Promise(resolve => { releaseQueue = resolve; });
  let enteredQueue;
  const queueStarted = new Promise(resolve => { enteredQueue = resolve; });
  let queueCommitted = false;
  const calls = [];
  const subject = load(async message => {
    calls.push(message);
    if (message.channel === 'adminEmail') {
      assert.equal(queueCommitted, true);
      assert.match(message.subject, /^\[ENICO PHONE\] /);
    }
    return { status: 'sent', providerId: 'accepted-' + message.channel };
  }, { enqueue: async () => {
    enteredQueue();
    await queueWait;
    queueCommitted = true;
    return { status: 'queued', providerId: 'phone-job-concurrent' };
  } });
  const first = subject.dispatchOrderNotifications(db.client, db.row.id, 'order_received');
  await queueStarted;
  await subject.dispatchOrderNotifications(db.client, db.row.id, 'order_received');
  assert.equal(calls.filter(message => message.channel === 'adminEmail').length, 0);
  releaseQueue();
  await first;
  assert.equal(calls.filter(message => message.channel === 'adminEmail').length, 1);
  assert.equal(subject.getOrderNotificationSummary(db.row.raw_payload).channels.customerSms.status, 'queued');
});

test('phone validation or stale-order rejection cannot fall through to a paid SMS provider', async () => {
  const db = dbFixture(fixture());
  let queueCalls = 0;
  const subject = load(async () => { throw new Error('A rejected relay job must not use a second provider'); },
    { enqueue: async () => {
      queueCalls += 1;
      return { status: 'skipped', errorCode: 'PHONE_RELAY_STALE_ORDER' };
    } });
  const result = await subject.dispatchOrderNotifications(db.client, db.row.id, 'order_received', { channels: ['customerSms'] });
  assert.equal(queueCalls, 1);
  assert.equal(result.channels.customerSms.status, 'skipped');
  assert.equal(result.channels.customerSms.errorCode, 'PHONE_RELAY_STALE_ORDER');
});

test('a disabled phone relay preserves the existing SOLAPI path and ordinary owner email subject', async () => {
  const db = dbFixture(fixture());
  const calls = [];
  const subject = load(async message => { calls.push(message); return { status: 'sent', providerId: 'solapi-or-email' }; });
  await subject.dispatchOrderNotifications(db.client, db.row.id, 'order_received', { channels: ['adminEmail', 'customerSms'] });
  assert.deepEqual(calls.map(message => message.channel), ['customerSms', 'adminEmail']);
  assert.doesNotMatch(calls[1].subject, /^\[ENICO PHONE\] /);
});

test('phone delivery views batch current queue outcomes without mutating durable order history', async () => {
  const subject = load(async () => { throw new Error('Projection must never send'); });
  const jobIds = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'];
  const summary = (key, id) => ({ event: 'order_received', eventKey: key,
    createdAt: '2026-10-15T00:00:00.000Z', channels: { customerSms: { status: 'queued', providerId: id } } });
  const first = summary('a'.repeat(64), jobIds[0]);
  const second = summary('b'.repeat(64), jobIds[1]);
  const orders = [{ id: 'first', notifications: first, notificationHistory: [first] },
    { id: 'second', notifications: second, notificationHistory: [second] }];
  const original = clone(orders);
  let queries = 0;
  const client = { from(table) {
    assert.equal(table, 'phone_relay_jobs');
    queries += 1;
    const query = {
      select(columns) { assert.equal(columns, 'id,order_id,event_key,status,created_at,claimed_at,claim_expires_at,acknowledged_at,expires_at'); return query; },
      in(column, values) { assert.equal(column, 'event_key'); assert.deepEqual(values, [`${first.eventKey}:customerSms`, `${second.eventKey}:customerSms`]); return query; },
      eq(column, value) {
        assert.equal(column, 'kind'); assert.equal(value, 'customer_sms');
        const now = Date.now();
        return Promise.resolve({ data: [first, second].map((entry, index) => ({
          id: jobIds[index], order_id: index ? 'second' : 'first', event_key: `${entry.eventKey}:customerSms`,
          status: index ? 'claimed' : 'submitted', created_at: new Date(now - 60_000).toISOString(),
          claimed_at: new Date(now - 30_000).toISOString(), claim_expires_at: new Date(now + 60_000).toISOString(),
          acknowledged_at: index ? null : new Date(now - 10_000).toISOString(), expires_at: new Date(now + 120_000).toISOString(),
        })), error: null });
      },
    };
    return query;
  } };
  const projected = await subject.projectPhoneRelayOrderNotifications(client, orders);
  assert.equal(queries, 1);
  assert.equal(projected[0].notifications.channels.customerSms.status, 'submitted');
  assert.equal(projected[1].notificationHistory[0].channels.customerSms.status, 'claimed');
  assert.equal(projected[0].notifications.channels.customerSms.deliveryConfirmed, false);
  assert.ok(projected[0].notifications.channels.customerSms.submittedAt);
  assert.deepEqual(orders, original, 'the source JSON and durable queued claim must remain untouched');
});

test('unavailable phone job status is never presented as confirmed delivery or silently retried', async () => {
  const subject = load(async () => { throw new Error('Projection must never send'); });
  const summary = { event: 'order_received', eventKey: 'a'.repeat(64), createdAt: '2026-10-15T00:00:00.000Z',
    channels: { customerSms: { status: 'queued', providerId: '11111111-1111-4111-8111-111111111111' } } };
  const orders = [{ id: 'order', notifications: summary, notificationHistory: [summary] }];
  const query = { select() { return query; }, in() { return query; },
    eq() { return Promise.resolve({ data: null, error: { message: 'private database detail' } }); } };
  const result = await subject.projectPhoneRelayOrderNotifications({ from: () => query }, orders);
  assert.equal(result[0].notifications.channels.customerSms.status, 'unknown');
  assert.equal(result[0].notifications.channels.customerSms.errorCode, 'PHONE_RELAY_STATUS_UNAVAILABLE');
  assert.equal(orders[0].notifications.channels.customerSms.status, 'queued');
  assert.ok(!JSON.stringify(result).includes('private database detail'));
});

test('bank-transfer pending guidance contains exact total, order number, bank and holder but no paid claim', async () => {
  const db = dbFixture(fixture());
  const calls = [];
  const subject = load(async message => { calls.push(message); return { status: 'sent' }; });
  await subject.dispatchOrderNotifications(db.client, db.row.id, 'order_received', { channels: ['customerSms'] });
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
  await subject.dispatchOrderNotifications(db.client, db.row.id, 'payment_confirmed', { channels: ['customerSms'] });
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
  await subject.dispatchOrderNotifications(db.client, db.row.id, 'payment_confirmed', { channels: ['customerSms'] });
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

function projectedFixture({ sourceStatus = 'queued', jobChanges = {}, messageChanges = {}, dataError = null } = {}) {
  const id = '11111111-1111-4111-8111-111111111111';
  const key = 'a'.repeat(64);
  const summary = { event: 'order_received', eventKey: key, createdAt: new Date().toISOString(),
    channels: { customerSms: { status: sourceStatus, providerId: id, ...messageChanges } } };
  const orders = [{ id: 'owned-order', notifications: summary, notificationHistory: [summary] }];
  const now = Date.now();
  const job = { id, order_id: 'owned-order', event_key: `${key}:customerSms`, status: 'queued',
    created_at: new Date(now - 60_000).toISOString(), claimed_at: null,
    claim_expires_at: null, acknowledged_at: null, expires_at: new Date(now + 60_000).toISOString(),
    ...jobChanges };
  const query = { select(columns) {
    for (const privateColumn of ['recipient_phone', 'message_text', 'claim_token_hash']) assert.ok(!columns.includes(privateColumn));
    return query;
  }, in() { return query; }, eq() { return Promise.resolve({ data: [job], error: dataError }); } };
  return { orders, job, client: { from(table) { assert.equal(table, 'phone_relay_jobs'); return query; } } };
}

for (const [name, jobChanges, status, reason] of [
  ['expired queued job', { expires_at: new Date(Date.now() - 60_000).toISOString() }, 'stale', 'PHONE_RELAY_EXPIRED'],
  ['expired claim', { status: 'claimed', claimed_at: new Date().toISOString(), claim_expires_at: new Date(Date.now() - 60_000).toISOString() }, 'unknown', 'PHONE_RELAY_CLAIM_EXPIRED'],
  ['unknown result', { status: 'unknown' }, 'unknown', 'PHONE_RELAY_RESULT_UNKNOWN'],
  ['stale before expiry', { status: 'stale' }, 'stale', 'PHONE_RELAY_STALE'],
  ['submitted without acknowledgement', { status: 'submitted' }, 'unknown', 'PHONE_RELAY_STATUS_UNAVAILABLE'],
]) {
  test(`${name} is accurately projected without changing queue or order state`, async () => {
    const f = projectedFixture({ jobChanges });
    const before = clone(f.orders);
    const subject = load(async () => { throw new Error('Projection cannot send'); });
    const result = await subject.projectPhoneRelayOrderNotifications(f.client, f.orders);
    const sms = result[0].notifications.channels.customerSms;
    assert.equal(sms.status, status);
    assert.equal(sms.reasonCode, reason);
    assert.equal(sms.deliveryConfirmed, false);
    assert.equal(sms.submittedAt, null);
    assert.deepEqual(f.orders, before);
  });
}

test('lost enqueue response is reconciled by exact event and order, without a resend', async () => {
  const f = projectedFixture({ sourceStatus: 'unknown', messageChanges: {
    providerId: undefined, errorCode: 'PHONE_RELAY_ENQUEUE_OUTCOME_UNKNOWN',
  } });
  const subject = load(async () => { throw new Error('Reconciliation cannot send'); });
  const result = await subject.projectPhoneRelayOrderNotifications(f.client, f.orders);
  assert.equal(result[0].notifications.channels.customerSms.status, 'queued');
  assert.equal(result[0].notifications.channels.customerSms.jobId, f.job.id);
  assert.equal(result[0].notifications.channels.customerSms.reasonCode, null);
});

test('another order or changed provider ID cannot expose a queue row by spoofed raw metadata', async () => {
  for (const jobChanges of [{ order_id: 'other-order' }, { id: '22222222-2222-4222-8222-222222222222' }]) {
    const f = projectedFixture({ jobChanges });
    const subject = load(async () => { throw new Error('Projection cannot send'); });
    const result = await subject.projectPhoneRelayOrderNotifications(f.client, f.orders);
    const sms = result[0].notifications.channels.customerSms;
    assert.equal(sms.status, 'unknown');
    assert.equal(sms.reasonCode, 'PHONE_RELAY_STATUS_UNAVAILABLE');
    assert.equal(sms.queuedAt, null);
  }
});

test('non-relay SOLAPI acceptance and uncertain outcomes are left unchanged by queue projection', async () => {
  const subject = load(async () => { throw new Error('Projection cannot send'); });
  for (const [sourceStatus, errorCode] of [['sent', undefined], ['unknown', 'SOLAPI_NETWORK_OUTCOME_UNKNOWN']]) {
    const f = projectedFixture({ sourceStatus, messageChanges: { errorCode } });
    const result = await subject.projectPhoneRelayOrderNotifications({ from() { throw new Error('No queue lookup expected'); } }, f.orders);
    assert.equal(result[0].notifications.channels.customerSms.status, sourceStatus);
    assert.equal(result[0].notifications.channels.customerSms.provider, undefined);
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


for (const prior of ['queued', 'claimed', 'unknown', 'sending', 'missing', 'inaccessible']) {
  test(`repeated tracking A→B→A does not duplicate an unresolved prior ${prior} SMS`, async () => {
    const order = fixture({ payment_status: 'transfer_confirmed', shipping_status: 'shipping', shipping_company: '우체국', tracking_number: 'TRACK-A' });
    const key = eventKey(order, 'shipping_started');
    order.raw_payload.notifications = { events: { [key]: { event: 'shipping_started', eventKey: key,
      createdAt: new Date().toISOString(), channels: { customerSms: { status: prior === 'sending' ? 'sending' : 'queued',
        ...(prior === 'sending' ? {} : { provider: 'phone_relay', providerId: 'prior-fixture-job' }) } } } } };
    order.raw_payload.shippingNotificationRevision = 2;
    const now = Date.now();
    const db = dbFixture(order, { relayReadError: prior === 'inaccessible', relayJobs: prior === 'missing' ? [] : [{
      id: 'prior-fixture-job', order_id: order.id, event_key: key + ':customerSms',
      status: ['queued', 'claimed', 'unknown'].includes(prior) ? prior : 'queued',
      created_at: new Date(now - 1000).toISOString(), expires_at: new Date(now + 60000).toISOString(),
      claimed_at: prior === 'claimed' ? new Date(now).toISOString() : null,
      claim_expires_at: new Date(now + 60000).toISOString(), acknowledged_at: null,
    }] });
    let enqueues = 0;
    const sent = [];
    const subject = load(async message => { sent.push(message); return { status: 'sent' }; }, {
      enqueue: async () => { enqueues++; return { status: 'queued', providerId: 'new-job' }; },
    });
    const summary = await subject.dispatchOrderNotifications(db.client, order.id, 'shipping_started', { channels: ['customerSms', 'customerEmail'] });
    assert.equal(enqueues, 0);
    assert.equal(summary.channels.customerSms.status, 'unknown');
    assert.equal(summary.channels.customerSms.errorCode, 'SHIPMENT_CORRECTION_RECONCILIATION_REQUIRED');
    assert.equal(sent.length, 1); assert.equal(sent[0].channel, 'customerEmail');
    await subject.dispatchOrderNotifications(db.client, order.id, 'shipping_started', { channels: ['customerSms'], retry: true });
    assert.equal(enqueues, 0);
  });
}

for (const status of ['submitted', 'stale']) {
  test(`prior exact ${status} relay job is terminal and permits one new correction`, async () => {
    const order = fixture({ payment_status: 'transfer_confirmed', shipping_status: 'shipping', shipping_company: '우체국', tracking_number: 'TRACK-A' });
    const key = eventKey(order, 'shipping_started');
    const now = Date.now();
    order.raw_payload.shippingNotificationRevision = 2;
    order.raw_payload.notifications = { events: { [key]: { event: 'shipping_started', eventKey: key,
      createdAt: new Date(now - 1000).toISOString(), channels: { customerSms: { status: 'queued', provider: 'phone_relay', providerId: 'prior-job' } } } } };
    const db = dbFixture(order, { relayJobs: [{ id: 'prior-job', order_id: order.id, event_key: key + ':customerSms', status,
      created_at: new Date(now - 1000).toISOString(), expires_at: new Date(now + 60000).toISOString(),
      claimed_at: new Date(now - 500).toISOString(), acknowledged_at: status === 'submitted' ? new Date(now).toISOString() : null }] });
    let enqueues = 0;
    const subject = load(async () => { throw new Error('No paid fallback'); }, { enqueue: async () => {
      enqueues++; return { status: 'queued', providerId: 'new-correction-job' };
    } });
    await subject.dispatchOrderNotifications(db.client, order.id, 'shipping_started', { channels: ['customerSms'] });
    await subject.dispatchOrderNotifications(db.client, order.id, 'shipping_started', { channels: ['customerSms'], retry: true });
    assert.equal(enqueues, 1);
  });
}

test('a nonlegacy prior revision is also recognized when tracking returns to that shipment', async () => {
  const order = fixture({ payment_status: 'transfer_confirmed', shipping_status: 'shipping', shipping_company: '우체국', tracking_number: 'TRACK-B' });
  const oldKey = crypto.createHash('sha256').update(`${order.id}:shipping_started:우체국:TRACK-B:revision:1`).digest('hex');
  order.raw_payload.shippingNotificationRevision = 3;
  order.raw_payload.notifications = { events: { [oldKey]: { event: 'shipping_started', eventKey: oldKey,
    shipment: { company: '우체국', trackingNumber: 'TRACK-B', revision: 1 }, createdAt: new Date().toISOString(),
    channels: { customerSms: { status: 'unknown' } } } } };
  const db = dbFixture(order);
  let enqueues = 0;
  const subject = load(async () => { throw new Error('No fallback'); }, { enqueue: async () => { enqueues++; return { status: 'queued' }; } });
  const summary = await subject.dispatchOrderNotifications(db.client, order.id, 'shipping_started', { channels: ['customerSms'] });
  assert.equal(enqueues, 0);
  assert.equal(summary.channels.customerSms.errorCode, 'SHIPMENT_CORRECTION_RECONCILIATION_REQUIRED');
});

test('a queued shipping-start message cannot suppress a later delivery event for the same tracking', async () => {
  const order = fixture({ payment_status: 'transfer_confirmed', shipping_status: 'delivered', shipping_company: '우체국', tracking_number: 'TRACK-A' });
  const oldKey = eventKey(order, 'shipping_started');
  order.raw_payload.shippingNotificationRevision = 2;
  order.raw_payload.notifications = { events: { [oldKey]: { event: 'shipping_started', eventKey: oldKey,
    createdAt: new Date().toISOString(), channels: { customerSms: { status: 'queued', provider: 'phone_relay' } } } } };
  const db = dbFixture(order);
  let enqueues = 0;
  const subject = load(async () => { throw new Error('No fallback'); }, { enqueue: async () => { enqueues++; return { status: 'queued' }; } });
  await subject.dispatchOrderNotifications(db.client, order.id, 'delivered', { channels: ['customerSms'] });
  assert.equal(enqueues, 1);
});
