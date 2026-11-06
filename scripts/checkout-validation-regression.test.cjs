/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function load(file) {
  const loaded = { exports: {} };
  const output = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  vm.runInThisContext(`(function(module,exports){${output}\n})`)(loaded, loaded.exports);
  return loaded.exports;
}
const validation = load('src/lib/orders/checkoutValidation.ts');
test('checkout phone rejects letters, empty, short, and malformed country numbers', () => {
  for (const value of ['abc', '', '123', '010-abc-1234', '++821012345678', '+0012345678', '0101234567890123456']) {
    assert.equal(validation.isValidCheckoutPhone(value, '대한민국'), false, value);
  }
});
test('checkout phone accepts national and international customer formats', () => {
  for (const [value, country] of [['010-1234-5678', '대한민국'], ['02-123-4567', '대한민국'], ['+82 10 1234 5678', '대한민국'], ['(212) 555-0123', '미국'], ['1-416-555-0123', '캐나다'], ['090-1234-5678', '일본'], ['0412 345 678', '호주'], ['+44 20 7946 0958', '그 외']]) {
    assert.equal(validation.isValidCheckoutPhone(value, country), true, value);
  }
});
test('email and address limits are shared by every checkout entry point', () => {
  assert.equal(validation.CHECKOUT_ADDRESS_MAX_LENGTH, 500);
  assert.equal(validation.isValidCheckoutEmail('qa@example.invalid'), true);
  for (const email of ['abc', 'a@b', 'a b@example.com', '@example.com', `${'x'.repeat(321)}@example.com`]) assert.equal(validation.isValidCheckoutEmail(email), false);
  for (const file of ['src/app/components/subculture/CartOverlay.tsx', 'src/app/api/orders/bank-transfer/route.ts', 'src/app/api/orders/paypal/route.ts', 'src/app/api/orders/nicepay/prepare/route.ts']) {
    const source = fs.readFileSync(file, 'utf8');
    assert.match(source, /isValidCheckoutPhone\(/, file);
    assert.match(source, /CHECKOUT_ADDRESS_MAX_LENGTH/, file);
    assert.match(source, /isValidCheckoutEmail\(/, file);
  }
});
test('bank retry storage persists only attempt identity and pending state', () => {
  const attempts = load('src/lib/orders/bankCheckoutAttempt.ts');
  const values = new Map();
  const storage = { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  const attempt = { transactionId: 'bank_01234567-0123-0123-0123-012345678901', pending: true, channel: 'guest', guestLookupPassword: 'never-save', customer: { email: 'never-save' } };
  attempts.saveBankCheckoutAttempt(attempt, storage);
  assert.deepEqual(JSON.parse(values.get(attempts.BANK_ATTEMPT_STORAGE_KEY)), { transactionId: attempt.transactionId, pending: true, channel: 'guest' });
  assert.deepEqual(attempts.readBankCheckoutAttempt(storage), { transactionId: attempt.transactionId, pending: true, channel: 'guest' });
  attempts.clearBankCheckoutAttempt(storage);
  assert.equal(attempts.readBankCheckoutAttempt(storage), null);
});
test('bank retry survives blocked browser storage in tab memory', () => {
  const attempts = load('src/lib/orders/bankCheckoutAttempt.ts');
  const storage = { getItem() { throw Error('blocked'); }, setItem() { throw Error('blocked'); }, removeItem() { throw Error('blocked'); } };
  const attempt = { transactionId: 'bank_01234567-0123-0123-0123-012345678901', pending: true, channel: 'guest' };
  assert.doesNotThrow(() => attempts.saveBankCheckoutAttempt(attempt, storage));
  assert.deepEqual(attempts.readBankCheckoutAttempt(storage), attempt);
  assert.doesNotThrow(() => attempts.clearBankCheckoutAttempt(storage));
  assert.equal(attempts.readBankCheckoutAttempt(storage), null);
});
