/* eslint-disable @typescript-eslint/no-require-imports -- isolated Node regression runner. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');
const ts = require('typescript');

function load(overrides = {}) {
  const compiled = ts.transpileModule(fs.readFileSync('src/lib/orders/phoneRelay.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const mod = { exports: {} };
  const env = { ADMIN_NOTIFICATION_PHONE: '01099998888', ...overrides.env };
  vm.runInThisContext(`(function(require,module,exports,process){${compiled}\n})`)(name => {
    if (name === 'server-only') return {};
    if (name === 'node:crypto') return crypto;
    if (name === '@supabase/supabase-js') return { createClient: () => overrides.authClient };
    if (name === 'next/server') return { NextResponse: { json: (body, init) => ({ body, ...init }) } };
    if (name === '@/lib/security/identity') return { isPrimaryAdmin: user => user?.id === 'owner' && user?.verified === true };
    if (name === '@/lib/supabaseAdmin') return { getSupabaseAdminClient: () => overrides.adminClient };
    if (name === '@/lib/supabase/projectGuard') return { assertExpectedSupabaseProject: value => value || 'https://test.supabase.test' };
    if (name === './rawPayload') return { parseOrderRawPayload: raw => raw && typeof raw === 'object' ? raw : null };
    if (name === './notificationProviders') return { sendOrderNotificationMessage: overrides.send || (async () => ({ status: 'sent' })) };
    throw new Error('Unexpected import: ' + name);
  }, mod, mod.exports, { env });
  return mod.exports;
}
function clientFixture(order, { enabled = true, unavailable = false, rpcError = null, result = { status: 'queued', id: 'saved-job' } } = {}) {
  const calls = [];
  const client = {
    from(table) {
      const query = { select() { return query; }, eq() { return query; }, is() { return query; }, gt() { return query; }, gte() { return query; }, order() { return query; }, limit() { return query; },
        maybeSingle: async () => table === 'phone_relay_devices'
          ? { data: { id: 'device', enabled, phone: '01099998888', created_at: new Date().toISOString(), expires_at: new Date(Date.now() + 60000).toISOString(), last_seen_at: null }, error: unavailable ? { code: '42P01' } : null }
          : table === 'orders' ? { data: order, error: null } : { data: { id: 'self-test' }, error: null },
        then(resolve, reject) { return Promise.resolve({ data: [], error: null }).then(resolve, reject); },
      };
      return query;
    },
    async rpc(name, args) { calls.push({ name, args }); return { data: result, error: rpcError }; },
  };
  return { client, calls };
}
function fixture() {
  const baseKey = 'a'.repeat(64);
  const order = { payment_method: 'bank_transfer', payment_status: 'pending_transfer', shipping_status: 'preparing',
    shipping_company: null, tracking_number: null, customer_phone: '01012345678', amount_total: 123000, currency: 'KRW',
    bank_name: null, bank_account_number: null, items: [{ id: 'product', quantity: 1 }],
    raw_payload: { notifications: { events: { [baseKey]: { event: 'order_received', createdAt: new Date().toISOString() } } } } };
  return { order, input: { channel: 'customerSms', eventKey: `${baseKey}:customerSms`, to: order.customer_phone,
    subject: '계좌 안내', text: '테스트 메시지', orderId: '123e4567-e89b-42d3-a456-426614174000', event: 'order_received' } };
}

test('limited device credentials are exact 256-bit base64url capabilities in headers only', () => {
  const relay = load();
  const token = crypto.randomBytes(32).toString('base64url');
  assert.equal(relay.readPhoneRelayToken(new Request('https://enicoveck.com/api/phone-relay/claim', { headers: { authorization: `Bearer ${token}` } })), token);
  assert.equal(relay.readPhoneRelayToken(new Request(`https://enicoveck.com/api/phone-relay/claim?token=${token}`)), null);
  assert.equal(relay.readPhoneRelayToken(new Request('https://enicoveck.com/api/phone-relay/claim', { headers: { authorization: 'Bearer owner-jwt' } })), null);
});
test('phone normalization accepts one modern Korean mobile and rejects arbitrary/multiple recipients', () => {
  const relay = load();
  assert.equal(relay.normalizePhoneRelayRecipient('+82 10-1234-5678'), '01012345678');
  for (const value of ['01012345678,01099998888', 'customer01012345678', '0212345678', '0101234567']) assert.equal(relay.normalizePhoneRelayRecipient(value), null);
});
test('only primary owner verified identity receives pairing authority', async () => {
  const relay = load({ env: { NEXT_PUBLIC_SUPABASE_ANON_KEY: 'fixture' }, authClient: { auth: { getUser: async () => ({ data: { user: { id: 'another', verified: true } }, error: null }) } } });
  assert.equal((await relay.authorizePhoneRelayOwner(new Request('https://enicoveck.com/api/admin/phone-relay'))).response.status, 401);
  assert.equal((await relay.authorizePhoneRelayOwner(new Request('https://enicoveck.com/api/admin/phone-relay', { headers: { authorization: 'Bearer auth' } }))).response.status, 403);
});
test('customer enqueue re-reads state, source timestamp and phone then stores exact revision', async () => {
  const relay = load(); const { order, input } = fixture(); const db = clientFixture(order);
  const revision = relay.getPhoneRelayOrderRevision(order);
  const result = await relay.enqueuePhoneRelayMessage(db.client, { ...input, eventRevision: revision });
  assert.equal(result.status, 'queued'); assert.equal(db.calls.length, 1);
  assert.equal(db.calls[0].name, 'phone_relay_enqueue');
  assert.deepEqual(db.calls[0].args.p_revision, JSON.parse(revision));
});
test('admin self-SMS is never queued and unavailable setup is explicit', async () => {
  const relay = load(); const { order, input } = fixture();
  const db = clientFixture(order, { enabled: false });
  assert.equal((await relay.enqueuePhoneRelayMessage(db.client, { ...input, channel: 'adminSms', eventRevision: relay.getPhoneRelayOrderRevision(order) })).status, 'skipped');
  assert.equal((await relay.enqueuePhoneRelayMessage(db.client, { ...input, eventRevision: relay.getPhoneRelayOrderRevision(order) })).status, 'not_configured');
  assert.equal(db.calls.length, 0);
});
test('cancelled, changed number, old event, and snapshot mutations never enqueue stale payment guidance', async () => {
  const relay = load();
  for (const mutate of [o => { o.payment_status = 'cancelled'; }, o => { o.customer_phone = '01022223333'; }, o => { o.amount_total++; }, o => { o.raw_payload.notifications.events['a'.repeat(64)].createdAt = new Date(Date.now() - 31 * 60000).toISOString(); }]) {
    const { order, input } = fixture(); const revision = relay.getPhoneRelayOrderRevision(order); mutate(order); const db = clientFixture(order);
    assert.equal((await relay.enqueuePhoneRelayMessage(db.client, { ...input, eventRevision: revision })).status, 'skipped');
    assert.equal(db.calls.length, 0);
  }
});
test('ambiguous queue mutation is thrown for durable caller unknown status, never sent or fallback', async () => {
  const relay = load(); const { order, input } = fixture(); const db = clientFixture(order, { rpcError: { code: 'network' } });
  await assert.rejects(relay.enqueuePhoneRelayMessage(db.client, { ...input, eventRevision: relay.getPhoneRelayOrderRevision(order) }), /outcome_unknown/);
});
test('claim returns opaque per-job capability while database only receives SHA256 hashes', async () => {
  const relay = load(); const db = clientFixture(null, { result: { authorized: true, job: { id: 'job', to: '01012345678', text: 'fixed', title: 'fixed', kind: 'customer_sms' } } });
  const token = crypto.randomBytes(32).toString('base64url'); const result = await relay.claimPhoneRelayJob(db.client, token);
  assert.equal(result.job.claimToken.length, 43);
  assert.equal(db.calls[0].args.p_device_hash, crypto.createHash('sha256').update(token).digest('hex'));
  assert.equal(db.calls[0].args.p_claim_hash, crypto.createHash('sha256').update(result.job.claimToken).digest('hex'));
  assert.ok(!JSON.stringify(db.calls).includes(token));
});
test('pair returns token once and stores only SHA256 with 90-day expiry', async () => {
  const relay = load(); const db = clientFixture(null, { result: 'device-id' }); const result = await relay.managePhoneRelay(db.client, 'pair');
  assert.equal(result.status, 200); assert.equal(result.body.deviceToken.length, 43);
  assert.equal(db.calls[0].args.p_token_hash, crypto.createHash('sha256').update(result.body.deviceToken).digest('hex'));
  assert.equal(db.calls[0].args.p_phone, '01099998888');
  assert.ok(Date.parse(result.body.expiresAt) > Date.now() + 89 * 86400000);
});
test('self-test only targets configured owner and wakes fixed owner email without token/customer data', async () => {
  const emails = []; const relay = load({ send: async message => { emails.push(message); return { status: 'sent' }; } });
  const db = clientFixture(null); const result = await relay.managePhoneRelay(db.client, 'self_test');
  assert.equal(result.status, 200); assert.equal(db.calls[0].args.p_to, '01099998888');
  assert.equal(db.calls[0].args.p_order_id, null); assert.equal(emails[0].to, 'morba9850@gmail.com');
  assert.ok(emails[0].subject.startsWith('[ENICO PHONE]')); assert.equal(result.body.wakeEmail.status, 'sent');
});
