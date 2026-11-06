/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const channel = 'enico-corridor-v1';

// Execute the real component with deterministic hooks, frame events and timers.
// This exercises state/effects and the rendered controls without a GPU or DOM package.
function harness({ savedMode, storageBlocked = false } = {}) {
  const slots = [], effects = [], listeners = new Map(), timers = new Map();
  let cursor = 0, timerId = 0, tree, lastFrameRef;
  const storage = new Map(savedMode ? [['enico-storefront-view', savedMode]] : []);
  const frameWindow = { postMessage() {} };
  const commands = [];
  const cart = [];
  const hooks = {
    useSyncExternalStore(subscribe, read) { return read(); },
    useState(initial) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial;
      return [slots[i], value => { slots[i] = typeof value === 'function' ? value(slots[i]) : value; }];
    },
    useRef(initial) { const i = cursor++; return slots[i] ||= { current: initial }; },
    useMemo(fn, deps) {
      const i = cursor++, old = slots[i];
      if (!old || deps.some((d, j) => !Object.is(d, old.deps[j]))) slots[i] = { deps, value: fn() };
      return slots[i].value;
    },
    useCallback(fn, deps) { return hooks.useMemo(() => fn, deps); },
    useEffect(fn, deps) {
      const i = cursor++, old = slots[i];
      if (!old || deps.some((d, j) => !Object.is(d, old.deps[j]))) {
        effects.push(() => { old?.cleanup?.(); slots[i] = { deps, cleanup: fn() }; });
      }
    },
  };
  const products = [{ id: 'real-shirt', fullName: '실제 셔츠', gallery: ['/shirt.webp'], priceText: '170,000원', isSoldOut: false }, { id: 'sold-out', fullName: '품절 셔츠', gallery: ['/sold.webp'], priceText: '150,000원', isSoldOut: true }];
  const collections = [{ id: 'real-collection', title: '컬렉션 01' }];
  const props = { products, collections, overlayOpen: false, onCommand: (command, reply) => { commands.push(command); reply('확인'); } };
  const imports = {
    react: hooks,
    'react/jsx-runtime': { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }), Fragment: 'fragment' },
    '@/lib/storefront/corridorBridge': { CORRIDOR_CHANNEL: channel, buildCorridorCatalog: (pieces, collections) => ({ pieces, collections }), parseCorridorEvent: data => data?.channel === channel && ['ready', 'scene-ready', 'open-cart'].includes(data.type) ? { type: data.type } : null },
    '@/app/context/FashionCartContext': { useFashionCart: () => ({ cart: [...cart] }) },
    '@/app/context/AuthContext': { useAuth: () => ({ isAuthenticated: false, isAuthReady: true }) },
    './CorridorShowroom.module.css': { default: new Proxy({}, { get: (_, key) => key }) },
  };
  const mod = { exports: {} };
  const source = fs.readFileSync(path.join(root, 'src/app/components/subculture/CorridorShowroom.tsx'), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(compiled, { module: mod, exports: mod.exports, require: name => { assert.ok(imports[name], name); return imports[name]; }, setTimeout: fn => { timers.set(++timerId, fn); return timerId; }, clearTimeout: id => timers.delete(id), window: { localStorage: { getItem: key => { if (storageBlocked) throw new Error('blocked'); return storage.get(key); }, setItem: (key, value) => { if (storageBlocked) throw new Error('blocked'); storage.set(key, value); } }, location: { origin: 'https://shop.test' }, addEventListener: (type, fn) => listeners.set(type, fn), removeEventListener: type => listeners.delete(type) } });
  function all(node = tree) {
    if (!node || typeof node !== 'object') return [];
    if (Array.isArray(node)) return node.flatMap(all);
    return [node, ...all(node.props?.children ?? null)];
  }
  function render() {
    cursor = 0;
    tree = mod.exports.CorridorShowroom(props);
    const frame = all().find(node => node.type === 'iframe');
    if (frame) { lastFrameRef = frame.props.ref; lastFrameRef.current = { contentWindow: frameWindow }; }
    else if (lastFrameRef) lastFrameRef.current = null;
    effects.splice(0).forEach(fn => fn());
    return tree;
  }
  render();
  return {
    props, commands, cart, render, all, storage,
    toggle() { all().find(n => n.props?.['aria-label'] === '3D 전시').props.onClick(); render(); },
    fallback: () => all().find(node => node.props?.['aria-label'] === '상품 목록'),
    message(type, overrides = {}) { listeners.get('message')({ origin: 'https://shop.test', source: frameWindow, data: { channel, type }, ...overrides }); render(); },
    tick() { const pending = [...timers.values()]; timers.clear(); pending.forEach(fn => fn()); render(); },
    click(label) { const button = all().find(node => node.type === 'button' && JSON.stringify(node.props.children).includes(label)); assert.ok(button, label); button.props.onClick(); render(); },
    unmount() { slots.forEach(slot => slot?.cleanup?.()); },
    timers,
  };
}

test('frame handshake alone does not suppress timeout; successful scene preserves 3D', () => {
  const loading = harness();
  loading.message('ready');
  assert.equal(loading.fallback(), undefined);
  loading.tick();
  assert.ok(loading.fallback());
  const ready = harness();
  ready.message('scene-ready');
  ready.tick();
  assert.equal(ready.fallback(), undefined);
  assert.ok(ready.all().find(n => n.type === 'iframe')); 
});

test('only the exact same-origin iframe may signal failure or issue commands', () => {
  const h = harness();
  h.message('scene-failed', { origin: 'https://evil.test' });
  h.message('scene-failed', { source: {} });
  h.message('scene-failed', { data: { channel: 'other', type: 'scene-failed' } });
  h.message('open-cart', { source: {} });
  assert.equal(h.fallback(), undefined);
  assert.equal(h.commands.length, 0);
  h.message('scene-failed');
  assert.ok(h.fallback());
  assert.equal(h.all().find(n => n.type === 'iframe'), undefined);
});

test('fallback uses real products, sold-out prices, collection IDs and existing shopping commands', () => {
  const h = harness();
  h.message('scene-failed');
  const rendered = JSON.stringify(h.fallback());
  assert.match(rendered, /170,000원/);
  assert.match(rendered, /150,000원/);
  assert.match(rendered, /품절/);
  h.click('실제 셔츠');
  h.click('장바구니');
  h.click('로그인 / 주문조회');
  h.click('컬렉션 01');
  h.click('사업자 · 이용 안내');
  assert.deepEqual(JSON.parse(JSON.stringify(h.commands)), [
    { type: 'open-product', id: 'real-shirt', imageIndex: 0 },
    { type: 'open-cart' }, { type: 'open-info', info: 'mypage' },
    { type: 'open-collection', id: 'real-collection', imageIndex: 0 },
    { type: 'open-shop-info' },
  ]);
  h.props.overlayOpen = true;
  h.render();
  assert.equal(h.fallback().props.inert, true);
  assert.equal(h.fallback().props['aria-hidden'], true);
  h.props.overlayOpen = false;
  h.render();
  assert.equal(h.fallback().props.inert, false);
});

test('late scene readiness does not dismiss fallback; retry remounts and rearms the timeout', () => {
  const h = harness();
  h.tick();
  h.message('scene-ready');
  assert.ok(h.fallback());
  h.click('3D 전시 다시 열기');
  assert.equal(h.fallback(), undefined);
  assert.equal(h.timers.size, 1);
  h.tick();
  assert.ok(h.fallback());
  h.unmount();
  assert.equal(h.timers.size, 0);
});

test('fallback remains current when catalog and cart change', () => {
  const h = harness();
  h.tick();
  h.props.products = [];
  h.cart.push({ id: 'real-shirt', quantity: 1 });
  h.render();
  assert.doesNotMatch(JSON.stringify(h.fallback()), /170,000원/);
  assert.match(JSON.stringify(h.fallback()), /현재 판매 중인 상품이 없습니다/);
  const cartButton = h.all().find(n => n.type === 'button' && Array.isArray(n.props.children) && n.props.children[0] === '장바구니 (');
  assert.equal(cartButton.props.children[1], 1);
});

test('boot reports renderer and context failures without alleging a network outage', () => {
  const sent = [], events = new Map(), elements = new Map();
  for (const id of ['veil', 'loadTitle', 'loadMessage', 'loadRetry']) elements.set(id, { classList: { toggle() {} }, setAttribute() {} });
  const window = { parent: { postMessage: (...args) => sent.push(args) } };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'public/corridor/boot.js'), 'utf8'), { window, location: { origin: 'https://shop.test' }, document: { getElementById: id => elements.get(id), addEventListener: (name, fn) => events.set(name, fn) }, setTimeout() {}, clearTimeout() {}, addEventListener: (name, fn) => events.set(name, fn) });
  events.get('error')({ error: new Error('WebGL context creation failed') });
  assert.equal(window.enicoBoot.state, 'failed');
  assert.equal(sent[0][0].type, 'scene-failed');
  assert.equal(sent[0][1], 'https://shop.test');
  assert.doesNotMatch(elements.get('loadTitle').textContent, /CONNECTION LOST/);
  window.enicoBoot.state = 'ready';
  events.get('webglcontextlost')();
  assert.equal(window.enicoBoot.state, 'failed');
  assert.equal(sent.length, 2);
});


test('fallback scrolls independently of the showroom body scroll lock', () => {
  const css = fs.readFileSync(path.join(root, 'src/app/components/subculture/CorridorShowroom.module.css'), 'utf8');
  const fallback = css.match(/\.catalogFallback \{([^}]+)\}/)[1];
  assert.match(fallback, /position: fixed/);
  assert.match(fallback, /inset: 0/);
  assert.match(fallback, /overflow-y: auto/);
  assert.match(css, /\.scene\[hidden\] \{ display: none/);
});


test('manual toggle stops 3D, retains shopping and persists the selected mode', () => {
  const h = harness();
  h.message('scene-ready');
  const toggle = () => h.all().find(n => n.props?.['aria-label'] === '3D 전시');
  assert.equal(toggle().type, 'button');
  assert.equal(toggle().props['aria-pressed'], true);
  h.toggle();
  assert.equal(toggle().props['aria-pressed'], false);
  assert.equal(h.all().find(n => n.type === 'iframe'), undefined);
  assert.ok(h.fallback());
  assert.equal(h.timers.size, 0);
  assert.equal(h.storage.get('enico-storefront-view'), '2d');
  h.click('실제 셔츠');
  assert.equal(h.commands[0].type, 'open-product');
  h.props.overlayOpen = true;
  h.render();
  assert.equal(toggle().props.hidden, true);
  h.props.overlayOpen = false;
  h.render();
  h.toggle();
  assert.equal(toggle().props['aria-pressed'], true);
  assert.ok(h.all().find(n => n.type === 'iframe'));
  assert.equal(h.storage.get('enico-storefront-view'), '3d');
  assert.equal(h.timers.size, 1);
});

test('saved 2D mode never starts a frame or timeout; storage failures do not block toggling', () => {
  const saved = harness({ savedMode: '2d' });
  assert.ok(saved.fallback());
  assert.equal(saved.all().find(n => n.type === 'iframe'), undefined);
  assert.equal(saved.timers.size, 0);
  saved.tick();
  assert.ok(saved.fallback());
  const blocked = harness({ storageBlocked: true });
  blocked.toggle();
  assert.ok(blocked.fallback());
  blocked.toggle();
  assert.equal(blocked.fallback(), undefined);
  assert.ok(blocked.all().find(n => n.type === 'iframe'));
});

test('automatic rendering failures do not overwrite the saved user preference', () => {
  const h = harness({ savedMode: '3d' });
  h.message('scene-failed');
  assert.equal(h.storage.get('enico-storefront-view'), '3d');
  assert.equal(h.all().find(n => n.props?.['aria-label'] === '3D 전시').props['aria-pressed'], false);
  h.toggle();
  assert.equal(h.fallback(), undefined);
  assert.equal(h.timers.size, 1);
});

test('toggle has touch dimensions, visible keyboard focus and reduced-motion styling', () => {
  const css = fs.readFileSync(path.join(root, 'src/app/components/subculture/CorridorShowroom.module.css'), 'utf8');
  assert.match(css, /\.viewToggle \{[^}]*min-height: 60px/);
  assert.match(css, /\.viewToggle:focus-visible/);
  assert.match(css, /prefers-reduced-motion: reduce[^@]*\.toggleOrb span[^}]*transition: none/);
});
