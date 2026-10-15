/* eslint-disable @typescript-eslint/no-require-imports */
const { createHash } = require('node:crypto');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const nicepayModule = import('../src/lib/orders/nicepay.ts');
const nicepayBodyModule = import('../src/lib/orders/nicepayReturnBody.ts');

function loadTypeScript(file, mocks = {}) {
  const absolute = path.resolve(file);
  const compiled = ts.transpileModule(fs.readFileSync(absolute, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const compiledModule = { exports: {} };
  vm.runInThisContext(`(function(require,module,exports){${compiled}\n})`, { filename: absolute })((name) => {
    if (Object.hasOwn(mocks, name)) return mocks[name];
    if (name === 'server-only') return {};
    if (name === 'node:crypto') return require('node:crypto');
    throw new Error(`Unexpected import in NICE regression test: ${name}`);
  }, compiledModule, compiledModule.exports);
  return compiledModule.exports;
}

function sha256(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

test('NICE signed checkout preserves the immutable member ID and rejects a tampered owner', async () => {
  const { signNicepayPendingOrder, verifyNicepayPendingOrder } = await nicepayModule;
  const token = signNicepayPendingOrder({
    orderId: 'NICE-ORDER', transactionId: 'ORDER-123', channel: 'member',
    customerUserId: '22222222-2222-4222-8222-222222222222', guestPasswordHash: null,
    customer: { name: 'Buyer', email: 'buyer@example.com', phone: '01012345678', country: '대한민국', address: 'Seoul' },
    pricing: { subtotal: 1000, shipping: 0, tax: 0, total: 1000, currency: 'KRW' },
    items: [], nicepay: { amount: 1000, goodsName: 'Fixture', returnUrl: 'https://example.test/return' },
  }, 'test-secret');
  assert.equal(verifyNicepayPendingOrder(token, 'test-secret').customerUserId, '22222222-2222-4222-8222-222222222222');
  const [encoded, signature] = token.split('.');
  const changed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
  changed.customerUserId = '33333333-3333-4333-8333-333333333333';
  const tampered = `${Buffer.from(JSON.stringify(changed)).toString('base64url')}.${signature}`;
  assert.equal(verifyNicepayPendingOrder(tampered, 'test-secret'), null);
});

test('NICE authentication callback requires the exact provider signature', async () => {
  const { verifyNicepayReturnSignature } = await nicepayModule;
  const secret = 'test-secret';
  const params = {
    authToken: 'AUTH123',
    clientId: 'S012345',
    amount: '1000',
    signature: sha256(`AUTH123S0123451000${secret}`),
  };

  assert.equal(verifyNicepayReturnSignature(params, secret), true);
  assert.equal(verifyNicepayReturnSignature({ ...params, amount: '1001' }, secret), false);
  assert.equal(verifyNicepayReturnSignature({ ...params, signature: 'a'.repeat(64) }, secret), false);
  assert.equal(verifyNicepayReturnSignature({ ...params, signature: 'abc' }, secret), false);
  assert.equal(verifyNicepayReturnSignature(params, 'wrong-secret'), false);
});

test('NICE approval response requires tid, amount and ediDate signature', async () => {
  const { verifyNicepayApprovalSignature } = await nicepayModule;
  const secret = 'test-secret';
  const approval = {
    tid: 'NICETID123',
    amount: 1000,
    ediDate: '2026-10-06T13:45:00+09:00',
    signature: sha256(`NICETID12310002026-10-06T13:45:00+09:00${secret}`),
  };

  assert.equal(verifyNicepayApprovalSignature(approval, secret), true);
  assert.equal(verifyNicepayApprovalSignature({ ...approval, tid: 'OTHER' }, secret), false);
  assert.equal(verifyNicepayApprovalSignature({ ...approval, amount: 2000 }, secret), false);
  assert.equal(verifyNicepayApprovalSignature({ ...approval, ediDate: '' }, secret), false);
  assert.equal(verifyNicepayApprovalSignature({ ...approval, signature: 'f'.repeat(64) }, secret), false);
});

test('NICE goodsName stays within the provider 40-byte limit for Korean names', async () => {
  const { buildNicepayGoodsName } = await nicepayModule;
  const first = { name: '가나다라마바사아자차카타파하가나다라마바사아자차카타파하' };
  const single = buildNicepayGoodsName([first]);
  const multiple = buildNicepayGoodsName([first, { name: '두 번째 상품' }]);

  assert.ok(single.length > 0);
  assert.ok(Buffer.byteLength(single, 'utf8') <= 40);
  assert.ok(Buffer.byteLength(multiple, 'utf8') <= 40);
  assert.match(multiple, / 외 1건$/);
});

test('NICE callback body is limited by both Content-Length and actual stream bytes', async () => {
  const { readNicepayReturnBody, NICEPAY_RETURN_BODY_MAX_BYTES } = await nicepayBodyModule;
  const url = 'https://example.test/api/orders/nicepay/return';
  const valid = new Request(url, { method: 'POST', body: 'authResultCode=0000' });
  assert.equal(
    new TextDecoder().decode(await readNicepayReturnBody(valid)),
    'authResultCode=0000',
  );

  const declaredOversized = new Request(url, {
    method: 'POST',
    headers: { 'content-length': String(NICEPAY_RETURN_BODY_MAX_BYTES + 1) },
    body: 'x',
  });
  await assert.rejects(readNicepayReturnBody(declaredOversized), /본문 크기/);

  const streamedOversized = new Request(url, {
    method: 'POST',
    headers: { 'content-length': '1' },
    body: new Uint8Array(NICEPAY_RETURN_BODY_MAX_BYTES + 1),
  });
  await assert.rejects(readNicepayReturnBody(streamedOversized), /본문이 너무 큽니다/);
});

test('verified NICE cancellation merges concurrent notification metadata without cancelling twice', async (t) => {
  for (const alwaysConflict of [false, true]) {
    await t.test(alwaysConflict ? 'bounded local conflict stays unconfirmed' : 'local CAS retry preserves new metadata', async () => {
      const secret = 'fixture-secret';
      const ownerId = '22222222-2222-4222-8222-222222222222';
      const original = {
        id: 'order-123', order_code: 'ORDER-123', payment_method: 'nicepay', payment_status: 'paid',
        shipping_status: 'preparing', amount_total: 1000, items: [],
        raw_payload: { customerUserId: ownerId, nicepay: { tid: 'NICE-TID', orderId: 'NICE-ORDER' } },
      };
      let saved = structuredClone(original);
      let localAttempts = 0;
      let providerCalls = 0;
      let notificationCalls = 0;
      const db = {
        from(table) {
          assert.equal(table, 'orders');
          const filters = [];
          let updateData = null;
          const query = {
            select: () => query,
            eq: (field, value) => { filters.push([field, value]); return query; },
            is: (field, value) => { filters.push([field, value]); return query; },
            update: (value) => { updateData = value; return query; },
            maybeSingle: async () => {
              if (!updateData) return { data: structuredClone(saved), error: null };
              if (updateData.payment_status === 'cancelled') {
                localAttempts += 1;
                assert.ok(filters.some(([field]) => field === 'raw_payload'));
                if (alwaysConflict || localAttempts === 1) {
                  saved.raw_payload.notifications = { ...saved.raw_payload.notifications, concurrentAttempt: localAttempts };
                  return { data: null, error: null };
                }
              }
              const matches = filters.every(([field, value]) => field === 'raw_payload'
                ? JSON.stringify(saved.raw_payload) === value : saved[field] === value);
              if (!matches) return { data: null, error: null };
              saved = { ...saved, ...updateData };
              return { data: structuredClone(saved), error: null };
            },
          };
          return query;
        },
      };
      const { cancelNicepayOrder } = loadTypeScript('src/lib/orders/nicepayCancel.ts', {
        'next/cache': { revalidateTag() {} },
        '@/lib/orders/nicepay': await nicepayModule,
        '@/lib/orders/rawPayload': loadTypeScript('src/lib/orders/rawPayload.ts'),
        '@/lib/orders/checkoutClaims': { releaseCheckoutProducts: async () => {} },
        '@/lib/orders/notifications': { dispatchOrderNotifications: async (_client, id, event) => {
          assert.equal(id, original.id);
          assert.equal(event, 'cancelled');
          assert.equal(saved.payment_status, 'cancelled');
          notificationCalls += 1;
        } },
        '@/lib/storefront/productAvailability': { extractPersistentProductIds: () => [] },
        '@/lib/storefront/productAvailabilityDb': {
          fetchProductAvailabilitySnapshot: async () => { throw new Error('Unexpected inventory request'); },
          restoreProductsAvailability: async () => { throw new Error('Unexpected inventory request'); },
        },
      });
      const originalFetch = global.fetch;
      const originalClientKey = process.env.NICEPAY_CLIENT_KEY;
      const originalSecret = process.env.NICEPAY_SECRET_KEY;
      process.env.NICEPAY_CLIENT_KEY = 'S-FIXTURE';
      process.env.NICEPAY_SECRET_KEY = secret;
      global.fetch = async (url) => {
        assert.equal(url, 'https://sandbox-api.nicepay.co.kr/v1/payments/NICE-TID/cancel');
        providerCalls += 1;
        saved.raw_payload.notifications = { duringProviderCall: 'sent' };
        const ediDate = '2026-10-15T11:00:00+09:00';
        return Response.json({ resultCode: '0000', tid: 'NICE-TID', status: 'cancelled',
          amount: 1000, balanceAmt: 0, cancelAmt: 1000, ediDate,
          signature: sha256(`NICE-TID1000${ediDate}${secret}`) });
      };
      try {
        const run = () => cancelNicepayOrder({ serviceClient: db, order: original, actor: 'member', reason: 'member_cancel', selectQuery: '*' });
        if (alwaysConflict) {
          await assert.rejects(run(), /취소 결과를 확인해야/);
          assert.equal(saved.payment_status, 'cancel_processing');
          assert.equal(localAttempts, 4);
          assert.equal(notificationCalls, 0);
        } else {
          const result = await run();
          assert.equal(result.payment_status, 'cancelled');
          assert.equal(saved.raw_payload.customerUserId, ownerId);
          assert.equal(saved.raw_payload.notifications.duringProviderCall, 'sent');
          assert.equal(saved.raw_payload.notifications.concurrentAttempt, 1);
          assert.equal(saved.raw_payload.nicepay.cancels.length, 1);
          assert.equal(localAttempts, 2);
          assert.equal(notificationCalls, 1);
        }
        assert.equal(providerCalls, 1);
      } finally {
        global.fetch = originalFetch;
        if (originalClientKey === undefined) delete process.env.NICEPAY_CLIENT_KEY;
        else process.env.NICEPAY_CLIENT_KEY = originalClientKey;
        if (originalSecret === undefined) delete process.env.NICEPAY_SECRET_KEY;
        else process.env.NICEPAY_SECRET_KEY = originalSecret;
      }
    });
  }
});
