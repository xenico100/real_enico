/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const source = fs.readFileSync('src/app/components/subculture/CartOverlay.tsx', 'utf8');
const start = source.indexOf('  const submitBankTransferOrder = async');
const end = source.indexOf('  const buildOrderItemsPayload = ', start);
function compile(text) {
  return ts.transpileModule(text, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
}
function harness(respond) {
  const persisted = new Map();
  const sessionStorage = { getItem: key => persisted.get(key) || null, setItem: (key, value) => persisted.set(key, value), removeItem: key => persisted.delete(key) };
  const helper = { exports: {} };
  vm.runInNewContext(compile(fs.readFileSync('src/lib/orders/bankCheckoutAttempt.ts', 'utf8')), { exports: helper.exports, module: helper });
  const receipts = { exports: {} };
  vm.runInNewContext(compile(fs.readFileSync('src/lib/orders/bankReceipt.ts', 'utf8')), { exports: receipts.exports, module: receipts });
  const requests = [];
  const context = {
    ...helper.exports, ...receipts.exports,
    bankSubmissionInFlight: false, pendingBankRequestInMemory: null, providerInteraction: null, removeFromCart: () => {},
    pendingPayPalApprovalRef: { current: null },
    checkoutName: 'Original person', checkoutAddress: 'Original address', checkoutPhone: '01012345678', checkoutEmail: 'guest@example.com', checkoutCountry: '대한민국',
    guestLookupPassword: 'private-password', isAuthenticated: false, user: null, session: null,
    cart: [{ id: 'product-1', name: 'Original product', price: 10000, quantity: 1 }], subtotal: 10000, shipping: 3000, tax: 0, total: 13000,
    guestPasswordInputRef: { current: null }, validateCheckoutFields: () => true,
    announceCheckoutError: () => {}, setCheckoutMessage: () => {}, setCheckoutError: () => {}, setIsSubmittingOrder: () => {}, trackStorefrontEvent: () => {}, setPendingBankAttempt: () => {},
    syncCheckoutDetailsToAccount: () => {}, setBankOrderReceipt: () => {}, setIsRestoredBankReceipt: () => {}, clearCart: () => {}, setMode: () => {},
    setCheckoutName: () => {}, setCheckoutAddress: () => {}, setCheckoutPhone: () => {}, setGuestLookupPassword: () => {}, setTransactionId: () => {}, generateTransactionId: () => 'new-id',
    crypto: { randomUUID: () => 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }, window: { sessionStorage },
    fetch: async (_url, args) => { requests.push(args); return respond(args); },
    console, Response,
  };
  vm.createContext(context);
  vm.runInContext(compile(source.slice(start, end) + '\nglobalThis.submit = submitBankTransferOrder;'), context);
  return { context, requests, persisted, storage: sessionStorage, submit: channel => context.submit(channel) };
}
test('uncertain retry after close-like form changes reuses exact original request, no persisted credentials', async () => {
  const h = harness(async () => { throw new Error('response lost'); });
  await h.submit('guest');
  h.context.checkoutName = 'Different person';
  h.context.guestLookupPassword = '';
  h.context.cart = [];
  await h.submit('guest');
  assert.equal(h.requests.length, 2);
  assert.equal(h.requests[0].body, h.requests[1].body);
  const saved = [...h.persisted.values()].join('');
  for (const secret of ['Original person', 'Original address', 'private-password', 'guest@example.com', '01012345678']) assert.ok(!saved.includes(secret));
});
test('bank synchronous guard blocks duplicate click while response is pending', async () => {
  let finish;
  const h = harness(() => new Promise(resolve => { finish = resolve; }));
  const first = h.submit('guest');
  await h.submit('guest');
  assert.equal(h.requests.length, 1);
  finish(Response.json({ message: 'try again' }, { status: 503 }));
  await first;
  assert.equal(h.context.bankSubmissionInFlight, false);
});
test('new-page reconstruction with session ID preserves the original transaction ID', async () => {
  const h = harness(async () => { throw new Error('lost'); });
  await h.submit('guest');
  const first = JSON.parse(h.requests[0].body);
  h.context.pendingBankRequestInMemory = null;
  await h.submit('guest');
  assert.equal(JSON.parse(h.requests[1].body).transactionId, first.transactionId);
});
test('first definitive validation rejection clears ID, but rejection after uncertainty cannot clear it', async () => {
  let status = 400;
  const h = harness(async () => Response.json({ message: 'invalid' }, { status }));
  await h.submit('guest');
  assert.equal(h.context.readBankCheckoutAttempt(h.storage), null);
  status = 503;
  await h.submit('guest');
  const pending = h.context.readBankCheckoutAttempt(h.storage).transactionId;
  status = 401;
  await h.submit('guest');
  assert.equal(h.context.readBankCheckoutAttempt(h.storage).transactionId, pending);
});
test('pending PayPal approval prevents bank API submission', async () => {
  const h = harness(async () => { throw new Error('must not submit'); });
  h.context.pendingPayPalApprovalRef.current = { orderId: 'PAYPAL-1' };
  await h.submit('guest');
  assert.equal(h.requests.length, 0);
});
test('PayPal or NICE payment window in progress blocks a new bank submission', async () => {
  for (const provider of ['paypal', 'nicepay']) {
    const h = harness(async () => { throw new Error('must not submit'); });
    h.context.providerInteraction = provider;
    await h.submit('guest');
    assert.equal(h.requests.length, 0);
  }
});
test('reconstructed guest retry stays guest after login rather than changing the order channel', async () => {
  const h = harness(async () => { throw new Error('lost'); });
  await h.submit('guest');
  h.context.pendingBankRequestInMemory = null;
  h.context.isAuthenticated = true;
  h.context.user = { id: 'member-1', email: 'member@example.com' };
  h.context.session = { access_token: 'private-token' };
  await h.submit('member');
  const retry = JSON.parse(h.requests[1].body);
  assert.equal(retry.channel, 'guest');
  assert.equal(h.requests[1].headers.Authorization, undefined);
});
test('successful frozen retry removes only submitted items, not items added while waiting', async () => {
  let success = false;
  const h = harness(async args => {
    if (!success) throw new Error('lost');
    const submitted = JSON.parse(args.body);
    return Response.json({ orderCode: submitted.transactionId, guestOrderNumber: 'GUEST-1', bankAccount: { bankName: 'Bank', accountNumber: '111', accountHolder: 'Test' }, pricing: { total: 13000 }, items: submitted.items.map(item => ({ ...item, lineTotal: item.price || 10000 })) });
  });
  await h.submit('guest');
  h.context.cart.push({ id: 'later-product', name: 'Later', price: 20000 });
  const removed = [];
  h.context.removeFromCart = id => removed.push(id);
  success = true;
  await h.submit('guest');
  assert.deepEqual(removed, ['product-1']);
  assert.equal(h.context.readBankCheckoutAttempt(h.storage), null);
});
test('explicit safe-restart 409 unlocks first rejection but cannot discard an earlier uncertain attempt', async () => {
  let uncertain = false;
  const h = harness(async () => uncertain
    ? Response.json({ message: 'uncertain' }, { status: 503 })
    : Response.json({ code: 'ORDER_NOT_CREATED', safeToRestart: true, message: 'sold out' }, { status: 409 }));
  await h.submit('guest');
  assert.equal(h.context.readBankCheckoutAttempt(h.storage), null);
  uncertain = true;
  await h.submit('guest');
  const originalId = h.context.readBankCheckoutAttempt(h.storage).transactionId;
  uncertain = false;
  await h.submit('guest');
  assert.equal(h.context.readBankCheckoutAttempt(h.storage).transactionId, originalId);
});
