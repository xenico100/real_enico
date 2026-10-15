/* eslint-disable @typescript-eslint/no-require-imports -- isolated Postgres/WASM validation. */
// Optional SQL integration runtime: npm install --prefix /tmp/enico-relay-validation --no-save @electric-sql/pglite@0.5.10
// NODE_PATH=/tmp/enico-relay-validation/node_modules node --test scripts/phone-relay-sql-regression.test.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const crypto = require('node:crypto');
let PGlite; let pgcrypto;
try { ({ PGlite } = require('@electric-sql/pglite')); ({ pgcrypto } = require('@electric-sql/pglite/contrib/pgcrypto')); } catch { /* Explicitly skipped if optional database runtime is unavailable. */ }
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const phone = '01099998888';

async function fixture() {
  const db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(`create schema extensions; create extension pgcrypto with schema extensions;
    create role anon; create role authenticated; create role service_role bypassrls;
    create table public.orders(id uuid primary key,payment_method text,payment_status text,shipping_status text,
      shipping_company text,tracking_number text,customer_phone text,amount_total bigint,currency text,
      bank_name text,bank_account_number text,items jsonb,raw_payload jsonb);`);
  await db.exec(fs.readFileSync('sql/phone_relay_setup.sql', 'utf8'));
  const one = async (sql, params = []) => (await db.query(sql, params)).rows[0]?.result;
  const rpc = async (name, params = [], casts = []) => one(`select public.${name}(${params.map((_, i) => `$${i + 1}${casts[i] ? '::' + casts[i] : ''}`).join(',')}) as result`, params);
  const deviceHash = hash('device-token'); const claimHash = hash('claim-token');
  const deviceId = await rpc('phone_relay_replace_device', [deviceHash, phone, new Date(Date.now() + 86400000).toISOString()]);
  const enqueue = async ({ kind = 'customer_sms', key, to = '01012345678', title = '안내', text = '고정 내용', orderId, event = 'order_received', revision, sourceAt }) => rpc('phone_relay_enqueue', [kind, key, to, title, text, orderId ?? null, kind === 'self_test' ? null : event, revision || {}, sourceAt], ['', '', '', '', '', 'uuid', '', 'jsonb', 'timestamptz']);
  const selfKey = 'selftest:' + crypto.randomBytes(32).toString('base64url');
  await enqueue({ kind: 'self_test', key: selfKey, to: phone, sourceAt: new Date().toISOString() });
  const initialClaim = await rpc('phone_relay_claim', [deviceHash, claimHash]);
  assert.equal(initialClaim.job.kind, 'self_test');
  await rpc('phone_relay_ack', [deviceHash, initialClaim.job.id, claimHash, 'submitted'], ['', 'uuid']);
  assert.equal(await rpc('phone_relay_control', ['enable']), true);
  await db.exec(`update public.phone_relay_devices set last_claim_at=null;`);
  async function order({ payment = 'pending_transfer', shipping = 'preparing', to = '01012345678', tracking = null, ageMs = -1000, event = 'order_received' } = {}) {
    const id = crypto.randomUUID(); const key = hash(id + event) + ':customerSms';
    const sourceAt = new Date(Date.now() - ageMs).toISOString();
    const raw = { notifications: { events: { [key.split(':')[0]]: { event, createdAt: sourceAt } } } };
    await db.query(`insert into public.orders values($1,'bank_transfer',$2,$3,'우체국',$4,$5,123000,'KRW',null,null,'[]',$6::jsonb)`, [id, payment, shipping, tracking, to, raw]);
    const revision = await one('select public.phone_relay_order_revision(to_jsonb(orders)) as result from orders where id=$1', [id]);
    return { orderId: id, key, to, event, revision, sourceAt };
  }
  return { db, rpc, one, enqueue, order, deviceHash, claimHash, deviceId };
}

test('SQL service-only permissions and RLS prevent anonymous or member queue access', { skip: !PGlite }, async () => {
  const f = await fixture();
  try {
    assert.equal(await f.one(`select has_table_privilege('anon','public.phone_relay_jobs','SELECT') as result`), false);
    assert.equal(await f.one(`select has_function_privilege('authenticated','public.phone_relay_claim(text,text)','EXECUTE') as result`), false);
    assert.equal(await f.one(`select bool_and(relrowsecurity) as result from pg_class where relname in ('phone_relay_devices','phone_relay_jobs')`), true);
    assert.equal(await f.one(`select bool_and(not prosecdef) as result from pg_proc where proname like 'phone_relay_%'`), true);
  } finally { await f.db.close(); }
});
test('SQL one atomic claim, exact capability ack, no duplicate after lost response or submitted', { skip: !PGlite }, async () => {
  const f = await fixture();
  try {
    const order = await f.order(); const queued = await f.enqueue(order);
    assert.equal(queued.status, 'queued');
    assert.equal((await f.enqueue(order)).id, queued.id);
    const claimed = await f.rpc('phone_relay_claim', [f.deviceHash, f.claimHash]);
    assert.equal(claimed.job.id, queued.id);
    assert.equal((await f.rpc('phone_relay_claim', [f.deviceHash, hash('other-claim')])).job, null);
    assert.equal((await f.rpc('phone_relay_ack', [f.deviceHash, queued.id, hash('wrong'), 'submitted'], ['', 'uuid'])).ok, false);
    assert.equal((await f.rpc('phone_relay_ack', [f.deviceHash, queued.id, f.claimHash, 'submitted'], ['', 'uuid'])).status, 'submitted');
    assert.equal((await f.rpc('phone_relay_ack', [f.deviceHash, queued.id, f.claimHash, 'submitted'], ['', 'uuid'])).ok, true);
    assert.equal((await f.enqueue(order)).status, 'already_claimed');
    assert.equal(await f.one('select recipient_phone is null and message_text=\'\' and event_revision=\'{}\'::jsonb as result from phone_relay_jobs where id=$1', [queued.id]), true);
  } finally { await f.db.close(); }
});
test('SQL cancellation, changed recipient and tracking invalidates queued content before phone claims', { skip: !PGlite }, async () => {
  const f = await fixture();
  try {
    for (const [index, mutation] of ["payment_status='cancelled'", "customer_phone='01088887777'", "tracking_number='changed'"].entries()) {
      const order = await f.order({ to: `0101234${5678 + index}` });
      const queued = await f.enqueue(order); assert.equal(queued.status, 'queued');
      await f.db.exec(`update orders set ${mutation} where id='${order.orderId}'; update phone_relay_devices set last_claim_at=null;`);
      assert.equal((await f.rpc('phone_relay_claim', [f.deviceHash, f.claimHash])).job, null);
      assert.equal(await f.one('select status as result from phone_relay_jobs where id=$1', [queued.id]), 'stale');
    }
  } finally { await f.db.close(); }
});
test('SQL historical retry before enabled_at is rejected while new lifecycle events on old orders work', { skip: !PGlite }, async () => {
  const f = await fixture();
  try {
    const historical = await f.order({ ageMs: 60000 });
    assert.equal((await f.enqueue(historical)).status, 'stale');
    const fresh = await f.order({ payment: 'transfer_confirmed', event: 'payment_confirmed' });
    assert.equal((await f.enqueue(fresh)).status, 'queued');
  } finally { await f.db.close(); }
});
test('SQL expired unacknowledged claim becomes unknown, pauses device and never replays', { skip: !PGlite }, async () => {
  const f = await fixture();
  try {
    const order = await f.order(); const queued = await f.enqueue(order);
    await f.rpc('phone_relay_claim', [f.deviceHash, f.claimHash]);
    await f.db.query("update phone_relay_jobs set claim_expires_at=now()-interval '1 second' where id=$1", [queued.id]);
    assert.equal((await f.rpc('phone_relay_claim', [f.deviceHash, hash('another')])).job, null);
    assert.equal(await f.one('select status as result from phone_relay_jobs where id=$1', [queued.id]), 'unknown');
    assert.equal(await f.one('select enabled as result from phone_relay_devices where id=$1', [f.deviceId]), false);
    assert.equal((await f.enqueue(order)).status, 'already_claimed');
  } finally { await f.db.close(); }
});
test('SQL pair replacement invalidates old device token and previous queued capabilities', { skip: !PGlite }, async () => {
  const f = await fixture();
  try {
    const queued = await f.enqueue(await f.order());
    await f.rpc('phone_relay_replace_device', [hash('new-device'), phone, new Date(Date.now() + 86400000).toISOString()]);
    assert.equal((await f.rpc('phone_relay_claim', [f.deviceHash, f.claimHash])).authorized, false);
    assert.equal(await f.one('select status as result from phone_relay_jobs where id=$1', [queued.id]), 'stale');
    assert.equal(await f.rpc('phone_relay_control', ['enable']), false);
  } finally { await f.db.close(); }
});
test('SQL recipient order cap allows same-order payment/shipping/delivery lifecycle without cooldown', { skip: !PGlite }, async () => {
  const f = await fixture();
  try {
    const order = await f.order(); assert.equal((await f.enqueue(order)).status, 'queued');
    const event = 'payment_confirmed'; const key = hash(order.orderId + event) + ':customerSms'; const sourceAt = new Date(Date.now() + 1000).toISOString();
    await f.db.query(`update orders set payment_status='transfer_confirmed',raw_payload=jsonb_set(raw_payload,'{notifications,events}',(raw_payload#>'{notifications,events}')||$2::jsonb) where id=$1`, [order.orderId, { [key.split(':')[0]]: { event, createdAt: sourceAt } }]);
    const revision = await f.one('select public.phone_relay_order_revision(to_jsonb(orders)) as result from orders where id=$1', [order.orderId]);
    assert.equal((await f.enqueue({ ...order, event, key, sourceAt, revision })).status, 'queued');
    assert.equal((await f.enqueue(await f.order())).status, 'limited');
  } finally { await f.db.close(); }
});
test('SQL cleanup scrubs expired content and old recipient hash while retaining event-key tombstone', { skip: !PGlite }, async () => {
  const f = await fixture();
  try {
    const order = await f.order(); const queued = await f.enqueue(order);
    await f.db.query("update phone_relay_jobs set expires_at=now()-interval '1 second',created_at=now()-interval '25 hours' where id=$1", [queued.id]);
    await f.rpc('phone_relay_cleanup');
    assert.deepEqual((await f.db.query('select status,recipient_phone,recipient_hash,message_text,event_key from phone_relay_jobs where id=$1', [queued.id])).rows[0], {
      status: 'stale', recipient_phone: null, recipient_hash: null, message_text: '', event_key: order.key,
    });
    assert.equal((await f.enqueue(order)).status, 'already_claimed');
  } finally { await f.db.close(); }
});
