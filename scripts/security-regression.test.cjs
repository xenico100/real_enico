/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { createRequire } = require('node:module');
const nativeRequire = createRequire(path.resolve('package.json'));
let authUser = null;
let budgetResult = true;
let budgetError = null;
let memberUpdateCount = 0;
let inventoryConflict = false;
let inventoryUpdateFilters = [];
const cache = new Map();

// Compile server modules with a fake Auth response; no DB, email or payment writes.
function load(file) {
  const absolute = path.resolve(file);
  if (cache.has(absolute)) return cache.get(absolute).exports;
  const compiledModule = { exports: {} };
  cache.set(absolute, compiledModule);
  const compiled = ts.transpileModule(fs.readFileSync(absolute, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  function mockRequire(name) {
    if (name === 'server-only') return {};
    if (name === '@supabase/supabase-js') return {
      createClient: () => ({
        auth: {
          getUser: async () => ({ data: { user: authUser }, error: null }),
          admin: {
            getUserById: async (id) => ({ data: { user: { ...owner, id } }, error: null }),
            updateUserById: async () => { memberUpdateCount += 1; throw new Error('Unexpected credential write'); },
          },
        },
        rpc: async () => ({ data: budgetResult, error: budgetError }),
        from: () => {
          let rows = [
            { id: 'private-product', title: 'PRIVATE_FIXTURE', is_published: false, price: 100 },
            { id: 'public-product', title: 'PUBLIC_FIXTURE', is_published: true, price: 100 },
            { id: '11111111-1111-4111-8111-111111111111', title: 'INVENTORY_FIXTURE', is_published: true, raw: { stock: 1 } },
          ];
          let updating = false;
          const query = {
            select: () => query, order: () => query, limit: () => query,
            update: () => { updating = true; inventoryUpdateFilters = []; return query; },
            eq: (key, value) => {
              if (updating) inventoryUpdateFilters.push([key, value]);
              rows = rows.filter(row => key === 'raw' ? JSON.stringify(row.raw) === value : row[key] === value);
              return query;
            },
            is: (key, value) => { if (updating) inventoryUpdateFilters.push([key, value]); rows = rows.filter(row => row[key] === value); return query; },
            maybeSingle: async () => ({ data: updating && inventoryConflict ? null : rows[0] || null, error: null }),
            then: (resolve, reject) => Promise.resolve({ data: rows, error: null }).then(resolve, reject),
          };
          return query;
        },
      }),
    };
    if (name === '@supabase/ssr') return {
      createServerClient: () => ({ auth: { getUser: async () => ({ data: { user: authUser }, error: null }) } }),
    };
    if (name === 'next/headers') return { cookies: async () => ({ getAll: () => [] }) };
    if (name.startsWith('@/')) {
      const base = path.resolve('src', name.slice(2));
      return load(fs.existsSync(`${base}.ts`) ? `${base}.ts` : `${base}.tsx`);
    }
    if (name.startsWith('./') || name.startsWith('../')) {
      const base = path.resolve(path.dirname(absolute), name);
      return load(fs.existsSync(`${base}.ts`) ? `${base}.ts` : `${base}.tsx`);
    }
    return nativeRequire(name);
  }
  vm.runInThisContext(`(function(require,module,exports){${compiled}\n})`, { filename: absolute })(mockRequire, compiledModule, compiledModule.exports);
  return compiledModule.exports;
}

const identity = load('src/lib/security/identity.ts');
const owner = { id: identity.PRIMARY_ADMIN_ID, email: identity.PRIMARY_ADMIN_EMAIL, email_confirmed_at: '2026-01-01', is_anonymous: false };

test('ownership requires immutable ID, verified email, and non-anonymous account', () => {
  assert.equal(identity.isPrimaryAdmin(owner), true);
  for (const user of [null, { ...owner, id: 'different-user' }, { ...owner, email_confirmed_at: null }, { ...owner, is_anonymous: true }, { ...owner, email: 'attacker@enicoveck.com' }]) {
    assert.equal(identity.isPrimaryAdmin(user), false);
  }
});

test('email LIKE metacharacters and backslashes are escaped literally', () => {
  assert.equal(identity.literalEmailPattern('a_b%\\@example.com'), 'a\\_b\\%\\\\@example.com');
});

test('post-login redirect cannot escape the site', () => {
  for (const value of ['//evil.example', '/\\evil.example', '/\nevil', 'https://evil.example']) {
    assert.equal(identity.safeRedirectPath(value, 'https://enicoveck.com'), '/');
  }
  assert.equal(identity.safeRedirectPath('/admin?view=editor', 'https://enicoveck.com'), '/admin?view=editor');
});

test('JSON body rejects arrays, null and actual oversized streams without Content-Length', async () => {
  const { readJsonObject } = load('src/lib/security/requestBody.ts');
  for (const body of ['null', '[]', '{bad']) {
    await assert.rejects(() => readJsonObject(new Request('http://localhost', { method: 'POST', body })));
  }
  await assert.rejects(() => readJsonObject(new Request('http://localhost', { method: 'POST', body: JSON.stringify({ x: 'a'.repeat(200) }) }), 100), { status: 413 });
  assert.equal((await readJsonObject(new Request('http://localhost', { method: 'POST', body: '{"ok":true}' }))).ok, true);
});

test('uploads reject active documents and spoofed image types', () => {
  const { validatedImageExtension } = load('src/lib/security/imageUpload.ts');
  const png = new Uint8Array([137,80,78,71,13,10,26,10]);
  assert.equal(validatedImageExtension(png, 'image/png'), 'png');
  assert.equal(validatedImageExtension(png, 'image/jpeg'), null);
  assert.equal(validatedImageExtension(new TextEncoder().encode('<svg onload="alert(1)"></svg>'), 'image/svg+xml'), null);
  assert.equal(validatedImageExtension(new TextEncoder().encode('<html>bad</html>'), 'image/png'), null);
});

test('catalog input rejects truncated prices, accidental publication and active image URLs', () => {
  const input = load('src/lib/security/adminInput.ts');
  for (const value of [-1, 0, 1.5, '12abc', '1e3', '', null, 2147483648]) {
    assert.throws(() => input.validateAdminInteger(value, '가격', 1));
  }
  assert.equal(input.validateAdminInteger('120000', '가격', 1), 120000);
  for (const value of ['false', 1, null, undefined]) assert.throws(() => input.validateAdminPublished(value));
  assert.equal(input.validateAdminPublished(false), false);
  for (const url of ['javascript:alert(1)', 'data:image/svg+xml,test', '//evil.example/image.png', '/\\evil.example', 'https://user:pass@example.com/image.png']) {
    assert.throws(() => input.validateAdminImages([url]));
  }
  assert.equal(input.validateAdminImages(['https://example.com/product.png'])[0], 'https://example.com/product.png');
  assert.equal(input.validateAdminDate('2026-02-28'), '2026-02-28');
  for (const date of ['2026-02-31', '2026-13-01', 'not-date']) assert.throws(() => input.validateAdminDate(date));
});

test('multipart reader enforces the actual stream size even without Content-Length', async () => {
  const { readFormData } = load('src/lib/security/requestBody.ts');
  const body = '--fixture\r\nContent-Disposition: form-data; name="file"; filename="upload.txt"\r\n\r\n' + 'a'.repeat(200) + '\r\n--fixture--';
  await assert.rejects(() => readFormData(new Request('http://localhost', {
    method: 'POST', headers: { 'Content-Type': 'multipart/form-data; boundary=fixture' }, body,
  }), 100), { status: 413 });
});

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://gkfupegrduencknzpzok.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-only';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-only';

const routes = {
  access: ['GET'], notifications: ['GET'], 'catalog-refresh': ['POST'], products: ['GET','POST','PATCH','DELETE'], collections: ['GET','POST','PATCH','DELETE'],
  users: ['GET','PATCH','DELETE'], orders: ['GET','POST','PATCH','DELETE'],
  'daily-stats': ['GET'], 'products/inventory': ['PATCH'], 'r2-upload': ['POST'],
};
for (const [name, methods] of Object.entries(routes)) {
  test(`admin ${name}: every method denies missing token and ordinary/anonymous/unconfirmed users`, async () => {
    const route = load(`src/app/api/admin/${name}/route.ts`);
    for (const method of methods) {
      authUser = null;
      assert.equal((await route[method](new Request(`http://localhost/api/admin/${name}`, { method }))).status, 401);
      for (const user of [{ ...owner, id: 'attacker' }, { ...owner, is_anonymous: true }, { ...owner, email_confirmed_at: null }]) {
        authUser = user;
        const response = await route[method](new Request(`http://localhost/api/admin/${name}`, { method, headers: { Authorization: 'Bearer fixture' } }));
        assert.equal(response.status, 403);
      }
    }
  });
}

test('owner capability request succeeds', async () => {
  authUser = owner;
  const route = load('src/app/api/admin/access/route.ts');
  const response = await route.GET(new Request('http://localhost/api/admin/access', { headers: { Authorization: 'Bearer fixture' } }));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).canManageOrders, true);
});

test('catalog mutations reject invalid values before a database write', async () => {
  authUser = owner;
  const route = load('src/app/api/admin/products/route.ts');
  for (const patch of [{ price: -1 }, { price: 12.5 }, { price: '120abc' }, { currency: 'USD' }, { is_published: 'false' }, { images: ['javascript:alert(1)'] }]) {
    const response = await route.POST(new Request('http://localhost/api/admin/products', {
      method: 'POST', headers: { Authorization: 'Bearer fixture', 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: '판매 상품', price: 120000, currency: 'KRW', is_published: false, images: [], ...patch }),
    }));
    assert.equal(response.status, 400);
  }
});

test('member management cannot overwrite passwords or move email-bound order ownership', async () => {
  authUser = owner;
  const route = load('src/app/api/admin/users/route.ts');
  for (const patch of [{ password: 'replacement-password' }, { email: 'changed@example.com' }]) {
    const response = await route.PATCH(new Request('http://localhost/api/admin/users', {
      method: 'PATCH', headers: { Authorization: 'Bearer fixture', 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: owner.id, email: owner.email, fullName: '운영자', phone: '', address: '', ...patch }),
    }));
    assert.equal(response.status, 400);
  }
  assert.equal(memberUpdateCount, 0);
});

test('manual stock changes reject malformed counts and detect a concurrent payment stock change', async () => {
  authUser = owner;
  const route = load('src/app/api/admin/products/inventory/route.ts');
  const id = '11111111-1111-4111-8111-111111111111';
  const request = patch => new Request('http://localhost/api/admin/products/inventory', {
    method: 'PATCH', headers: { Authorization: 'Bearer fixture', 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, quantity: 1, isSoldOut: false, ...patch }),
  });
  for (const patch of [{ quantity: 1.5 }, { quantity: '2bad' }, { isSoldOut: 'false' }]) {
    assert.equal((await route.PATCH(request(patch))).status, 400);
  }
  inventoryConflict = true;
  try {
    assert.equal((await route.PATCH(request({}))).status, 409);
    assert.deepEqual(inventoryUpdateFilters, [['id', id], ['is_published', true], ['raw', '{"stock":1}']]);
  } finally { inventoryConflict = false; }
});

test('public studio pages never return unpublished products', async () => {
  const listing = load('src/app/studio/page.tsx');
  const detail = load('src/app/studio/[id]/page.tsx');
  const render = nativeRequire('react-dom/server').renderToStaticMarkup;
  const rendered = render(await listing.default());
  assert.ok(rendered.includes('PUBLIC_FIXTURE'));
  assert.ok(!rendered.includes('PRIVATE_FIXTURE'));
  await assert.rejects(() => detail.default({ params: Promise.resolve({ id: 'private-product' }) }), /NEXT_HTTP_ERROR_FALLBACK;404/);
  assert.ok(render(await detail.default({ params: Promise.resolve({ id: 'public-product' }) })).includes('PUBLIC_FIXTURE'));
});

test('persistent request guard denies at the limit and fails closed on storage error', async () => {
  const { requestBudget } = load('src/lib/security/requestBudget.ts');
  const request = new Request('http://localhost/api/contact');
  budgetResult = true;
  assert.equal(await requestBudget(request, 'test', 2, 60), null);
  budgetResult = false;
  assert.equal((await requestBudget(request, 'test', 2, 60)).status, 429);
  budgetError = { message: 'offline' };
  assert.equal((await requestBudget(request, 'test', 2, 60)).status, 503);
  budgetError = null;
  budgetResult = true;
});

test('proxy denies cross-site writes, caps request size, preserves signed payment callback', async () => {
  const { proxy } = load('src/proxy.ts');
  const { NextRequest } = nativeRequire('next/server');
  const url = 'https://enicoveck.com/api/contact';
  assert.equal((await proxy(new NextRequest(url, { method: 'POST', headers: { Origin: 'https://evil.example' } }))).status, 403);
  assert.equal((await proxy(new NextRequest(url, { method: 'POST', headers: { Origin: 'https://enicoveck.com', 'Content-Length': '200000' } }))).status, 413);
  assert.equal((await proxy(new NextRequest('https://enicoveck.com/api/orders/nicepay/return', { method: 'POST', headers: { Origin: 'https://pay.nicepay.co.kr' } }))).headers.get('x-middleware-next'), '1');
});

test('proxy redirects legacy admin pages to unified admin and still guards owner-only 3D review', async () => {
  const { proxy } = load('src/proxy.ts');
  const { NextRequest } = nativeRequire('next/server');
  const previousUrl = process.env.NEXT_PUBLIC_UNIFIED_ADMIN_URL;
  process.env.NEXT_PUBLIC_UNIFIED_ADMIN_URL = 'https://enico-mongsangin-admin.vercel.app/';
  try {
    // Old admin pages no longer serve private content: every session enters
    // the same unified administrator, which performs its own authentication.
    for (const [path, view] of [['/admin', 'overview'], ['/admin?view=inventory', 'products'], ['/admin/collections', 'collections'], ['/admin/migrate', 'overview'], ['/admin/sync', 'overview']]) {
      for (const user of [null, { ...owner, id: 'attacker' }, owner]) {
        authUser = user;
        const response = await proxy(new NextRequest(`https://enicoveck.com${path}`));
        assert.equal(response.status, 307);
        const destination = new URL(response.headers.get('location'));
        assert.equal(destination.origin, 'https://enico-mongsangin-admin.vercel.app');
        assert.equal(destination.searchParams.get('site'), 'enico');
        assert.equal(destination.searchParams.get('view'), view);
        assert.match(response.headers.get('cache-control') || '', /no-store/);
      }
    }
  } finally {
    if (previousUrl === undefined) delete process.env.NEXT_PUBLIC_UNIFIED_ADMIN_URL;
    else process.env.NEXT_PUBLIC_UNIFIED_ADMIN_URL = previousUrl;
  }
  for (const path of ['/collections/test-3d']) {
    authUser = null;
    assert.equal((await proxy(new NextRequest(`https://enicoveck.com${path}`))).status, 307);
    authUser = { ...owner, id: 'attacker' };
    assert.equal((await proxy(new NextRequest(`https://enicoveck.com${path}`))).status, 307);
    authUser = owner;
    assert.equal((await proxy(new NextRequest(`https://enicoveck.com${path}`))).headers.get('x-middleware-next'), '1');
  }
});

test('3D review assets cannot be fetched without the verified owner session', async () => {
  const { proxy, config } = load('src/proxy.ts');
  const { NextRequest } = nativeRequire('next/server');
  assert.ok(config.matcher.includes('/3d/:path*'));
  assert.ok(config.matcher.some(pattern => pattern.includes('%33')));
  for (const path of [
    '/3d/bomber_jacket.glb', '/3d/bomber_jacket.obj',
    '/3d/%62omber_jacket.glb', '/3d/bomber_jacket%2Eglb',
    '/3d%2fbomber_jacket.glb', '/%33d/bomber_jacket.glb',
    '/3%64/bomber_jacket.glb', '/%33%64/bomber_jacket.glb',
  ]) {
    for (const user of [null, { ...owner, id: 'attacker' }, { ...owner, email_confirmed_at: null }]) {
      authUser = user;
      const response = await proxy(new NextRequest(`https://enicoveck.com${path}`));
      assert.equal(response.status, 404);
      assert.match(response.headers.get('cache-control') || '', /no-store/);
    }
    authUser = owner;
    assert.equal((await proxy(new NextRequest(`https://enicoveck.com${path}`))).headers.get('x-middleware-next'), '1');
  }
  authUser = null;
  assert.equal((await proxy(new NextRequest('https://enicoveck.com/3d/public_product.glb'))).headers.get('x-middleware-next'), '1');
});

test('3D review server layout rejects everyone except the verified owner', async () => {
  const layout = load('src/app/collections/test-3d/layout.tsx').default;
  for (const user of [null, { ...owner, id: 'attacker' }, { ...owner, email_confirmed_at: null }]) {
    authUser = user;
    await assert.rejects(() => layout({ children: 'private-review' }), /NEXT_REDIRECT/);
  }
  authUser = owner;
  assert.equal(await layout({ children: 'private-review' }), 'private-review');
});
