/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { fileURLToPath, pathToFileURL } = require('node:url');
const { registerHooks } = require('node:module');
const ts = require('typescript');
const sourceRoot = pathToFileURL(`${path.resolve('src')}${path.sep}`).href;
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === '@/app/components/system/VisitTracker') return { url: 'cart-test:tracker', shortCircuit: true };
    if (specifier.startsWith('@/')) {
      const file = path.resolve('src', specifier.slice(2));
      return { url: pathToFileURL(file + (fs.existsSync(file + '.ts') ? '.ts' : '.tsx')).href, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url === 'cart-test:tracker') return { format: 'module', source: 'export const trackStorefrontEvent = () => {};', shortCircuit: true };
    if (url.startsWith(sourceRoot) && /\.tsx?$/.test(url)) return {
      format: 'module', shortCircuit: true,
      source: ts.transpileModule(fs.readFileSync(fileURLToPath(url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText,
    };
    return nextLoad(url, context);
  },
});
test.after(() => hooks.deregister());
const { CART_STORAGE_KEY, normalizeCartSelections, readCartSelections, writeCartSelections, restoreCanonicalCart } = require(path.resolve('src/lib/storefront/cartPersistence.ts'));
const { fashionCartReducer: reduce } = require(path.resolve('src/app/context/FashionCartContext.tsx'));
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const selection = (id = A, selectedSize = null) => ({ id, selectedSize });
const item = (id = A, overrides = {}) => ({ id, name: 'Current jacket', price: 190000, quantity: 1, image: 'https://example.com/jacket.jpg', selectedSize: null, ...overrides });
const initial = () => ({ cart: [], lastAddedItem: null, additionSequence: 0, savedSelections: null, restored: false, pendingMutations: [] });
const restore = (state, items = [item()], selections = [selection()]) => reduce(state, { type: 'restore', items, selections });
const feed = (overrides = {}) => ({ products: [{ id: A, title: 'Current jacket', price: 190000, currency: 'KRW', images: ['https://example.com/jacket.jpg'], category: '아우터', ...overrides }] });

test('storage saves only version, product ID and option, never price or personal details', () => {
  let raw;
  writeCartSelections({ setItem(key, value) { assert.equal(key, CART_STORAGE_KEY); raw = value; } }, [{ ...item(), email: 'private@example.com', address: 'PRIVATE' }]);
  assert.deepEqual(JSON.parse(raw), { version: 1, items: [selection()] });
  assert.deepEqual(readCartSelections({ getItem: () => raw }), [selection()]);
});

test('malformed, unsupported, oversized and inaccessible storage is harmless', () => {
  for (const raw of [null, '', '{', 'null', '[]', '{"version":2,"items":[]}', 'x'.repeat(30001)]) {
    assert.deepEqual(readCartSelections({ getItem: () => raw }), []);
  }
  assert.deepEqual(readCartSelections({ getItem() { throw new Error('denied'); } }), []);
  assert.doesNotThrow(() => writeCartSelections({ setItem() { throw new Error('quota'); } }, [selection()]));
  assert.deepEqual(normalizeCartSelections([null, selection('invalid'), selection(A, 5), selection(A, 'x'.repeat(41)), selection(), selection(), selection(B, '  M  ')]), [selection(), selection(B, 'M')]);
});

test('reload canonicalizes current price/name/image and fixes quantity to one', () => {
  const raw = JSON.stringify({ version: 1, items: [{ ...selection(), name: 'Tampered', price: 1, quantity: 999, email: 'private@example.com' }] });
  const result = restoreCanonicalCart(readCartSelections({ getItem: () => raw }), feed());
  assert.equal(result[0].price, 190000);
  assert.equal(result[0].name, 'Current jacket');
  assert.equal(result[0].quantity, 1);
  assert.equal(result[0].image, 'https://example.com/jacket.jpg');
  assert.equal(result[0].email, undefined);
});

test('missing, sold-out, invalid-price and unverifiable options are excluded', () => {
  assert.deepEqual(restoreCanonicalCart([selection(B)], feed()), []);
  for (const overrides of [{ isSoldOut: true }, { price: 0 }, { price: -1 }, { price: NaN }, { price: 1.5 }, { price: '100' }, { currency: 'USD' }]) {
    assert.deepEqual(restoreCanonicalCart([selection()], feed(overrides)), []);
  }
  assert.deepEqual(restoreCanonicalCart([selection(A, 'M')], feed()), []);
  assert.deepEqual(restoreCanonicalCart([selection(A, 'L')], feed({ sizes: ['M'] })), []);
  assert.equal(restoreCanonicalCart([selection(A, 'M')], feed({ sizes: ['M'] }))[0].selectedSize, 'M');
  assert.throws(() => restoreCanonicalCart([selection()], { error: 'unavailable' }));
});

test('restore is silent and does not duplicate saved items', () => {
  const state = restore(initial(), restoreCanonicalCart([selection(), selection()], feed()));
  assert.equal(state.cart.length, 1);
  assert.equal(state.lastAddedItem, null);
  assert.deepEqual(state.savedSelections, [selection()]);
  assert.equal(reduce(state, { type: 'restore', items: [], selections: [] }), state);
});

test('adding during restore survives and duplicate add retains canonical price', () => {
  let state = reduce(initial(), { type: 'add', item: item(B) });
  state = reduce(state, { type: 'add', item: item(A, { price: 1, quantity: 100 }) });
  const feedback = state.lastAddedItem;
  state = restore(state);
  assert.deepEqual(state.cart.map((entry) => entry.id), [A, B]);
  assert.ok(state.cart.every((entry) => entry.quantity === 1));
  assert.equal(state.cart[0].price, 190000);
  assert.deepEqual(state.lastAddedItem, feedback);
});

test('remove and zero quantity during restore cannot resurrect a saved item', () => {
  for (const action of [{ type: 'remove', id: A }, { type: 'updateQuantity', id: A, quantity: 0 }]) {
    const state = restore(reduce(initial(), action));
    assert.deepEqual(state.cart, []);
    assert.deepEqual(state.savedSelections, []);
  }
});

test('clear during restore wins, and a subsequent add survives', () => {
  let state = reduce(initial(), { type: 'clear' });
  state = reduce(state, { type: 'add', item: item(B) });
  state = restore(state);
  assert.deepEqual(state.cart.map((entry) => entry.id), [B]);
  assert.deepEqual(state.savedSelections, [selection(B)]);
});

test('feed outage preserves saved IDs without exposing old prices, and respects mutations', () => {
  let state = restore(initial(), null);
  assert.deepEqual(state.cart, []);
  assert.deepEqual(state.savedSelections, [selection()]);
  state = reduce(state, { type: 'add', item: item(B) });
  assert.deepEqual(state.savedSelections, [selection(), selection(B)]);
  state = reduce(state, { type: 'clear' });
  assert.deepEqual(state.savedSelections, []);
  const removed = restore(reduce(initial(), { type: 'remove', id: A }), null);
  assert.deepEqual(removed.savedSelections, []);
});

test('provider waits for restoration before writing and cancels unmounted fetches', () => {
  const source = fs.readFileSync('src/app/context/FashionCartContext.tsx', 'utf8');
  assert.match(source, /if \(state.savedSelections === null\) return;/);
  assert.match(source, /fetch\('\/api\/storefront\/products'/);
  assert.match(source, /cache: 'no-store', signal: controller.signal/);
  assert.match(source, /cancelled = true;\s*controller.abort\(\)/);
  assert.match(source, /setTimeout\(\(\) => controller.abort\(\), 10000\)/);
});


test('edits become persistable before a slow feed returns and survive immediate reload', () => {
  let state = reduce(initial(), { type: 'readSelections', selections: [selection()] });
  state = reduce(state, { type: 'remove', id: A });
  state = reduce(state, { type: 'add', item: item(B) });
  assert.deepEqual(state.savedSelections, [selection(B)]);
  assert.equal(state.restored, false);
  state = restore(state);
  assert.deepEqual(state.cart.map((entry) => entry.id), [B]);
  assert.deepEqual(state.savedSelections, [selection(B)]);
});

test('all non-removal quantity updates remain one, including malformed numbers', () => {
  let state = reduce(initial(), { type: 'add', item: item(A, { quantity: Infinity }) });
  for (const quantity of [NaN, Infinity, 50, 0.5]) {
    state = reduce(state, { type: 'updateQuantity', id: A, quantity });
    assert.equal(state.cart[0].quantity, 1);
  }
});
