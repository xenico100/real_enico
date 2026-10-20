/* eslint-disable @typescript-eslint/no-require-imports -- Mock-browser, network-free tracker regression runner. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

const flush = () => new Promise(resolve => setImmediate(resolve));

function createBrowser({ url = 'https://enicoveck.com/', referrer = '', storageDisabled = false } = {}) {
  const calls = [];
  const responses = [];
  const idleJobs = new Map();
  const localValues = new Map();
  const sessionValues = new Map();
  let nextJob = 1;
  let pathname = new URL(url).pathname;
  let cleanup;

  const storage = values => ({
    getItem(key) {
      if (storageDisabled) throw new Error('Fixture storage access denied');
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      if (storageDisabled) throw new Error('Fixture storage quota denied');
      values.set(key, String(value));
    },
  });
  const browser = {
    location: { href: url, pathname },
    localStorage: storage(localValues),
    sessionStorage: storage(sessionValues),
  };
  const document = { referrer };
  const sandbox = {
    URL, Date, Intl, Promise, Set, JSON,
    window: browser,
    document,
    fetch(input, options) {
      assert.equal(input, '/api/analytics/visit');
      assert.equal(options.method, 'POST');
      calls.push({ payload: JSON.parse(options.body), keepalive: options.keepalive });
      return responses.length ? responses.shift() : Promise.resolve({ ok: true });
    },
    requestIdleCallback(callback) {
      const id = nextJob++;
      idleJobs.set(id, callback);
      return id;
    },
    cancelIdleCallback(id) { idleJobs.delete(id); },
    setTimeout(callback) {
      const id = nextJob++;
      idleJobs.set(id, callback);
      return id;
    },
    clearTimeout(id) { idleJobs.delete(id); },
  };
  const context = vm.createContext(sandbox);
  const cache = new Map();
  function load(relative) {
    const absolute = path.resolve(relative);
    if (cache.has(absolute)) return cache.get(absolute).exports;
    const mod = { exports: {} };
    cache.set(absolute, mod);
    const compiled = ts.transpileModule(fs.readFileSync(absolute, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
    }).outputText;
    vm.runInContext(`(function(require,module,exports){${compiled}\n})`, context, { filename: absolute })(name => {
      if (name === 'react') return { useEffect: callback => { cleanup = callback(); } };
      if (name === 'next/navigation') return { usePathname: () => pathname };
      if (name === '@/lib/analytics/visitSource') return load('src/lib/analytics/visitSource.ts');
      throw new Error(`Unexpected tracker dependency: ${name}`);
    }, mod, mod.exports);
    return mod.exports;
  }
  const tracker = load('src/app/components/system/VisitTracker.tsx');
  return {
    calls, idleJobs, localValues, sessionValues,
    queueResponse: promise => responses.push(promise),
    navigate(nextUrl, nextReferrer = browser.location.href) {
      pathname = new URL(nextUrl).pathname;
      browser.location = { href: nextUrl, pathname };
      document.referrer = nextReferrer;
    },
    render() {
      cleanup = undefined;
      assert.equal(tracker.VisitTracker(), null);
      return cleanup;
    },
    event: params => tracker.trackStorefrontEvent(params),
    async runIdle() {
      const pending = [...idleJobs.values()];
      idleJobs.clear();
      for (const callback of pending) callback({ didTimeout: false, timeRemaining: () => 50 });
      await flush();
    },
  };
}

test('tracking still posts acquisition and interactions when both browser storages are unavailable', async () => {
  const browser = createBrowser({
    url: 'https://enicoveck.com/?utm_source=naver&utm_medium=cpc&utm_campaign=fixture',
    storageDisabled: true,
  });
  assert.doesNotThrow(() => browser.render());
  await browser.runIdle();
  assert.equal(browser.calls.length, 1);
  assert.equal(browser.calls[0].payload.attribution.source, 'naver');
  assert.equal(browser.calls[0].payload.attribution.channel, 'paid_search');
  browser.event({ type: 'cart_open', target: 'cart' });
  await flush();
  assert.equal(browser.calls.length, 2);
  assert.equal(browser.calls[1].payload.event.type, 'cart_open');
  assert.equal(browser.calls[1].payload.attribution.utm.campaign, 'fixture');
});

test('a cancelled idle effect does not mark a visit sent and StrictMode remount still tracks it', async () => {
  const browser = createBrowser({ referrer: 'https://www.youtube.com/' });
  const cleanup = browser.render();
  assert.equal(browser.idleJobs.size, 1);
  assert.equal(typeof cleanup, 'function');
  cleanup();
  assert.equal(browser.idleJobs.size, 0);
  assert.equal(browser.sessionValues.size, 0);
  browser.render();
  await browser.runIdle();
  assert.equal(browser.calls.length, 1);
  assert.equal(browser.calls[0].payload.attribution.source, 'youtube');
  assert.equal(browser.sessionValues.size, 1);
  browser.render();
  await browser.runIdle();
  assert.equal(browser.calls.length, 1, 'successful page views deduplicate after the response');
});

test('the first page-view response completes before a queued interaction can use the visitor cookie', async () => {
  const browser = createBrowser({ referrer: 'https://search.naver.com/' });
  const firstResponse = deferred();
  browser.queueResponse(firstResponse.promise);
  browser.render();
  await browser.runIdle();
  assert.equal(browser.calls.length, 1);
  assert.equal(browser.calls[0].payload.event, undefined);
  browser.event({ type: 'add_to_cart', target: 'fixture-jacket' });
  await flush();
  assert.equal(browser.calls.length, 1, 'interaction must wait while the cookie-bearing response is unresolved');
  firstResponse.resolve({ ok: true });
  await flush();
  assert.equal(browser.calls.length, 2);
  assert.equal(browser.calls[1].payload.event.type, 'add_to_cart');
  assert.equal(browser.calls[1].payload.attribution.source, 'naver');
});

test('first acquisition survives internal navigation and event requests keep the original landing path', async () => {
  const browser = createBrowser({
    url: 'https://enicoveck.com/?utm_source=instagram&utm_medium=social&utm_campaign=fixture-launch',
    referrer: 'https://l.instagram.com/',
  });
  browser.render();
  await browser.runIdle();
  const firstAttribution = browser.calls[0].payload.attribution;
  browser.navigate('https://enicoveck.com/apparel');
  browser.render();
  await browser.runIdle();
  browser.event({ type: 'checkout_open', target: 'checkout' });
  await flush();
  assert.equal(browser.calls.length, 3);
  assert.equal(browser.calls[1].payload.path, '/apparel');
  assert.deepEqual(browser.calls[1].payload.attribution, firstAttribution);
  assert.deepEqual(browser.calls[2].payload.attribution, firstAttribution);
  assert.equal(browser.calls[2].payload.attribution.landingPath, '/');
  assert.equal(browser.calls[2].payload.event.type, 'checkout_open');
});

test('admin and dev routes never emit page views or storefront events', async () => {
  const browser = createBrowser();
  for (const route of ['/admin', '/admin/orders', '/dev/order-preview', '/dev/fixture']) {
    browser.navigate(`https://enicoveck.com${route}`);
    browser.render();
    browser.event({ type: 'tab_click', target: 'fixture' });
    await browser.runIdle();
  }
  assert.equal(browser.idleJobs.size, 0);
  assert.equal(browser.calls.length, 0);
  assert.equal(browser.localValues.size, 0);
  assert.equal(browser.sessionValues.size, 0);
});

test('failed page-view responses remain retryable and successful responses mark the session only afterward', async () => {
  const browser = createBrowser({ referrer: 'https://search.naver.com/' });
  browser.queueResponse(Promise.resolve({ ok: false }));
  browser.render();
  await browser.runIdle();
  assert.equal(browser.calls.length, 1);
  assert.equal(browser.sessionValues.size, 0);
  browser.render();
  await browser.runIdle();
  assert.equal(browser.calls.length, 2);
  assert.equal(browser.sessionValues.size, 1);
  assert.equal(browser.calls[1].payload.attribution.source, 'naver');
});
