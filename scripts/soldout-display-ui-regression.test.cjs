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
const cache = new Map();

// Keep the real React hooks, cart provider, motion components and catalog rules.
// Only browser/Next.js adapters are stubbed; rendering never contacts a service.
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
          throw new Error('UI regression tests must not access Supabase');
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
const { buildProductCatalog } = load('src/lib/storefront/productCatalog.ts');
const { ProductShowcase } = load('src/app/components/subculture/ProductShowcase.tsx');
const { ProductDetailPopup } = load('src/app/components/subculture/ProductDetailPopup.tsx');

const JACKET_ID = '7cd29c56-20a4-4677-813e-adbf1043b256';
const KITTY_ID = 'a75022d3-acae-4321-8b8c-4f896237193a';
const products = buildProductCatalog([
  {
    id: JACKET_ID,
    title: 'Re: flower of evil jacket',
    price: 220000,
    category: '아우터',
    images: ['https://images.example.com/jacket.jpg'],
    is_published: false,
  },
  {
    id: KITTY_ID,
    title: 'Night Kitty',
    price: 28000,
    category: '인형',
    images: ['https://images.example.com/kitty.jpg'],
    is_published: true,
  },
  {
    id: '11111111-1111-4111-8111-111111111111',
    title: 'PRIVATE_DRAFT_MUST_NOT_RENDER',
    price: 150000,
    images: ['https://images.example.com/private.jpg'],
    is_published: false,
  },
]);
const jacket = products.find(product => product.id === JACKET_ID);
const kitty = products.find(product => product.id === KITTY_ID);
assert.ok(jacket, 'The approved sold-out jacket must survive catalog projection');
assert.ok(kitty, 'The available Night Kitty must survive catalog projection');

function render(element) {
  return renderToStaticMarkup(React.createElement(FashionCartProvider, null, element));
}

function renderShowcase(initialProducts) {
  return render(React.createElement(ProductShowcase, {
    initialProducts,
    onProductClick() {},
  }));
}

function renderDetail(product) {
  return render(React.createElement(ProductDetailPopup, { product, onClose() {} }));
}

function buttons(markup) {
  return Array.from(markup.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g), match => ({
    attributes: match[1],
    text: match[2].replace(/<[^>]*>/g, '').replace(/\s+/g, ''),
    disabled: /\bdisabled(?:="[^"]*")?(?:\s|$)/.test(match[1]),
  }));
}

function findButton(markup, predicate, label) {
  const matches = buttons(markup).filter(predicate);
  assert.equal(matches.length, 1, `Expected exactly one ${label} button`);
  return matches[0];
}

test('the real showcase keeps the sold jacket and available doll without exposing private drafts', () => {
  const markup = renderShowcase(products);
  assert.match(markup, /Re: flower of evil jacket 상세 보기/);
  assert.match(markup, /Night Kitty 상세 보기/);
  assert.match(markup, /220,000원/);
  assert.match(markup, /28,000원/);
  assert.equal((markup.match(/SOLD OUT/g) || []).length, 1);
  assert.doesNotMatch(markup, /PRIVATE_DRAFT_MUST_NOT_RENDER|NICE Payments 1000Won Test|>0원</);
});

test('the sold jacket thumbnail has an accessible noninteractive sticker and a disabled cart button', () => {
  const markup = renderShowcase([jacket]);
  assert.match(markup, /<span[^>]*class="[^"]*pointer-events-none[^>]*>\s*<span aria-hidden="true">SOLD OUT<\/span>/);
  assert.match(markup, /<span class="sr-only">품절 상품<\/span>/);
  assert.equal(findButton(markup, button => button.text === '품절', 'jacket cart').disabled, true);
  assert.match(markup, /220,000원/);
  assert.doesNotMatch(markup, />0원</);
});

test('Night Kitty has no sold-out sticker and its card can still add to cart', () => {
  const markup = renderShowcase([kitty]);
  assert.doesNotMatch(markup, /SOLD OUT|품절 상품/);
  assert.equal(findButton(markup, button => button.text === '장바구니담기', 'Night Kitty cart').disabled, false);
  assert.match(markup, /28,000원/);
});

test('an unrelated sold-out product remains hidden even if passed directly to the showcase', () => {
  const markup = renderShowcase([{
    ...jacket,
    id: '22222222-2222-4222-8222-222222222222',
    name: 'UNAPPROVED_SOLD_PRODUCT',
  }]);
  assert.doesNotMatch(markup, /UNAPPROVED_SOLD_PRODUCT|SOLD OUT/);
});

test('the sold jacket detail remains viewable while both purchase buttons are disabled', () => {
  const markup = renderDetail(jacket);
  assert.match(markup, /role="dialog"/);
  assert.match(markup, /Re: flower of evil jacket/);
  assert.match(markup, /220,000원/);
  assert.doesNotMatch(markup, />0원</);
  assert.equal(findButton(markup, button => button.text === '품절X', 'jacket cart').disabled, true);
  const naver = findButton(markup, button => button.text.includes('네이버구매'), 'jacket Naver purchase');
  assert.equal(naver.disabled, true);
  assert.match(naver.attributes, /aria-label="네이버 구매 불가: 품절"/);
});

test('Night Kitty detail keeps its original price and both purchase buttons enabled', () => {
  const markup = renderDetail(kitty);
  assert.match(markup, /role="dialog"/);
  assert.match(markup, /Night Kitty/);
  assert.match(markup, /28,000원/);
  assert.equal(findButton(markup, button => button.text === '장바구니담기+', 'Night Kitty cart').disabled, false);
  const naver = findButton(markup, button => button.text.includes('네이버구매'), 'Night Kitty Naver purchase');
  assert.equal(naver.disabled, false);
  assert.doesNotMatch(naver.attributes, /구매 불가|품절/);
});
