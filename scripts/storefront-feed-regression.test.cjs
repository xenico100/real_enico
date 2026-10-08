/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { fileURLToPath, pathToFileURL } = require('node:url');
const { registerHooks, stripTypeScriptTypes } = require('node:module');

// Node 24 runs the real server/catalog/route sources without installing packages.
// Supabase and Next's cache are the only service stubs; no network or writes occur.
const fixture = {
  result: { data: [], error: null },
  responses: [],
  queries: [],
  caches: [],
  client: {
    from(table) {
      assert.equal(table, 'products');
      const call = { select: null, filters: [] };
      fixture.queries.push(call);
      const query = {
        select(fields) { call.select = fields; return query; },
        eq(key, value) { call.filters.push([key, value]); return query; },
        order() { return query; },
        async returns() { return fixture.responses.shift() || fixture.result; },
      };
      return query;
    },
  },
};
globalThis.__storefrontFeedTest = fixture;

const stubs = {
  'server-only': 'export {};',
  '@supabase/supabase-js': 'export const createClient = () => globalThis.__storefrontFeedTest.client;',
  'next/cache': `export function unstable_cache(fn, keys, options) {
    globalThis.__storefrontFeedTest.caches.push({ keys, options });
    return fn;
  }`,
};
const sourceRoot = pathToFileURL(`${path.resolve('src')}${path.sep}`).href;
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (Object.hasOwn(stubs, specifier)) {
      return { url: `storefront-test:${specifier}`, shortCircuit: true };
    }
    if (specifier.startsWith('@/')) {
      return {
        url: pathToFileURL(path.resolve('src', `${specifier.slice(2)}.ts`)).href,
        shortCircuit: true,
      };
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.startsWith('storefront-test:')) {
      return { format: 'module', source: stubs[url.slice('storefront-test:'.length)], shortCircuit: true };
    }
    if (url.startsWith(sourceRoot) && url.endsWith('.ts')) {
      return {
        format: 'module',
        source: stripTypeScriptTypes(fs.readFileSync(fileURLToPath(url), 'utf8')),
        shortCircuit: true,
      };
    }
    return nextLoad(url, context);
  },
});

const envKeys = ['SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'NEXT_PUBLIC_SUPABASE_ANON_KEY'];
const savedEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
const canonicalUrl = 'https://gkfupegrduencknzpzok.supabase.co';
function reset() {
  process.env.SUPABASE_URL = canonicalUrl;
  process.env.NEXT_PUBLIC_SUPABASE_URL = canonicalUrl;
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-only';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-only';
  fixture.result = { data: [], error: null };
  fixture.responses = [];
  fixture.queries = [];
}
reset();
const server = require(path.resolve('src/lib/storefront/server.ts'));
const route = require(path.resolve('src/app/api/storefront/products/route.ts'));
const { NICEPAY_TEST_PRODUCT_ID } = require(path.resolve('src/lib/storefront/productCatalog.ts'));
test.beforeEach(reset);
test.after(() => {
  hooks.deregister();
  delete globalThis.__storefrontFeedTest;
  for (const key of envKeys) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
});

function product(overrides = {}) {
  return {
    id: '35aa5b16-9a31-4c16-8a97-aa0840a71df3',
    title: 'BLUEPRINT DENIM JACKET',
    price: 179000,
    category: '아우터',
    description: 'PUBLIC_DESCRIPTION',
    images: ['https://images.example.com/jacket.jpg'],
    is_published: true,
    raw: { stock: 1 },
    ...overrides,
  };
}

test('feed only returns published, available real products with an exact public field allowlist', async () => {
  fixture.result.data = [
    product({
      specs: 'PRIVATE_SPECS',
      raw: { stock: 1, description: 'PRIVATE_RAW_DESCRIPTION', specs: 'PRIVATE_RAW_SPECS', orderCode: 'PRIVATE_ORDER' },
      images: ['https://images.example.com/jacket.jpg', 'javascript:alert(1)', 'https://secret:password@images.example.com/private.jpg'],
    }),
    product({ id: 'private', title: 'PRIVATE_TITLE', is_published: false }),
    product({ id: 'unknown', title: 'UNKNOWN_PUBLICATION', is_published: null }),
    product({ id: 'sold', title: 'SOLD_OUT', raw: { stock: 0 } }),
    product({ id: NICEPAY_TEST_PRODUCT_ID, title: 'NICE Payments 1000Won Test', price: 1000 }),
    product({ id: 'db-test', title: 'NICE Payments 1000Won Test', price: 1000 }),
    product({ id: 'zero', title: 'ZERO_PRICE', price: 0 }),
    product({ id: 'decimal', title: 'INVALID_PRICE', price: 100.5 }),
    product({ id: 'missing-title', title: null }),
  ];
  const response = await route.GET();
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.products.length, 1);
  const item = body.products[0];
  assert.deepEqual(Object.keys(item).sort(), ['id', 'title', 'price', 'currency', 'images', 'description', 'category', 'purchaseUrl'].sort());
  assert.equal(item.description, 'PUBLIC_DESCRIPTION');
  assert.equal(item.currency, 'KRW');
  assert.deepEqual(item.images, ['https://images.example.com/jacket.jpg']);
  assert.equal(item.purchaseUrl, `https://enicoveck.com/?product=${item.id}`);
  assert.equal(body.sourceUrl, 'https://enicoveck.com');
  assert.equal(new Date(body.updatedAt).toISOString(), body.updatedAt);
  assert.ok(!JSON.stringify(body).includes('PRIVATE_'));
  assert.match(response.headers.get('cache-control'), /s-maxage=300/);
  assert.deepEqual(fixture.queries[0].filters, [['is_published', true]]);
});

test('a valid empty upstream stays HTTP 200 without injected test or fallback products', async () => {
  const response = await route.GET();
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).products, []);
});

test('upstream errors are HTTP 503 without details, while the original home reader still falls back', async () => {
  fixture.result = { data: null, error: { message: 'PRIVATE_DATABASE_CREDENTIALS' } };
  const response = await route.GET();
  assert.equal(response.status, 503);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const body = await response.json();
  assert.equal(body.error, 'STOREFRONT_UNAVAILABLE');
  assert.ok(!JSON.stringify(body).includes('PRIVATE_DATABASE_CREDENTIALS'));
  assert.deepEqual(await server.getCachedStorefrontProducts(), []);
});

test('missing publication control fails closed instead of retrying without the publication filter', async () => {
  fixture.result = { data: null, error: { message: 'column products.is_published does not exist' } };
  assert.equal((await route.GET()).status, 503);
  assert.equal(fixture.queries.length, 1);
  assert.deepEqual(fixture.queries[0].filters, [['is_published', true]]);
});

test('optional schema fallback retains publication filtering on every attempt', async () => {
  fixture.responses = [{ data: null, error: { message: 'column products.specs does not exist' } }];
  fixture.result = { data: [product()], error: null };
  const response = await route.GET();
  assert.equal(response.status, 200);
  assert.equal((await response.json()).products.length, 1);
  assert.equal(fixture.queries.length, 2);
  assert.ok(!fixture.queries[1].select.split(', ').includes('specs'));
  for (const call of fixture.queries) assert.deepEqual(call.filters, [['is_published', true]]);
});

test('missing credentials and malformed success payloads are unavailable, not empty catalogs', async () => {
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  assert.equal((await route.GET()).status, 503);
  assert.deepEqual(await server.getCachedStorefrontProducts(), []);
  reset();
  fixture.result = { data: null, error: null };
  assert.equal((await route.GET()).status, 503);
});

test('the canonical Supabase project guard remains active for the public feed', async () => {
  process.env.SUPABASE_URL = 'https://wrong-project.supabase.co';
  const response = await route.GET();
  assert.equal(response.status, 503);
  assert.equal(fixture.queries.length, 0);
  assert.ok(!(await response.text()).includes('wrong-project'));
});

test('purchase URLs encode the product id as a single query value', async () => {
  fixture.result.data = [product({ id: 'garment/one?popup=mypage&x=1' })];
  const item = (await (await route.GET()).json()).products[0];
  const url = new URL(item.purchaseUrl);
  assert.equal(url.origin, 'https://enicoveck.com');
  assert.deepEqual([...url.searchParams], [['product', fixture.result.data[0].id]]);
});

test('strict and home readers share the existing revalidation tag and duration', () => {
  const entries = fixture.caches.filter(({ keys }) => keys[0].startsWith('storefront-products'));
  assert.equal(entries.length, 2);
  for (const { options } of entries) {
    assert.equal(options.revalidate, 300);
    assert.deepEqual(options.tags, ['storefront-products']);
  }
});
