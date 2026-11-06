/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const cache = new Map();
function load(file) {
  const absolute = path.resolve(root, file);
  if (absolute.endsWith('.json')) return JSON.parse(fs.readFileSync(absolute, 'utf8'));
  if (cache.has(absolute)) return cache.get(absolute).exports;
  const mod = { exports: {} }; cache.set(absolute, mod);
  const compiled = ts.transpileModule(fs.readFileSync(absolute, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const resolve = name => {
    const base = name.startsWith('@/') ? path.join(root, 'src', name.slice(2)) : path.resolve(path.dirname(absolute), name);
    const resolved = [base, base + '.ts', base + '.tsx'].find(candidate => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
    assert.ok(resolved, `Missing local dependency ${name}`);
    return load(resolved);
  };
  vm.runInThisContext(`(function(require,module,exports){${compiled}\n})`, { filename: absolute })(resolve, mod, mod.exports);
  return mod.exports;
}
const { parseCorridorEvent, buildCorridorCatalog, isPurchasableProduct, CORRIDOR_CHANNEL } = load('src/lib/storefront/corridorBridge.ts');
const makeProduct = (overrides = {}) => ({ id: 'new-product', name: 'Test Shirt', category: '셔츠', price: 170000, image: 'https://images.example.com/a.jpg', images: ['https://images.example.com/a.jpg'], description: 'Original full description', isSoldOut: false, ...overrides });

test('malformed and unrelated messages cannot invoke storefront commands', () => {
  for (const data of [null, {}, 'open-cart', { type: 'open-cart' }, { channel: 'other', type: 'open-cart' }, { channel: CORRIDOR_CHANNEL, type: 'open-info', info: 'admin' }, { channel: CORRIDOR_CHANNEL, type: 'open-product', id: 'a', imageIndex: -1 }, { channel: CORRIDOR_CHANNEL, type: 'open-product', id: 'a', imageIndex: 1.2 }, { channel: CORRIDOR_CHANNEL, type: 'add-to-cart', id: '' }]) assert.equal(parseCorridorEvent(data), null);
});

test('cart commands discard client-supplied prices, names, and availability', () => {
  assert.deepEqual(parseCorridorEvent({ channel: CORRIDOR_CHANNEL, type: 'add-to-cart', id: 'a', price: 1, name: 'forged', isSoldOut: false }), { type: 'add-to-cart', id: 'a' });
  assert.deepEqual(parseCorridorEvent({ channel: CORRIDOR_CHANNEL, type: 'open-product', id: 'a', imageIndex: 3 }), { type: 'open-product', id: 'a', imageIndex: 3 });
});

test('sold-out, missing, test and invalid-price products cannot be purchased', () => {
  assert.equal(isPurchasableProduct(makeProduct()), true);
  for (const product of [undefined, makeProduct({ isSoldOut: true }), makeProduct({ price: 0 }), makeProduct({ price: NaN }), makeProduct({ price: 1.2 }), makeProduct({ price: -1 }), makeProduct({ id: 'manual-nicepay-test-10krw' })]) assert.equal(isPurchasableProduct(product), false);
});

test('asset geometry follows the product ID when inventory ordering changes', () => {
  const film = makeProduct({ id: 'f8958fbd-4c5d-47b8-8ff8-f0906710af77', name: 'FILM PANTS 블랙 팬츠', category: '팬츠', isSoldOut: true, price: 150000 });
  const shirt = makeProduct({ id: '0bd32ac1-282a-4d1f-bc96-e448e5147975' });
  const first = buildCorridorCatalog([film, shirt], []).pieces;
  const reordered = buildCorridorCatalog([shirt, film], []).pieces;
  assert.deepEqual(first, reordered);
  assert.match(first[0].cutoutImg, /garment_00.webp$/);
  assert.match(first[1].cutoutImg, /garment_01.webp$/);
  assert.equal(first[0].isSoldOut, true);
  assert.equal(first[0].price, 150000);
  assert.equal(first[0].priceText, '150,000원');
  assert.equal(first[1].mountStyle, 'existing');
});

test('new actual products use their own image; hidden payment fixtures never enter the scene', () => {
  const result = buildCorridorCatalog([makeProduct(), makeProduct({ id: 'manual-nicepay-test-10krw' })], []);
  assert.equal(result.pieces.length, 1);
  assert.equal(result.pieces[0].cutoutImg, 'https://images.example.com/a.jpg');
  assert.deepEqual(result.pieces[0].gallery, ['https://images.example.com/a.jpg']);
});
