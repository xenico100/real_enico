/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const file = path.resolve('src/lib/storefront/productAvailabilityDb.ts');
const compiled = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const moduleUnderTest = { exports: {} };
vm.runInThisContext(`(function(require,module,exports){${compiled}\n})`, { filename: file })(
  (name) => {
    if (name === '@/lib/storefront/productAvailability') {
      return {
        buildAvailableRaw: () => ({ sold_out: false }),
        buildSoldOutRaw: () => ({ sold_out: true }),
        isProductMarkedSoldOut: (raw) => raw?.sold_out === true,
        isProductMarkedAvailable: () => false,
        isProductTitleMarkedSoldOut: () => false,
      };
    }
    throw new Error(`Unexpected import: ${name}`);
  },
  moduleUnderTest,
  moduleUnderTest.exports,
);

const { restoreProductsAvailability } = moduleUnderTest.exports;
const options = { hasRawColumn: true, orderCode: 'ORDER-123', paymentMethod: 'nicepay' };

test('cancellation never republishes a product without order provenance', async () => {
  const client = { from: () => { throw new Error('No product write allowed'); } };
  await assert.rejects(
    restoreProductsAvailability(client, [{ id: 'product-1', is_published: false }], { ...options, hasRawColumn: false }),
    /판매 주문 이력/,
  );
  await assert.rejects(
    restoreProductsAvailability(client, [{ id: 'product-1', raw: { sold_out: true, sold_out_order_code: 'OTHER', sold_out_payment_method: 'nicepay' } }], options),
    /일치하지 않아/,
  );
});

test('restock uses an atomic filter for the exact paid order', async () => {
  const filters = [];
  const query = {
    eq(key, value) { filters.push([key, value]); return query; },
    select: async () => ({ data: [{ id: 'product-1' }], error: null }),
  };
  const client = { from(table) { assert.equal(table, 'products'); return { update: () => query }; } };
  await restoreProductsAvailability(client, [{ id: 'product-1', raw: {
    sold_out: true,
    sold_out_order_code: 'ORDER-123',
    sold_out_payment_method: 'nicepay',
  } }], options);
  assert.deepEqual(filters, [
    ['id', 'product-1'],
    ['raw->>sold_out_order_code', 'ORDER-123'],
    ['raw->>sold_out_payment_method', 'nicepay'],
  ]);
});
