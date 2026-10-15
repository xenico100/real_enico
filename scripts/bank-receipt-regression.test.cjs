/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

const compiled = ts.transpileModule(fs.readFileSync('src/lib/orders/bankReceipt.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const subject = { exports: {} };
vm.runInThisContext(`(function(module,exports){${compiled}\n})`)(subject, subject.exports);
const { readBankOrderReceipt } = subject.exports;

const now = Date.now();
const receipt = {
  orderCode: 'ORDER-123', guestOrderNumber: 'GUEST-123', channel: 'guest', total: 123000,
  bankAccount: { bankName: '은행', accountNumber: '123-456', accountHolder: '에니코' },
  items: [{ id: 'pants-1', name: 'Gantz pants', selectedSize: 'M', quantity: 1, lineTotal: 120000 }],
  notifications: { customerSms: { status: 'not_configured' } }, savedAt: now,
};

test('receipt restores the submitted amount and public instructions without retaining contact details or credentials', () => {
  const saved = readBankOrderReceipt(JSON.stringify({
    ...receipt,
    customer: { name: 'Private name', phone: '01012345678', address: 'Private address' },
    guestLookupPassword: 'private-password', accessToken: 'private-token',
    items: [{ ...receipt.items[0], customerPhone: '01012345678' }],
    notifications: { customerSms: { status: 'failed', to: '01012345678', providerResponse: 'private data' } },
  }), now);
  assert.equal(saved.total, 123000);
  assert.equal(saved.items[0].name, 'Gantz pants');
  assert.deepEqual(saved.notifications, { customerSms: { status: 'failed' } });
  const serialized = JSON.stringify(saved);
  for (const privateValue of ['Private name', '01012345678', 'Private address', 'private-password', 'private-token', 'private data']) {
    assert.ok(!serialized.includes(privateValue));
  }
});

test('expired, future, incomplete, and malformed receipts cannot be restored as valid confirmations', () => {
  assert.equal(readBankOrderReceipt('{bad', now), null);
  assert.equal(readBankOrderReceipt(null, now), null);
  for (const changes of [
    { savedAt: now - 24 * 60 * 60 * 1000 - 1 }, { savedAt: now + 1 },
    { total: -1 }, { orderCode: '' }, { bankAccount: null }, { items: null },
    { items: [{ name: 'pants', quantity: 1 }] },
  ]) {
    assert.equal(readBankOrderReceipt(JSON.stringify({ ...receipt, ...changes }), now), null);
  }
  assert.deepEqual(readBankOrderReceipt(JSON.stringify(receipt), now), receipt);
});
