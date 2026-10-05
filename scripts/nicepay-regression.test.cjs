/* eslint-disable @typescript-eslint/no-require-imports */
const { createHash } = require('node:crypto');
const assert = require('node:assert/strict');
const { test } = require('node:test');

const nicepayModule = import('../src/lib/orders/nicepay.ts');
const nicepayBodyModule = import('../src/lib/orders/nicepayReturnBody.ts');

function sha256(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

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
