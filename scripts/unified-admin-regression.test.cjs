/* eslint-disable @typescript-eslint/no-require-imports -- Isolated, network-free routing regression runner. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const CANONICAL_ADMIN = 'https://enico-mongsangin-admin.vercel.app/';

function fixture(env = {}) {
  let authUser = null;
  let authCalls = 0;
  let clientCalls = 0;
  const localEnv = {
    NODE_ENV: 'production',
    NEXT_PUBLIC_SUPABASE_URL: 'https://gkfupegrduencknzpzok.supabase.co',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'fixture-anon',
    ...env,
  };
  class FakeResponse extends Response {
    constructor(body, options) {
      super(body, options);
      this.cookies = { set() {}, getAll: () => [] };
    }
    static redirect(destination) {
      return new FakeResponse(null, { status: 307, headers: { Location: String(destination) } });
    }
    static next() {
      return new FakeResponse(null, { status: 200, headers: { 'x-middleware-next': '1' } });
    }
    static json(value, options = {}) {
      return new FakeResponse(JSON.stringify(value), { ...options, headers: { 'Content-Type': 'application/json', ...options.headers } });
    }
  }
  const context = vm.createContext({ URL, Set, Response, process: { env: localEnv } });
  const cache = new Map();
  function load(relative) {
    const absolute = path.resolve(relative);
    if (cache.has(absolute)) return cache.get(absolute).exports;
    const mod = { exports: {} };
    cache.set(absolute, mod);
    const compiled = ts.transpileModule(fs.readFileSync(absolute, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    vm.runInContext(`(function(require,module,exports){${compiled}\n})`, context, { filename: absolute })(name => {
      if (name === 'next/server') return { NextResponse: FakeResponse };
      if (name === '@supabase/ssr') return {
        createServerClient() {
          clientCalls += 1;
          return { auth: { async getUser() { authCalls += 1; return { data: { user: authUser }, error: null }; } } };
        },
      };
      if (name.startsWith('@/')) return load(path.join('src', `${name.slice(2)}.ts`));
      throw new Error(`Unexpected routing dependency: ${name}`);
    }, mod, mod.exports);
    return mod.exports;
  }
  const urls = load('src/lib/unified-admin.ts');
  const { proxy } = load('src/proxy.ts');
  const identity = load('src/lib/security/identity.ts');
  return {
    env: localEnv, urls, proxy,
    calls: () => ({ auth: authCalls, client: clientCalls }),
    setUser: user => { authUser = user; },
    owner: { id: identity.PRIMARY_ADMIN_ID, email: identity.PRIMARY_ADMIN_EMAIL, email_confirmed_at: '2026-01-01', is_anonymous: false },
    request(relative, options = {}) {
      const request = new Request(`https://enicoveck.com${relative}`, options);
      request.nextUrl = new URL(request.url);
      request.cookies = { getAll: () => [], set() {} };
      return request;
    },
  };
}

test('unified admin defaults to the canonical production app and keeps local development explicit', () => {
  const production = fixture();
  assert.equal(production.urls.getUnifiedAdminUrl('enico'), `${CANONICAL_ADMIN}?site=enico&view=overview`);
  const development = fixture({ NODE_ENV: 'development' });
  assert.equal(development.urls.getUnifiedAdminUrl('mongsangin', 'orders'), 'http://127.0.0.1:3148/?site=mongsangin&view=orders');
});

test('configured production admin URLs require HTTPS and replace site/view without ambiguous duplicate values', () => {
  for (const invalid of ['not a URL', '/admin', 'http://admin.fixture.test/', 'javascript:alert(1)', 'data:text/html,fixture']) {
    const browser = fixture({ NEXT_PUBLIC_UNIFIED_ADMIN_URL: invalid });
    assert.equal(browser.urls.getUnifiedAdminUrl('enico', 'products'), null, invalid);
  }
  const browser = fixture({ NEXT_PUBLIC_UNIFIED_ADMIN_URL: 'https://admin.fixture.test/dashboard?site=mongsangin&view=members&site=wrong&view=wrong&theme=dark' });
  const result = new URL(browser.urls.getUnifiedAdminUrl('enico', 'collections'));
  assert.equal(result.origin, 'https://admin.fixture.test');
  assert.equal(result.pathname, '/dashboard');
  assert.deepEqual(result.searchParams.getAll('site'), ['enico']);
  assert.deepEqual(result.searchParams.getAll('view'), ['collections']);
  assert.equal(result.searchParams.get('theme'), 'dark');
});

test('legacy view names map to the equivalent unified admin section', () => {
  const { urls } = fixture();
  for (const [pathname, view, expected] of [
    ['/admin', undefined, 'overview'],
    ['/admin', 'inventory', 'products'],
    ['/admin', 'products', 'products'],
    ['/admin', 'adminOrders', 'orders'],
    ['/admin', 'orders', 'orders'],
    ['/admin', 'members', 'members'],
    ['/admin/collections', undefined, 'collections'],
    ['/admin/collections/fixture', 'inventory', 'collections'],
    ['/admin', 'unknown', 'overview'],
  ]) {
    const destination = new URL(urls.getLegacyUnifiedAdminUrl(pathname, view));
    assert.equal(destination.origin, new URL(CANONICAL_ADMIN).origin);
    assert.equal(destination.searchParams.get('site'), 'enico');
    assert.equal(destination.searchParams.get('view'), expected, `${pathname} / ${view}`);
  }
});

test('old admin bookmarks redirect directly to unified admin login without storefront Supabase authentication', async () => {
  const browser = fixture();
  for (const [route, view] of [
    ['/admin', 'overview'],
    ['/admin?view=inventory', 'products'],
    ['/admin/collections', 'collections'],
    ['/admin/collections/fixture?view=inventory', 'collections'],
    ['/admin?view=adminOrders', 'orders'],
  ]) {
    for (const user of [null, { id: 'fixture-ordinary-user' }, browser.owner]) {
      browser.setUser(user);
      const response = await browser.proxy(browser.request(route));
      assert.equal(response.status, 307, route);
      const destination = new URL(response.headers.get('location'));
      assert.equal(destination.origin, new URL(CANONICAL_ADMIN).origin);
      assert.equal(destination.searchParams.get('site'), 'enico');
      assert.equal(destination.searchParams.get('view'), view);
      assert.match(response.headers.get('cache-control'), /private/);
      assert.match(response.headers.get('cache-control'), /no-store/);
    }
  }
  assert.deepEqual(browser.calls(), { auth: 0, client: 0 });
});

test('unified routing leaves private 3D review pages and assets behind verified-owner authorization', async () => {
  const browser = fixture();
  for (const route of ['/collections/test-3d', '/3d/bomber_jacket.glb', '/3d/%62omber_jacket.obj']) {
    for (const user of [null, { ...browser.owner, id: 'fixture-attacker' }, { ...browser.owner, email_confirmed_at: null }]) {
      browser.setUser(user);
      const response = await browser.proxy(browser.request(route));
      assert.equal(response.status, route.startsWith('/3d/') ? 404 : 307, route);
      assert.notEqual(response.headers.get('x-middleware-next'), '1', route);
      assert.match(response.headers.get('cache-control'), /no-store/);
    }
    browser.setUser(browser.owner);
    const allowed = await browser.proxy(browser.request(route));
    assert.equal(allowed.headers.get('x-middleware-next'), '1', route);
  }
  assert.equal(browser.calls().auth, 12);
});

test('admin and acquisition APIs retain their write-origin and size guards instead of entering the page redirect', async () => {
  const browser = fixture();
  for (const route of ['/api/admin/products', '/api/analytics/visit']) {
    const read = await browser.proxy(browser.request(route));
    assert.equal(read.headers.get('x-middleware-next'), '1');
    const sameOrigin = await browser.proxy(browser.request(route, { method: 'POST', headers: { Origin: 'https://enicoveck.com' } }));
    assert.equal(sameOrigin.headers.get('x-middleware-next'), '1');
    const crossOrigin = await browser.proxy(browser.request(route, { method: 'POST', headers: { Origin: 'https://attacker.fixture.test' } }));
    assert.equal(crossOrigin.status, 403);
    const oversized = await browser.proxy(browser.request(route, { method: 'POST', headers: { Origin: 'https://enicoveck.com', 'Content-Length': '200000' } }));
    assert.equal(oversized.status, 413);
  }
  const callback = await browser.proxy(browser.request('/api/orders/nicepay/return', { method: 'POST', headers: { Origin: 'https://pay.nicepay.co.kr' } }));
  assert.equal(callback.headers.get('x-middleware-next'), '1');
  assert.deepEqual(browser.calls(), { auth: 0, client: 0 });
});
