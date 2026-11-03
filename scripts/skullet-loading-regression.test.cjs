/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const nativeRequire = createRequire(path.join(root, 'package.json'));
const React = nativeRequire('react');
const { renderToStaticMarkup } = nativeRequire('react-dom/server');
const { Skeleton } = nativeRequire('skullet/react');
const cache = new Map();

function load(file) {
  const absolute = path.resolve(root, file);
  if (cache.has(absolute)) return cache.get(absolute).exports;
  const loaded = { exports: {} };
  cache.set(absolute, loaded);
  const compiled = ts.transpileModule(fs.readFileSync(absolute, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
    fileName: absolute,
  }).outputText;

  function mockRequire(name) {
    if (name === 'skullet/styles.css' || name.endsWith('.css')) {
      return new Proxy({}, { get: (_target, prop) => String(prop) });
    }
    if (name === 'next/image') {
      return {
        __esModule: true,
        default: function Image({ fill, unoptimized, priority, ...props }) {
          void fill;
          void unoptimized;
          void priority;
          return React.createElement('img', props);
        },
      };
    }
    if (name === 'next/dynamic') {
      return { __esModule: true, default: () => () => null };
    }
    if (name === '@/app/context/AuthContext') {
      return { useAuth: () => ({ isAuthenticated: false, user: null }) };
    }
    if (name === '@/lib/supabase/client') {
      return {
        getSupabaseBrowserClient() {
          throw new Error('Skullet UI regression tests must not access Supabase');
        },
      };
    }
    if (name.startsWith('@/') || name.startsWith('.')) {
      const base = name.startsWith('@/')
        ? path.join(root, 'src', name.slice(2))
        : path.resolve(path.dirname(absolute), name);
      const resolved = ['.ts', '.tsx'].map(extension => base + extension).find(fs.existsSync);
      assert.ok(resolved, `Unable to resolve local test module: ${name}`);
      return load(resolved);
    }
    return nativeRequire(name);
  }

  vm.runInThisContext(`(function(require,module,exports){${compiled}\n})`, {
    filename: absolute,
  })(mockRequire, loaded, loaded.exports);
  return loaded.exports;
}

const { FashionCartProvider } = load('src/app/context/FashionCartContext.tsx');
const { StorefrontSkulletProvider, DarkSkulletBoundary } = load(
  'src/app/components/system/StorefrontSkulletProvider.tsx',
);
const { ProductShowcase } = load('src/app/components/subculture/ProductShowcase.tsx');
const { CollectionSection } = load('src/app/components/subculture/CollectionSection.tsx');
const { CustomerOrderCard } = load('src/app/components/subculture/CustomerOrderCard.tsx');
const {
  STOREFRONT_PRODUCT_SAMPLES,
  STOREFRONT_COLLECTION_SAMPLES,
  CUSTOMER_ORDER_CARD_SAMPLES,
} = load('src/lib/storefront/skulletSamples.ts');

function renderWithProviders(element) {
  return renderToStaticMarkup(
    React.createElement(
      StorefrontSkulletProvider,
      null,
      React.createElement(FashionCartProvider, null, element),
    ),
  );
}

test('ProductShowcase renders Skullet ghost container with sample apparel cards while loading', () => {
  const html = renderWithProviders(
    React.createElement(ProductShowcase, {
      initialProducts: [],
      loading: true,
      onProductClick() {},
    }),
  );

  assert.match(html, /skullet-loading/);
  assert.match(html, /skullet-ghost/);
  assert.match(html, /skullet-status/);
  assert.match(html, /의류 게시물을 불러오는 중입니다\./);
  assert.ok(STOREFRONT_PRODUCT_SAMPLES.length >= 4);
  assert.match(html, /Archive Structured Jacket 아카이브 테일러드 재킷/);
});

test('CollectionSection renders Skullet ghost container with polaroid collection cards while loading', () => {
  const html = renderWithProviders(
    React.createElement(CollectionSection, {
      initialCollections: [],
      loading: true,
      onCollectionClick() {},
    }),
  );

  assert.match(html, /skullet-loading/);
  assert.match(html, /skullet-ghost/);
  assert.match(html, /컬렉션 게시물을 불러오는 중입니다\./);
  assert.match(html, /NOCTURNE ARCHIVE 01/);
  assert.equal(STOREFRONT_COLLECTION_SAMPLES.length, 3);
});

test('CustomerOrderCard inside DarkSkulletBoundary renders Skullet ghost structure for zero-shift order lookup', () => {
  const html = renderWithProviders(
    React.createElement(
      DarkSkulletBoundary,
      null,
      React.createElement(
        Skeleton,
        {
          id: 'test-order-card',
          loading: true,
          data: undefined,
          sample: CUSTOMER_ORDER_CARD_SAMPLES[0],
          label: '주문 및 배송 내역을 불러오는 중입니다.',
        },
        order => (order ? React.createElement(CustomerOrderCard, { order }) : null),
      ),
    ),
  );

  assert.match(html, /skullet-loading/);
  assert.match(html, /skullet-ghost/);
  assert.match(html, /주문 및 배송 내역을 불러오는 중입니다\./);
  assert.match(html, /ENV-20261103-0184/);
  assert.match(html, /Archive Structured Jacket/);
});
