/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { fileURLToPath, pathToFileURL } = require('node:url');
const { registerHooks, stripTypeScriptTypes } = require('node:module');

// Exercise the real catalog, schema fallback and HTTP route. Stub only external services.
const fixture = { rows: {}, responses: {}, queries: [], clients: [], cachedCalls: 0 };
fixture.client = {
  from(table) {
    const call = { table, filters: [], fields: '' };
    fixture.queries.push(call);
    const query = {
      select(fields) { call.fields = fields; return query; },
      eq(key, value) { call.filters.push([key, value]); return query; },
      or(value) { call.filters.push(['or', value]); return query; },
      order() { return query; },
      async returns() { return fixture.responses[table]?.shift() || { data: fixture.rows[table] || [], error: null }; },
    };
    return query;
  },
};
globalThis.__storefrontCatalogTest = fixture;
const stubs = {
  'server-only': 'export {};',
  '@supabase/supabase-js': 'export function createClient(url, key, options) { globalThis.__storefrontCatalogTest.clients.push(options); return globalThis.__storefrontCatalogTest.client; }',
  'next/cache': 'export const unstable_cache = (fn) => (...args) => { globalThis.__storefrontCatalogTest.cachedCalls++; return fn(...args); };',
};
const sourceRoot = pathToFileURL(`${path.resolve('src')}${path.sep}`).href;
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (Object.hasOwn(stubs, specifier)) return { url: `catalog-test:${specifier}`, shortCircuit: true };
    if (specifier.startsWith('@/')) return { url: pathToFileURL(path.resolve('src', `${specifier.slice(2)}.ts`)).href, shortCircuit: true };
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.startsWith('catalog-test:')) return { format: 'module', source: stubs[url.slice('catalog-test:'.length)], shortCircuit: true };
    if (url.startsWith(sourceRoot) && url.endsWith('.ts')) return {
      format: 'module', source: stripTypeScriptTypes(fs.readFileSync(fileURLToPath(url), 'utf8'), { mode: 'strip' }), shortCircuit: true,
    };
    return nextLoad(url, context);
  },
});
const envKeys = ['SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'NEXT_PUBLIC_SUPABASE_ANON_KEY'];
const savedEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
function reset() {
  process.env.SUPABASE_URL = 'https://gkfupegrduencknzpzok.supabase.co';
  process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.SUPABASE_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-only';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-only';
  fixture.rows = {}; fixture.responses = {}; fixture.queries = []; fixture.clients = []; fixture.cachedCalls = 0;
}
reset();
const { buildPublicStorefrontCatalog } = require(path.resolve('src/lib/storefront/publicCatalog.ts'));
const { buildProductCatalog, NICEPAY_TEST_PRODUCT_ID } = require(path.resolve('src/lib/storefront/productCatalog.ts'));
const route = require(path.resolve('src/app/api/storefront/catalog/route.ts'));
const FLOWER = '7cd29c56-20a4-4677-813e-adbf1043b256';
const product = (id, extra = {}) => ({ id, title: `Garment ${id}`, price: 28000, is_published: true,
  description: 'Public garment description', images: ['https://images.example.com/garment.jpg'], ...extra });
const collection = (id, extra = {}) => ({ id, title: 'Collection', season: '2026', description: '', full_description: '',
  release_date: '', items: 1, image: 'https://images.example.com/look.jpg', images: [], is_published: true, ...extra });
test.beforeEach(reset);
test.after(() => {
  hooks.deregister(); delete globalThis.__storefrontCatalogTest;
  for (const key of envKeys) if (savedEnv[key] === undefined) delete process.env[key]; else process.env[key] = savedEnv[key];
});

test('published sold-out garments retain their original positive price and remain visible', () => {
  const rows = [product('available'), product('raw-sold', { raw: { stock: 0 } }),
    product('kitty', { title: 'Check Kitty' }), product('gaori', { title: 'Where GA-O-RI' }),
    product(FLOWER, { title: 'Re: flower of evil jacket', is_published: false, price: 220000 })];
  const { products } = buildPublicStorefrontCatalog(rows, []);
  assert.equal(products.length, 5);
  for (const id of ['raw-sold', 'kitty', 'gaori', FLOWER]) {
    const result = products.find((item) => item.id === id);
    assert.equal(result.isSoldOut, true);
    assert.equal(result.price, id === FLOWER ? 220000 : 28000);
  }
  assert.equal(products.find((item) => item.id === 'available').isSoldOut, false);
  assert.equal(buildProductCatalog(rows).find((item) => item.id === 'kitty').price, 28000);
});

test('explicit current stock overrides historical title flags, while sold-out flags win conflicts', () => {
  const { products } = buildPublicStorefrontCatalog([
    product('restocked', { title: 'Check Kitty', raw: { stock: 1, sold_out: false } }),
    product('sold', { title: 'Where GA-O-RI', raw: { stock: 1, sold_out: true } }),
  ], []);
  assert.equal(products.find((item) => item.id === 'restocked').isSoldOut, false);
  assert.equal(products.find((item) => item.id === 'sold').isSoldOut, true);
});

test('drafts, arbitrary archived rows, tests and zero or invalid prices never become public', () => {
  const rows = [product('allowed'), product('draft', { is_published: false }),
    product('archived', { is_published: false, raw: { sold_out: true } }),
    product('unknown', { is_published: null }), product('missing', { is_published: undefined }),
    product(NICEPAY_TEST_PRODUCT_ID), product('test-title', { title: 'Payment TEST product' }),
    product('nice', { title: 'NICE Payments 1000Won Test' }), product('korean-test', { title: '테스트 상품' }),
    product('zero', { price: 0, raw: { stock: 0 } }), product('negative', { price: -1 }),
    product('invalid', { price: 'invalid' }), product('fraction', { price: 1.1 })];
  assert.deepEqual(buildPublicStorefrontCatalog(rows, []).products.map((item) => item.id), ['allowed']);
});

test('raw provenance and internal free-form text are not public catalog descriptions', () => {
  const { products } = buildPublicStorefrontCatalog([product('safe', { raw: {
    stock: 1, sold_out_order_code: 'PRIVATE_ORDER_TOKEN', soldOutPaymentMethod: 'PRIVATE_METHOD_TOKEN',
    description: 'PRIVATE_DESCRIPTION_TOKEN', summary: 'PRIVATE_SUMMARY_TOKEN', specs: 'PRIVATE_SPEC_TOKEN',
    modelUrl: 'https://models.example.com/garment.glb',
  } })], []);
  const serialized = JSON.stringify(products);
  assert.doesNotMatch(serialized, /PRIVATE_/);
  assert.match(products[0].description, /Public garment description/);
  assert.equal(products[0].modelUrl, 'https://models.example.com/garment.glb');
  assert.equal(Object.hasOwn(products[0], 'raw'), false);
});

test('unsafe media URLs and unpublished/test collections are excluded', () => {
  const { products, collections } = buildPublicStorefrontCatalog([product('safe', {
    images: ['javascript:alert(1)', 'https://user:pass@example.com/a.jpg', '/safe.jpg', 'https://images.example.com/photo.jpg'],
    specs: 'https://user:pass@example.com/detail.jpg',
  })], [collection('visible'), collection('draft', { is_published: false }), collection('test', { title: '3D TEST' })]);
  assert.deepEqual(products[0].images, ['/safe.jpg', 'https://images.example.com/photo.jpg']);
  assert.equal(products[0].detailImageUrl, undefined);
  assert.deepEqual(collections.map((item) => item.id), ['visible']);
});

test('HTTP catalog bypasses the five-minute cache and restricts queries to publication plus the one sentinel', async () => {
  fixture.rows = { products: [product('visible')], collections: [collection('visible')] };
  const response = await route.GET();
  assert.equal(response.status, 200);
  assert.match(response.headers.get('cache-control'), /no-store/);
  assert.equal(route.dynamic, 'force-dynamic'); assert.equal(route.revalidate, 0); assert.equal(route.fetchCache, 'force-no-store');
  const body = await response.json();
  assert.equal(body.products.length, 1); assert.equal(body.collections.length, 1);
  assert.equal(fixture.cachedCalls, 0);
  assert.deepEqual(fixture.queries.find((query) => query.table === 'products').filters,
    [['or', `is_published.eq.true,and(is_published.eq.false,id.in.(${FLOWER}))`]]);
  assert.deepEqual(fixture.queries.find((query) => query.table === 'collections').filters, [['is_published', true]]);
  assert.equal(fixture.clients.every((client) => typeof client.global.fetch === 'function'), true);
});

test('missing raw column keeps publication filtering and title-based sold-out state', async () => {
  fixture.responses.products = [{ data: null, error: { message: 'column products.raw does not exist' } }];
  fixture.rows.products = [product('kitty', { title: 'Check Kitty' })];
  const response = await route.GET();
  assert.equal(response.status, 200);
  const { products } = await response.json();
  assert.equal(products[0].isSoldOut, true); assert.equal(products[0].price, 28000);
  assert.equal(fixture.queries.filter((query) => query.table === 'products').length, 2);
  assert.equal(fixture.queries.filter((query) => query.table === 'products').every((query) => query.filters.length === 1), true);
});

test('valid empty catalog stays empty, while product or collection failures return 503', async () => {
  let response = await route.GET();
  assert.equal(response.status, 200);
  let body = await response.json(); assert.deepEqual(body.products, []); assert.deepEqual(body.collections, []);
  for (const table of ['products', 'collections']) {
    fixture.responses[table] = [{ data: null, error: { message: 'connection unavailable' } }];
    response = await route.GET();
    assert.equal(response.status, 503); assert.match(response.headers.get('cache-control'), /no-store/);
    body = await response.json(); assert.equal(body.error, 'STOREFRONT_UNAVAILABLE'); assert.equal(body.products, undefined);
  }
});

test('missing publication column, unavailable credentials and wrong project fail closed', async () => {
  fixture.responses.products = [{ data: null, error: { message: 'column products.is_published does not exist' } }];
  assert.equal((await route.GET()).status, 503);
  delete process.env.SUPABASE_SERVICE_ROLE_KEY; delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  assert.equal((await route.GET()).status, 503);
  reset(); process.env.SUPABASE_URL = 'https://unexpected-project.supabase.co';
  assert.equal((await route.GET()).status, 503);
});

test('fresh upstream fetches enforce no-store and an abort signal', async () => {
  await route.GET();
  const savedFetch = globalThis.fetch;
  let captured;
  globalThis.fetch = async (_input, init) => { captured = init; return new Response('{}'); };
  try { await fixture.clients[0].global.fetch('https://example.com', { cache: 'force-cache' }); }
  finally { globalThis.fetch = savedFetch; }
  assert.equal(captured.cache, 'no-store');
  assert.ok(captured.signal instanceof AbortSignal);
});
