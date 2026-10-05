/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

class OrderValidationError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

function loadTypeScript(file, mocks = {}) {
  const absolute = path.resolve(file);
  const source = fs.readFileSync(absolute, 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const compiledModule = { exports: {} };
  const mockRequire = (name) => {
    if (Object.hasOwn(mocks, name)) return mocks[name];
    if (name === 'server-only') return {};
    if (name === '@/lib/orders/paypalPricing') {
      return loadTypeScript('src/lib/orders/paypalPricing.ts');
    }
    throw new Error(`Unexpected import in payment regression test: ${name}`);
  };
  vm.runInThisContext(`(function(require,module,exports){${compiled}\n})`, {
    filename: absolute,
  })(mockRequire, compiledModule, compiledModule.exports);
  return compiledModule.exports;
}

const paypalServer = loadTypeScript('src/lib/orders/paypalServer.ts', {
  '@/lib/orders/serverOrderValidation': { OrderValidationError },
});

function fakePayPalOrder(status, captures = []) {
  return {
    id: 'PAYPAL-ORDER-123',
    status,
    purchase_units: [{
      amount: { currency_code: 'USD', value: '1.00' },
      payments: { captures },
    }],
  };
}

function completedCapture() {
  return {
    id: 'CAPTURE-123',
    status: 'COMPLETED',
    amount: { currency_code: 'USD', value: '1.00' },
  };
}

function withFakePayPalFetch(handler) {
  const originalFetch = global.fetch;
  const env = {
    PAYPAL_CLIENT_ID: process.env.PAYPAL_CLIENT_ID,
    PAYPAL_CLIENT_SECRET: process.env.PAYPAL_CLIENT_SECRET,
    PAYPAL_API_BASE_URL: process.env.PAYPAL_API_BASE_URL,
  };
  process.env.PAYPAL_CLIENT_ID = 'fixture-id';
  process.env.PAYPAL_CLIENT_SECRET = 'fixture-secret';
  process.env.PAYPAL_API_BASE_URL = 'https://api-m.sandbox.paypal.com';
  global.fetch = handler;
  return () => {
    global.fetch = originalFetch;
    for (const [key, value] of Object.entries(env)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  };
}

test('capture timeout recovers with a provider GET, without a second capture', async () => {
  let orderReads = 0;
  let captureCalls = 0;
  let beforeCaptureCalls = 0;
  const restore = withFakePayPalFetch(async (url, options) => {
    if (url.endsWith('/v1/oauth2/token')) return Response.json({ access_token: 'fixture-token' });
    if (url.endsWith('/v2/checkout/orders/PAYPAL-ORDER-123')) {
      orderReads += 1;
      return Response.json(orderReads === 1
        ? fakePayPalOrder('APPROVED')
        : fakePayPalOrder('COMPLETED', [completedCapture()]));
    }
    if (url.endsWith('/capture') && options.method === 'POST') {
      captureCalls += 1;
      throw new Error('simulated network timeout');
    }
    throw new Error(`Unexpected request: ${url}`);
  });
  try {
    const payment = await paypalServer.capturePayPalOrder(
      { orderId: 'PAYPAL-ORDER-123', expectedTotalKrw: 1350 },
      async () => { beforeCaptureCalls += 1; },
    );
    assert.equal(payment.captureId, 'CAPTURE-123');
    assert.equal(orderReads, 2);
    assert.equal(captureCalls, 1);
    assert.equal(beforeCaptureCalls, 1);
  } finally {
    restore();
  }
});

test('previously completed provider order rejects extra purchase units or captures', async () => {
  const malformedOrders = [
    { ...fakePayPalOrder('COMPLETED', [completedCapture()]), purchase_units: [
      ...fakePayPalOrder('COMPLETED', [completedCapture()]).purchase_units,
      { amount: { currency_code: 'USD', value: '1.00' } },
    ] },
    fakePayPalOrder('COMPLETED', [completedCapture(), completedCapture()]),
  ];
  for (const malformed of malformedOrders) {
    const restore = withFakePayPalFetch(async (url) => {
      if (url.endsWith('/v1/oauth2/token')) return Response.json({ access_token: 'fixture-token' });
      if (url.endsWith('/v2/checkout/orders/PAYPAL-ORDER-123')) return Response.json(malformed);
      throw new Error(`Unexpected request: ${url}`);
    });
    try {
      await assert.rejects(
        () => paypalServer.capturePayPalOrder(
          { orderId: 'PAYPAL-ORDER-123', expectedTotalKrw: 1350 },
          async () => { throw new Error('must not persist'); },
        ),
        { status: 409 },
      );
    } finally {
      restore();
    }
  }
});

test('a completed provider order recovers without re-capturing', async () => {
  let captureCalls = 0;
  const callbackStates = [];
  const restore = withFakePayPalFetch(async (url, options) => {
    if (url.endsWith('/v1/oauth2/token')) return Response.json({ access_token: 'fixture-token' });
    if (url.endsWith('/v2/checkout/orders/PAYPAL-ORDER-123')) {
      return Response.json(fakePayPalOrder('COMPLETED', [completedCapture()]));
    }
    if (url.endsWith('/capture') && options.method === 'POST') captureCalls += 1;
    throw new Error(`Unexpected request: ${url}`);
  });
  try {
    const payment = await paypalServer.capturePayPalOrder(
      { orderId: 'PAYPAL-ORDER-123', expectedTotalKrw: 1350 },
      async (alreadyCompleted) => { callbackStates.push(alreadyCompleted); },
    );
    assert.equal(payment.captureId, 'CAPTURE-123');
    assert.deepEqual(callbackStates, [true]);
    assert.equal(captureCalls, 0);
  } finally {
    restore();
  }
});

test('browser and server PayPal currencies must agree before any provider call', async () => {
  const originalServerCurrency = process.env.PAYPAL_CURRENCY;
  const originalPublicCurrency = process.env.NEXT_PUBLIC_PAYPAL_CURRENCY;
  const originalFetch = global.fetch;
  process.env.PAYPAL_CURRENCY = 'KRW';
  process.env.NEXT_PUBLIC_PAYPAL_CURRENCY = 'USD';
  global.fetch = async () => { throw new Error('No provider call permitted'); };
  try {
    await assert.rejects(
      () => paypalServer.capturePayPalOrder(
        { orderId: 'PAYPAL-ORDER-123', expectedTotalKrw: 1350 },
        async () => {},
      ),
      { status: 500 },
    );
  } finally {
    global.fetch = originalFetch;
    if (originalServerCurrency === undefined) delete process.env.PAYPAL_CURRENCY;
    else process.env.PAYPAL_CURRENCY = originalServerCurrency;
    if (originalPublicCurrency === undefined) delete process.env.NEXT_PUBLIC_PAYPAL_CURRENCY;
    else process.env.NEXT_PUBLIC_PAYPAL_CURRENCY = originalPublicCurrency;
  }
});

function routeFixture() {
  const existing = {
    id: 'row-123',
    order_code: 'ORDER-123',
    payment_method: 'paypal',
    paypal_order_id: 'PAYPAL-ORDER-123',
    paypal_capture_id: 'CAPTURE-123',
    payment_status: 'COMPLETED',
    guest_order_number: 'GUEST-123',
    guest_password_hash: 'secret-pass',
    channel: 'guest',
    customer_name: 'Buyer',
    customer_email: 'buyer@example.com',
    customer_phone: '01012345678',
    customer_country: '대한민국',
    customer_address: 'Seoul',
    amount_total: 1350,
    items: [{ id: 'product-123', quantity: 1, selectedSize: null }],
  };
  let canonicalCalls = 0;
  let captureCalls = 0;
  const db = {
    from(table) {
      assert.equal(table, 'orders');
      const filters = [];
      const query = {
        select: () => query,
        eq: (field, value) => { filters.push([field, value]); return query; },
        maybeSingle: async () => ({
          data: filters.every(([field, value]) => existing[field] === value) ? existing : null,
          error: null,
        }),
      };
      return query;
    },
  };
  process.env.SUPABASE_URL = 'https://fixture.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'fixture-service-key';
  const route = loadTypeScript('src/app/api/orders/paypal/route.ts', {
    'next/cache': { revalidateTag() {} },
    'next/server': { NextResponse: { json: (value, options) => Response.json(value, options) } },
    '@supabase/supabase-js': { createClient: () => db },
    '@/lib/security/requestBudget': { requestBudget: async () => null },
    '@/lib/security/requestBody': { readJsonObject: async (request) => request.json() },
    '@/lib/supabase/projectGuard': { assertExpectedSupabaseProject: (url) => url },
    '@/lib/orders/guestLookup': {
      generateGuestOrderNumber: () => 'GUEST-NEW',
      hashGuestLookupPassword: (value) => value,
      verifyGuestLookupPassword: (value, saved) => value === saved,
    },
    '@/lib/orders/paypalServer': {
      capturePayPalOrder: async () => { captureCalls += 1; throw new Error('No payment API permitted'); },
    },
    '@/lib/orders/checkoutClaims': {
      claimCheckoutProducts: async () => { throw new Error('No claim writes permitted'); },
      releaseCheckoutProducts: async () => { throw new Error('No claim writes permitted'); },
    },
    '@/lib/orders/serverOrderValidation': {
      authenticateOrderRequest: async () => ({ user: null }),
      buildCanonicalOrder: async () => { canonicalCalls += 1; throw new Error('Sold out'); },
      getOrderErrorStatus: (error) => error.status || 500,
      normalizeTransactionId: (value) => value,
      OrderValidationError,
    },
    '@/lib/storefront/productAvailability': { extractPersistentProductIds: () => [] },
    '@/lib/storefront/productAvailabilityDb': {
      fetchProductAvailabilitySnapshot: async () => { throw new Error('No inventory writes permitted'); },
      markProductsSoldOut: async () => { throw new Error('No inventory writes permitted'); },
    },
  });
  const body = {
    transactionId: 'ORDER-123',
    channel: 'guest',
    guestLookupPassword: 'secret-pass',
    customer: {
      name: 'Buyer', email: 'buyer@example.com', phone: '01012345678',
      country: '대한민국', address: 'Seoul',
    },
    pricing: { total: 1350 },
    paypal: { orderId: 'PAYPAL-ORDER-123' },
    items: [{ id: 'product-123', quantity: 1 }],
  };
  return { route, body, getCalls: () => ({ canonicalCalls, captureCalls }) };
}

test('completed order retries bypass the now-sold-out product and never capture again', async () => {
  const { route, body, getCalls } = routeFixture();
  const response = await route.POST(new Request('http://localhost/api/orders/paypal', {
    method: 'POST', body: JSON.stringify(body),
  }));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).alreadyProcessed, true);
  assert.deepEqual(getCalls(), { canonicalCalls: 0, captureCalls: 0 });
});

test('a retry with a wrong guest password or changed product is rejected', async () => {
  const { route, body, getCalls } = routeFixture();
  for (const changed of [
    { ...body, guestLookupPassword: 'wrong-pass' },
    { ...body, items: [{ id: 'different-product', quantity: 1 }] },
  ]) {
    const response = await route.POST(new Request('http://localhost/api/orders/paypal', {
      method: 'POST', body: JSON.stringify(changed),
    }));
    assert.equal(response.status, 409);
    assert.equal((await response.json()).guestOrderNumber, undefined);
  }
  assert.deepEqual(getCalls(), { canonicalCalls: 0, captureCalls: 0 });
});

test('concurrent retries finalize once and send only one order email', async () => {
  let saved = null;
  let successfulFinalizations = 0;
  let emailCalls = 0;
  let claimCalls = 0;
  let releaseCalls = 0;
  let captureStarts = 0;
  let callbackCount = 0;
  let releaseCaptures;
  const bothCapturesStarted = new Promise((resolve) => { releaseCaptures = resolve; });
  const db = {
    from(table) {
      assert.equal(table, 'orders');
      const filters = [];
      let insertData = null;
      let updateData = null;
      const query = {
        select: () => query,
        eq: (field, value) => { filters.push([field, value]); return query; },
        insert: (value) => { insertData = value; return query; },
        update: (value) => { updateData = value; return query; },
        single: async () => {
          if (saved) return { data: null, error: { code: '23505' } };
          saved = { id: 'row-456', ...insertData };
          return { data: saved, error: null };
        },
        maybeSingle: async () => {
          if (!saved || !filters.every(([field, value]) => saved[field] === value)) {
            return { data: null, error: null };
          }
          if (updateData) {
            saved = { ...saved, ...updateData };
            successfulFinalizations += 1;
          }
          return { data: saved, error: null };
        },
      };
      return query;
    },
  };
  const originalFetch = global.fetch;
  const originalResendKey = process.env.RESEND_API_KEY;
  process.env.SUPABASE_URL = 'https://fixture.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'fixture-service-key';
  process.env.RESEND_API_KEY = 'fixture-resend-key';
  global.fetch = async (url) => {
    assert.equal(url, 'https://api.resend.com/emails');
    emailCalls += 1;
    return Response.json({ id: 'fixture-email' });
  };
  try {
    const route = loadTypeScript('src/app/api/orders/paypal/route.ts', {
      'next/cache': { revalidateTag() {} },
      'next/server': { NextResponse: { json: (value, options) => Response.json(value, options) } },
      '@supabase/supabase-js': { createClient: () => db },
      '@/lib/security/requestBudget': { requestBudget: async () => null },
      '@/lib/security/requestBody': { readJsonObject: async (request) => request.json() },
      '@/lib/supabase/projectGuard': { assertExpectedSupabaseProject: (url) => url },
      '@/lib/orders/guestLookup': {
        generateGuestOrderNumber: () => 'GUEST-NEW',
        hashGuestLookupPassword: (value) => value,
        verifyGuestLookupPassword: (value, stored) => value === stored,
      },
      '@/lib/orders/paypalServer': {
        capturePayPalOrder: async (_input, beforeCapture) => {
          // One request has already been captured upstream; both paths must
          // still verify the same product claim before local finalization.
          await beforeCapture(callbackCount++ === 1);
          captureStarts += 1;
          if (captureStarts === 2) releaseCaptures();
          await bothCapturesStarted;
          return {
            orderId: 'PAYPAL-ORDER-123', captureId: 'CAPTURE-123',
            status: 'COMPLETED', currency: 'USD', value: '1.00',
          };
        },
      },
      '@/lib/orders/checkoutClaims': {
        claimCheckoutProducts: async () => { claimCalls += 1; },
        releaseCheckoutProducts: async () => { releaseCalls += 1; },
      },
      '@/lib/orders/serverOrderValidation': {
        authenticateOrderRequest: async () => ({ user: null }),
        buildCanonicalOrder: async () => ({
          items: [{
            id: 'product-123', name: 'Fixture', category: '기타', selectedSize: null,
            quantity: 1, unitPrice: 1350, lineTotal: 1350,
          }],
          pricing: { subtotal: 1350, shipping: 0, tax: 0, total: 1350, currency: 'KRW' },
        }),
        getOrderErrorStatus: (error) => error.status || 500,
        normalizeTransactionId: (value) => value,
        OrderValidationError,
      },
      '@/lib/storefront/productAvailability': { extractPersistentProductIds: () => ['product-123'] },
      '@/lib/storefront/productAvailabilityDb': {
        fetchProductAvailabilitySnapshot: async () => ({
          rows: [{ id: 'product-123' }], hasRawColumn: false,
        }),
        markProductsSoldOut: async () => {},
      },
    });
    const body = {
      transactionId: 'ORDER-123', channel: 'guest', guestLookupPassword: 'secret-pass',
      customer: {
        name: 'Buyer', email: 'buyer@example.com', phone: '01012345678',
        country: '대한민국', address: 'Seoul',
      },
      pricing: { total: 1350 },
      paypal: { orderId: 'PAYPAL-ORDER-123' },
      items: [{ id: 'product-123', quantity: 1 }],
    };
    const send = () => route.POST(new Request('http://localhost/api/orders/paypal', {
      method: 'POST', body: JSON.stringify(body),
    }));
    const responses = await Promise.all([send(), send()]);
    assert.deepEqual(responses.map((response) => response.status), [200, 200]);
    const results = await Promise.all(responses.map((response) => response.json()));
    assert.equal(results.filter((result) => result.alreadyProcessed).length, 1);
    assert.equal(successfulFinalizations, 1);
    assert.equal(emailCalls, 1);
    assert.equal(claimCalls, 2);
    assert.equal(releaseCalls, 1);
  } finally {
    global.fetch = originalFetch;
    if (originalResendKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = originalResendKey;
  }
});
