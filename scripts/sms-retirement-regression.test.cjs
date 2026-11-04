/* eslint-disable @typescript-eslint/no-require-imports -- Isolated fixture-only regression runner. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const ts = require('typescript');

function load(file, env = {}, send = async () => { throw new Error('Unexpected provider'); }) {
  const cache = new Map();
  function moduleAt(file) {
    const absolute = path.resolve(file);
    if (cache.has(absolute)) return cache.get(absolute).exports;
    const mod = { exports: {} }; cache.set(absolute, mod);
    const compiled = ts.transpileModule(fs.readFileSync(absolute, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    vm.runInThisContext(`(function(require,module,exports,process){${compiled}\n})`, { filename: absolute })(name => {
      if (name === 'server-only') return {};
      if (name === 'node:crypto') return crypto;
      if (name === 'next/server') return { NextResponse: { json: (body, init) => Response.json(body, init) } };
      if (name === './notificationProviders') return { sendOrderNotificationMessage: send };
      if (name.startsWith('.')) return moduleAt(path.join(path.dirname(absolute), name + '.ts'));
      throw new Error('Unexpected retirement import: ' + name);
    }, mod, mod.exports, { env });
    return mod.exports;
  }
  return moduleAt(file);
}

function fixture() {
  const row = {
    id: 'retirement-order', order_code: 'ENICO-TEST', payment_method: 'bank_transfer', payment_status: 'pending_transfer',
    channel: 'member', amount_total: 10000, currency: 'KRW', customer_name: 'Fixture', customer_email: 'fixture@example.test',
    customer_phone: '01000000000', shipping_status: null, shipping_company: null, tracking_number: null,
    raw_payload: { checkout: { keep: true } }, items: [], bank_name: 'Fixture bank', bank_account_number: 'fixture-only',
  };
  let writes = 0;
  const client = { from(table) {
    assert.equal(table, 'orders', 'retired tables must never be queried');
    let update;
    const query = { select() { return query; }, eq() { return query; }, is() { return query; },
      update(value) { update = structuredClone(value); return query; },
      async maybeSingle() {
        if (update) { writes++; Object.assign(row, update); return { data: { id: row.id }, error: null }; }
        return { data: structuredClone(row), error: null };
      },
    };
    return query;
  }, rpc() { throw new Error('Retired RPC must never be called'); } };
  return { row, client, writes: () => writes };
}

test('old pairing, claim and acknowledgement clients receive 410 without any external boundary', async () => {
  for (const file of ['src/app/api/admin/phone-relay/route.ts', 'src/app/api/phone-relay/claim/route.ts', 'src/app/api/phone-relay/ack/route.ts']) {
    const route = load(file);
    for (const method of ['GET', 'POST']) {
      const response = await route[method](new Request('https://fixture.test/old-relay', { method }));
      assert.equal(response.status, 410);
      assert.equal(response.headers.get('cache-control'), 'no-store');
    }
  }
});

test('legacy SMS-only administrator retry sends nothing and does not write or query a queue', async () => {
  const db = fixture();
  const subject = load('src/lib/orders/notifications.ts');
  for (const retry of [false, true]) await subject.dispatchOrderNotifications(db.client, db.row.id, 'order_received', {
    channels: ['customerSms', 'adminSms'], retry,
  });
  assert.equal(db.writes(), 0);
  assert.deepEqual(db.row.raw_payload, { checkout: { keep: true } });
});

test('default order dispatch retains both email channels and sends each only once after SMS retirement', async () => {
  const db = fixture();
  const calls = [];
  const subject = load('src/lib/orders/notifications.ts', { ORDER_NOTIFICATION_EMAIL: 'owner@example.test' }, async message => {
    calls.push(message); return { status: 'sent', providerId: 'fixture-' + message.channel };
  });
  for (const retry of [false, true]) await subject.dispatchOrderNotifications(db.client, db.row.id, 'order_received', { retry });
  assert.deepEqual(calls.map(message => message.channel), ['adminEmail', 'customerEmail']);
  assert.ok(calls.every(message => !message.subject.includes('[ENICO PHONE]')));
  assert.equal(db.row.payment_status, 'pending_transfer');
  assert.deepEqual(db.row.raw_payload.checkout, { keep: true });
});

test('retired queue projection preserves financial JSON and terminal evidence without database reads', async () => {
  const subject = load('src/lib/orders/notifications.ts');
  for (const [status, expected] of [['queued','skipped'],['claimed','unknown'],['sending','unknown'],['submitted','submitted'],['stale','stale'],['unknown','unknown']]) {
    const summary = { event: 'order_received', eventKey: 'a'.repeat(64), createdAt: '2026-11-04T00:00:00Z',
      channels: { customerSms: { provider: 'phone_relay', status }, customerEmail: { status: 'sent' } } };
    const orders = [{ id: 'fixture', notifications: summary, notificationHistory: [summary] }];
    const original = structuredClone(orders);
    const [projected] = await subject.projectPhoneRelayOrderNotifications({ from() { throw new Error('No queue reads'); } }, orders);
    assert.equal(projected.notifications.channels.customerSms.status, expected);
    assert.equal(projected.notifications.channels.customerSms.deliveryConfirmed, false);
    assert.equal(projected.notifications.channels.customerEmail.status, 'sent');
    assert.deepEqual(orders, original);
  }
});
