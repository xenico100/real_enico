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

function load(file, extra = {}, localCache = cache) {
  const absolute = path.resolve(root, file);
  if (localCache.has(absolute)) return localCache.get(absolute).exports;
  const loaded = { exports: {} };
  localCache.set(absolute, loaded);
  const compiled = ts.transpileModule(fs.readFileSync(absolute, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    fileName: absolute,
  }).outputText;
  function mockRequire(name) {
    if (extra[name]) return extra[name];
    if (name.endsWith('.module.css')) return { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) };
    if (name === 'next/image') return { __esModule: true, default: ({ fill, unoptimized, ...props }) => { void fill; void unoptimized; return React.createElement('img', props); } };
    if (name.startsWith('@/') || name.startsWith('.')) {
      const base = name.startsWith('@/') ? path.join(root, 'src', name.slice(2)) : path.resolve(path.dirname(absolute), name);
      const resolved = ['.ts', '.tsx'].map(extension => base + extension).find(fs.existsSync);
      assert.ok(resolved, `Unresolved test import ${name}`);
      return load(resolved, extra, localCache);
    }
    return nativeRequire(name);
  }
  vm.runInThisContext(`(function(require,module,exports){${compiled}\n})`, { filename: absolute })(mockRequire, loaded, loaded.exports);
  return loaded.exports;
}
const view = load('src/lib/orders/customerOrderPresentation.ts');
const { getShipmentTrackingUrl } = load('src/lib/orders/shipmentTracking.ts');
const { CustomerOrderCard } = load('src/app/components/subculture/CustomerOrderCard.tsx');
const { CustomerOrderNotifications } = load('src/app/components/subculture/BankTransferInstructions.tsx');
const { CustomerOrderListState } = load('src/app/components/subculture/CustomerOrderListState.tsx');
const fixture = {
  id: 'fixture-order', orderCode: 'FIXTURE-1', guestOrderNumber: '', paymentMethod: 'bank_transfer', paymentStatus: 'pending_transfer', currency: 'KRW', amountTotal: 128000,
  customerAddress: 'Synthetic address', shippingStatus: 'preparing', shippingCompany: '우체국', trackingNumber: '', shippingNote: '', shippedAt: null, deliveredAt: null,
  createdAt: '2026-01-01T00:00:00Z', bankAccount: { bankName: 'TEST BANK', accountNumber: '000-000', accountHolder: 'FIXTURE' },
  items: [{ id: 'sample-jacket', name: 'Archive sample jacket', selectedSize: 'M', quantity: 1, unitPrice: 98000, lineTotal: 98000, image: '/sample-jacket.svg' },
    { id: 'sample-object', name: 'Studio sample object', selectedSize: null, quantity: 2, unitPrice: 15000, lineTotal: 30000, image: '' }],
};
const render = (Component, props) => renderToStaticMarkup(React.createElement(Component, props));

test('actual customer card renders snapshot names, option, image, each quantity and total', () => {
  const markup = render(CustomerOrderCard, { order: fixture });
  assert.match(markup, /Archive sample jacket/);
  assert.match(markup, /Studio sample object/);
  assert.match(markup, /sample-jacket.svg/);
  assert.match(markup, /옵션 M/);
  assert.match(markup, /수량 1개/);
  assert.match(markup, /수량 2개/);
  assert.match(markup, /총 3개/);
  assert.match(markup, /128,000원/);
  assert.match(markup, /aria-expanded="false"/);
  assert.match(markup, /hidden=""/);
});

test('a saved delivery note is visible on first render without claiming shipment', () => {
  const markup = render(CustomerOrderCard, { order: {
    ...fixture, paymentStatus: 'transfer_confirmed',
    shippingNote: '우체국 방문접수 신청 완료 · 수거 대기',
  } });
  assert.match(markup, /aria-expanded="true"/);
  assert.doesNotMatch(markup, /hidden=""/);
  assert.match(markup, /우체국 방문접수 신청 완료 · 수거 대기/);
  assert.match(markup, /배송 준비중/);
  assert.doesNotMatch(markup, /상품이 발송되었습니다|배송 조회/);
  const blankNote = render(CustomerOrderCard, { order: { ...fixture, shippingNote: '   ' } });
  assert.match(blankNote, /aria-expanded="false"/);
});

test('pending payment takes precedence over stale shipping fields and confirmed payment removes remittance instructions', () => {
  const pending = render(CustomerOrderCard, { order: { ...fixture, shippingStatus: 'delivered', trackingNumber: '0000000000000' } });
  assert.match(pending, /입금 확인 후 준비/);
  assert.match(pending, /아직 입금 대기 상태/);
  assert.doesNotMatch(pending, /주문하신 상품의 배송이 완료|배송 조회|stepDone/);
  const confirmed = render(CustomerOrderCard, { order: { ...fixture, paymentStatus: 'transfer_confirmed' } });
  assert.match(confirmed, /배송 준비중/);
  assert.match(confirmed, /입금 확인/);
  assert.doesNotMatch(confirmed, /무통장입금 안내|직접 송금|TEST BANK|000-000/);
});

test('method-mismatched and uncertain payment states never display paid or shipped progress', () => {
  for (const [paymentMethod, paymentStatus] of [['bank_transfer', 'paid'], ['paypal', 'paid'], ['nicepay', 'captured'], ['nicepay', 'completed'], ['bank_transfer', 'approval_processing'], ['unknown', 'paid']]) {
    const progress = view.getCustomerOrderProgress({ paymentMethod, paymentStatus, shippingStatus: 'shipping' });
    assert.equal(progress.paid, false);
    assert.equal(progress.step, 0);
    assert.equal(view.getCustomerPaymentLabel({ paymentMethod, paymentStatus, shippingStatus: 'shipping' }), '결제 확인중');
  }
  assert.equal(view.getCustomerOrderProgress({ paymentMethod: 'bank_transfer', paymentStatus: 'transfer_confirmed', shippingStatus: 'mystery' }).label, '배송 상태 확인중');
  for (const [paymentMethod, paymentStatus] of [['bank_transfer', 'transfer_confirmed'], ['paypal', 'captured'], ['paypal', 'completed'], ['nicepay', 'paid']]) {
    assert.equal(view.getCustomerOrderProgress({ paymentMethod, paymentStatus, shippingStatus: 'shipping' }).step, 2);
  }
});

test('shipping links use verified carrier-owned patterns and unknown/malformed inputs have copy fallback', () => {
  assert.equal(getShipmentTrackingUrl('우체국택배', '0000-0000-0000-0'), 'https://service.epost.go.kr/trace.RetrieveDomRigiTraceList.comm?sid1=0000000000000');
  assert.equal(getShipmentTrackingUrl('CJ 대한통운', '000000000000'), 'https://trace.cjlogistics.com/next/tracking.html?wblNo=000000000000');
  assert.match(getShipmentTrackingUrl('한진택배', '000000000000'), /^https:\/\/www.hanjin.com\/kor\/CMS\/DeliveryMgr\/WaybillResult.do\?mCode=MN038&schLang=KR&wblnum=000000000000&wblnumText=$/);
  for (const carrier of ['롯데', '로젠', 'Unknown', '우체국 evil']) assert.equal(getShipmentTrackingUrl(carrier, '000000000000'), null);
  for (const tracking of ['javascript:alert(1)', '00000000&token=secret', '', '123']) assert.equal(getShipmentTrackingUrl('우체국', tracking), null);
  const markup = render(CustomerOrderCard, { order: { ...fixture, paymentStatus: 'transfer_confirmed', shippingStatus: 'shipping', shippingCompany: 'Unknown', trackingNumber: '000000000000' } });
  assert.match(markup, /운송장번호 복사/);
  assert.match(markup, /택배사 홈페이지/);
  assert.doesNotMatch(markup, /href="https:\/\/(?:service.epost|trace.cjlogistics|www.hanjin)/);
});

test('customer notifications distinguish waiting, provider acceptance, delivered and failure', () => {
  const cases = { queued: '발송 대기', claimed: '발송 처리중', submitted: '발송 요청 완료', sent: '발송 완료 · 수신 확인 전', delivered: '전달 확인', failed: '발송 실패', unknown: '발송 결과 확인중', not_configured: '발송되지 않음' };
  for (const [status, label] of Object.entries(cases)) {
    const markup = render(CustomerOrderNotifications, { notifications: { customerSms: { status, event: 'shipping_started' }, adminEmail: { status: 'sent' } } });
    assert.ok(markup.includes(label));
    assert.match(markup, /배송 안내 문자/);
    assert.doesNotMatch(markup, /이메일/);
  }
  assert.equal(render(CustomerOrderNotifications, { notifications: {} }), '');
  assert.equal(view.getCustomerNotificationEventLabel('order_received'), '입금 안내');
  assert.equal(view.getCustomerNotificationEventLabel('delivered'), '배송 완료 안내');
});

test('cancelled and refund-pending orders never animate a completed shipping flow', () => {
  for (const paymentStatus of ['cancelled', 'refund_pending', 'cancel_processing', 'partialcancelled']) {
    const markup = render(CustomerOrderCard, { order: { ...fixture, paymentStatus, shippingStatus: 'delivered' } });
    assert.doesNotMatch(markup, /aria-label="주문 진행 단계"|직접 송금/);
  }
});

test('real shared list states communicate loading, error retry and empty separately', () => {
  const loading = render(CustomerOrderListState, { state: 'loading' });
  assert.match(loading, /role="status" aria-busy="true"/);
  assert.match(loading, /잠시만 기다려/);
  const error = render(CustomerOrderListState, { state: 'error', onRetry() {} });
  assert.match(error, /role="alert"/);
  assert.match(error, /다시 시도/);
  assert.doesNotMatch(error, /아직 주문 내역이 없습니다/);
  assert.match(render(CustomerOrderListState, { state: 'empty' }), /아직 주문 내역이 없습니다/);
});

test('fixture page and images are blocked before loading fixture client outside development', async () => {
  const oldEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    let notFoundCalls = 0;
    const { default: Page } = load('src/app/dev/order-preview/page.tsx', { 'next/navigation': { notFound() { notFoundCalls += 1; throw new Error('EXPECTED_404'); } } });
    await assert.rejects(Page(), /EXPECTED_404/);
    assert.equal(notFoundCalls, 1);
    const { GET } = load('src/app/dev/order-preview/fixture-image.svg/route.ts');
    const response = GET(new Request('https://example.invalid/dev/order-preview/fixture-image.svg'));
    assert.equal(response.status, 404);
  } finally { process.env.NODE_ENV = oldEnv; }
});

test('actual reduced-motion branch disables initial movement, duration and stagger', () => {
  for (const reduced of [true, false]) {
    const calls = [];
    const motion = new Proxy({}, { get: (_, tag) => function Motion({ children, initial, animate, exit, transition, ...props }) {
      calls.push({ tag, initial, animate, exit, transition });
      return React.createElement(tag, props, children);
    } });
    const { CustomerOrderCard: Card } = load('src/app/components/subculture/CustomerOrderCard.tsx', {
      'motion/react': { motion, useReducedMotion: () => reduced, AnimatePresence: ({ children }) => React.createElement(React.Fragment, null, children) },
    }, new Map());
    render(Card, { order: { ...fixture, paymentStatus: 'transfer_confirmed' }, index: 3 });
    assert.ok(calls.some(call => call.tag === 'article'));
    for (const call of calls) {
      assert.ok(Number.isFinite(call.transition.duration));
      assert.equal(call.transition.duration, reduced ? 0 : 0.45);
      assert.equal(call.transition.repeat, undefined);
      if (Object.hasOwn(call.transition, 'delay')) assert.equal(call.transition.delay, reduced ? 0 : 0.165);
      if (reduced && call.initial !== undefined) assert.equal(call.initial, false);
    }
    if (!reduced) {
      const article = calls.find(call => call.tag === 'article');
      assert.deepEqual(article.initial, { opacity: 0, y: 12 });
      assert.deepEqual(article.animate, { opacity: 1, y: 0 });
    }
  }
  const css = fs.readFileSync(path.join(root, 'src/app/components/subculture/CustomerOrderCard.module.css'), 'utf8');
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
});

test('order surfaces inherit existing palette and its text pairs meet WCAG AA contrast', () => {
  const theme = fs.readFileSync(path.join(root, 'src/styles/theme.css'), 'utf8');
  const tokens = Object.fromEntries([...theme.matchAll(/(--[\w-]+):\s*(#[a-f\d]{6});/gi)].map(match => [match[1], match[2]]));
  const luminance = hex => {
    const rgb = [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16) / 255)
      .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
    return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
  };
  const contrast = (first, second) => {
    const values = [luminance(tokens[first]), luminance(tokens[second])].sort((a, b) => b - a);
    return (values[0] + 0.05) / (values[1] + 0.05);
  };
  for (const [foreground, background] of [['--foreground', '--card'], ['--muted-foreground', '--card'], ['--muted-foreground', '--muted'], ['--primary', '--card'], ['--primary-foreground', '--primary']]) {
    assert.ok(contrast(foreground, background) >= 4.5, `${foreground} on ${background} must retain AA text contrast`);
  }
  for (const file of ['CustomerOrderCard.module.css', 'BankTransferInstructions.module.css', 'CustomerOrderListState.module.css']) {
    const css = fs.readFileSync(path.join(root, 'src/app/components/subculture', file), 'utf8');
    assert.doesNotMatch(css, /#[a-f\d]{3,8}\b/i, `${file} must not introduce an independent palette`);
    assert.match(css, /var\(--mypage-/);
  }
  assert.doesNotMatch(fs.readFileSync(path.join(root, 'src/app/dev/order-preview/OrderPreview.module.css'), 'utf8'), /#[a-f\d]{3,8}\b/i);
});


test('Kakao acceptance is visibly labeled Kakao and is never presented as handset delivery', () => {
  const markup = render(CustomerOrderNotifications, { notifications: { customerKakao: { status: 'sent', event: 'order_received' } } });
  assert.match(markup, /카카오톡/);
  assert.doesNotMatch(markup, /수신 완료|문자:/);
});
