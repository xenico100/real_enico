/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

class OrderValidationError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

const source = fs.readFileSync(path.resolve('src/lib/orders/checkoutClaims.ts'), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const moduleUnderTest = { exports: {} };
vm.runInThisContext(`(function(require,module,exports){${compiled}\n})`, {
  filename: 'checkoutClaims.ts',
})((name) => {
  if (name === 'server-only') return {};
  if (name === '@/lib/orders/serverOrderValidation') return { OrderValidationError };
  if (name === '@/lib/storefront/productAvailability') {
    return { extractPersistentProductIds: (items) => items.map((item) => item.id).filter((id) => id !== 'test-product') };
  }
  throw new Error(`Unexpected import: ${name}`);
}, moduleUnderTest, moduleUnderTest.exports);

const { claimCheckoutProducts, releaseCheckoutProducts } = moduleUnderTest.exports;

test('provider claim is made before capture with the provider-attempt marker', async () => {
  const calls = [];
  const client = { rpc: async (name, params) => { calls.push({ name, params }); return { data: true, error: null }; } };
  await claimCheckoutProducts(client, [{ id: 'product-1' }], 'paypal', 'ORDER-123');
  assert.deepEqual(calls, [{
    name: 'claim_checkout_products',
    params: {
      p_order_code: 'ORDER-123', p_payment_method: 'paypal',
      p_product_ids: ['product-1'], p_hold_seconds: 86400,
    },
  }]);
});

test('claim conflict returns 409 and DB failure fails closed', async () => {
  const items = [{ id: 'product-1' }];
  await assert.rejects(
    () => claimCheckoutProducts({ rpc: async () => ({ data: null, error: { code: 'P0001', message: 'claimed' } }) }, items, 'nicepay', 'ORDER-123', 1800),
    { status: 409 },
  );
  await assert.rejects(
    () => claimCheckoutProducts({ rpc: async () => ({ data: null, error: { code: 'PGRST202', message: 'missing function' } }) }, items, 'paypal', 'ORDER-123'),
    { status: 503 },
  );
});

test('only the matching order/method is released; test-only product needs no claim', async () => {
  const calls = [];
  const client = { rpc: async (name, params) => { calls.push({ name, params }); return { data: 1, error: null }; } };
  await claimCheckoutProducts(client, [{ id: 'test-product' }], 'nicepay', 'ORDER-123');
  assert.equal(calls.length, 0);
  await releaseCheckoutProducts(client, 'nicepay', 'ORDER-123');
  assert.deepEqual(calls[0], {
    name: 'release_checkout_products',
    params: { p_order_code: 'ORDER-123', p_payment_method: 'nicepay' },
  });
});
