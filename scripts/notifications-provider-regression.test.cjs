/* eslint-disable @typescript-eslint/no-require-imports -- Node's isolated CommonJS test runner. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const ts = require('typescript');

// All provider responses are in-memory fixtures. No test can send a real email
// or SMS, even when developer/CI environments have production credentials.
const source = ts.transpileModule(fs.readFileSync(path.resolve('src/lib/orders/notificationProviders.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function load(env = {}, fetchImpl = async () => { throw new Error('Unexpected provider call'); }) {
  const mod = { exports: {} };
  vm.runInNewContext(`(function(require,module,exports,process,fetch,Buffer,AbortSignal){${source}\n})`, {}, {
    filename: 'notificationProviders.ts',
  })(name => {
    if (name === 'server-only') return {};
    assert.equal(name, 'node:crypto');
    return crypto;
  }, mod, mod.exports, { env }, fetchImpl, Buffer, AbortSignal);
  return mod.exports;
}

function fixture(overrides = {}) {
  return {
    channel: 'customerEmail', eventKey: 'order-1/bank_received', to: 'customer@example.com',
    subject: 'ENICO VECK 입금 안내', text: '주문번호 ORDER-1\n입금액 123,000원',
    ...overrides,
  };
}

function json(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

const emailEnv = {
  RESEND_API_KEY: 'test-resend-private-key', ORDER_FROM_EMAIL: 'ENICO VECK <orders@mongsangin.life>',
};
const smsEnv = {
  SOLAPI_API_KEY: 'test-solapi-api-key', SOLAPI_API_SECRET: 'test-solapi-secret',
  SMS_SENDER_PHONE: '010-9876-5432', ADMIN_NOTIFICATION_PHONE: '+82 10-4567-8901',
};

test('health exposes readiness and masked phones, never credentials', () => {
  const unconfigured = load().getNotificationConfigHealth();
  assert.equal(unconfigured.adminEmail, false);
  assert.equal(unconfigured.customerEmail, false);
  assert.equal(unconfigured.customerSms, false);
  assert.equal(unconfigured.adminSms, false);
  const health = load({ ...emailEnv, ...smsEnv }).getNotificationConfigHealth();
  assert.equal(health.adminEmail, true);
  assert.equal(health.customerEmail, true);
  assert.equal(health.customerSms, true);
  assert.equal(health.adminSms, true);
  assert.equal(health.adminPhone, '010-****-8901');
  assert.equal(health.senderPhone, '010-****-5432');
  assert.equal(health.smsProvider, 'solapi');
  const output = JSON.stringify(health);
  for (const sensitive of Object.values({ ...emailEnv, ...smsEnv })) assert.ok(!output.includes(sensitive));
});

test('onboarding sender never sends to a customer, while administrator mail remains available', async () => {
  let calls = 0;
  const provider = load({ RESEND_API_KEY: 'test-only' }, async () => { calls += 1; return json({ id: 'email-1' }); });
  const health = provider.getNotificationConfigHealth();
  assert.equal(health.adminEmail, true);
  assert.equal(health.customerEmail, false);
  assert.equal(health.customerEmailRequiresVerifiedSender, true);
  const blocked = await provider.sendOrderNotificationMessage(fixture());
  assert.equal(blocked.status, 'not_configured');
  assert.equal(calls, 0);
  const accepted = await provider.sendOrderNotificationMessage(fixture({ channel: 'adminEmail', to: 'morba9850@gmail.com' }));
  assert.equal(accepted.status, 'sent');
  assert.equal(calls, 1);
});

test('missing provider credentials or malformed sender never trigger network requests', async () => {
  let calls = 0;
  const neverSend = async () => { calls += 1; return json({ id: 'must-not-send' }); };
  for (const env of [{}, { ...emailEnv, ORDER_FROM_EMAIL: 'ENICO <orders@example.com>\nBcc: x@example.com' }]) {
    assert.equal((await load(env, neverSend).sendOrderNotificationMessage(fixture())).status, 'not_configured');
  }
  assert.equal((await load({ ...smsEnv, SOLAPI_API_SECRET: '' }, neverSend)
    .sendOrderNotificationMessage(fixture({ channel: 'customerSms', to: '01012345678' }))).status, 'not_configured');
  assert.equal(calls, 0);
});

test('Resend preserves the exact content and stable channel-scoped idempotency keys', async () => {
  const calls = [];
  const provider = load(emailEnv, async (url, options) => { calls.push({ url, options }); return json({ id: 'email-123' }); });
  const message = fixture({ replyTo: 'morba9850@gmail.com', text: '계좌: 123-456\n상품: <BLUEPRINT> & \\ test' });
  const result = await provider.sendOrderNotificationMessage(message);
  await provider.sendOrderNotificationMessage(message);
  await provider.sendOrderNotificationMessage({ ...message, channel: 'adminEmail' });
  assert.equal(result.status, 'sent');
  assert.equal(result.providerId, 'email-123');
  assert.equal(calls[0].url, 'https://api.resend.com/emails');
  assert.equal(calls[0].options.redirect, 'error');
  assert.equal(calls[0].options.headers['Idempotency-Key'], calls[1].options.headers['Idempotency-Key']);
  assert.notEqual(calls[0].options.headers['Idempotency-Key'], calls[2].options.headers['Idempotency-Key']);
  const body = JSON.parse(calls[0].options.body);
  assert.equal(body.text, message.text);
  assert.equal(body.subject, message.subject);
  assert.equal(body.reply_to, message.replyTo);
  assert.deepEqual(body.to, [message.to]);
});

test('long or non-ASCII email event keys produce bounded deterministic headers', async () => {
  const headers = [];
  const provider = load(emailEnv, async (_url, options) => { headers.push(options.headers['Idempotency-Key']); return json({ id: 'email-1' }); });
  for (const eventKey of ['A'.repeat(1_000), '주문/접수\n헤더']) {
    await provider.sendOrderNotificationMessage(fixture({ eventKey }));
    await provider.sendOrderNotificationMessage(fixture({ eventKey }));
    assert.ok(headers.at(-1).length <= 256);
    assert.match(headers.at(-1), /^[\x21-\x7e]+$/);
    assert.equal(headers.at(-1), headers.at(-2));
  }
});

test('provider network failure and malformed success remain unknown without adapter retries', async () => {
  for (const channel of ['customerEmail', 'customerSms']) {
    let calls = 0;
    const provider = load({ ...emailEnv, ...smsEnv }, async () => { calls += 1; throw new Error('timeout with private data'); });
    const result = await provider.sendOrderNotificationMessage(fixture({ channel, to: channel === 'customerSms' ? '01012345678' : 'customer@example.com' }));
    assert.equal(result.status, 'unknown');
    assert.equal(calls, 1);
    assert.ok(!JSON.stringify(result).includes('private data'));
  }
  const malformed = await load(emailEnv, async () => json({}))
    .sendOrderNotificationMessage(fixture());
  assert.equal(malformed.status, 'unknown');
});

test('explicit email rejection differs from ambiguous server errors and concurrent idempotency', async () => {
  for (const [response, status] of [[json({}, 422), 'failed'], [json({}, 503), 'unknown'],
    [json({ name: 'concurrent_idempotent_requests' }, 409), 'unknown'],
    [json({ name: 'invalid_idempotent_request' }, 409), 'failed']]) {
    assert.equal((await load(emailEnv, async () => response).sendOrderNotificationMessage(fixture())).status, status);
  }
});

test('SOLAPI requests use normalized mobile numbers, LMS and a verifiable fresh HMAC', async () => {
  const calls = [];
  const provider = load(smsEnv, async (url, options) => {
    calls.push({ url, options });
    return json({ failedMessageList: [], messageList: [{ messageId: 'M4_TEST', statusCode: '2000' }], groupInfo: { groupId: 'G4_TEST' } });
  });
  for (const to of ['+82 10-1234-5678', '82 (0)10-1234-5678', '01012345678']) {
    const result = await provider.sendOrderNotificationMessage(fixture({ channel: 'customerSms', to }));
    assert.equal(result.status, 'sent');
    assert.equal(result.providerId, 'M4_TEST');
  }
  for (const { url, options } of calls) {
    assert.equal(url, 'https://api.solapi.com/messages/v4/send-many/detail');
    assert.equal(options.redirect, 'error');
    const auth = options.headers.Authorization.match(/^HMAC-SHA256 apiKey=(.+), date=(.+), salt=(.+), signature=(.+)$/);
    assert.ok(auth);
    assert.equal(auth[1], smsEnv.SOLAPI_API_KEY);
    assert.equal(auth[4], crypto.createHmac('sha256', smsEnv.SOLAPI_API_SECRET).update(auth[2] + auth[3]).digest('hex'));
    const body = JSON.parse(options.body);
    assert.equal(body.messages[0].to, '01012345678');
    assert.equal(body.messages[0].from, '01098765432');
    assert.equal(body.messages[0].type, 'LMS');
    assert.equal(body.allowDuplicates, false);
    assert.equal(body.strict, true);
    assert.equal(body.showMessageList, true);
    assert.ok(!options.body.includes(smsEnv.SOLAPI_API_SECRET));
  }
  assert.notEqual(calls[0].options.headers.Authorization, calls[1].options.headers.Authorization);
});

test('multiple, malformed or foreign SMS recipients are never silently coerced', async () => {
  let calls = 0;
  const provider = load(smsEnv, async () => { calls += 1; return json({}); });
  for (const to of ['01012345678,01099998888', 'call 01012345678', '0101234567', '+1 212 555 1234', '+82+1012345678', '0212345678']) {
    const result = await provider.sendOrderNotificationMessage(fixture({ channel: 'customerSms', to }));
    assert.equal(result.status, 'skipped', to);
    assert.equal(result.errorCode, 'INVALID_RECIPIENT_PHONE');
  }
  assert.equal(calls, 0);
});

test('SOLAPI HTTP 200 with rejected registration is failed, not sent', async () => {
  const result = await load(smsEnv, async () => json({
    failedMessageList: [{ statusCode: '3040', statusMessage: 'unregistered sender with sensitive contents' }],
    groupInfo: { groupId: 'G4_REJECTED', count: { registeredSuccess: 0, registeredFailed: 1 } },
  })).sendOrderNotificationMessage(fixture({ channel: 'customerSms', to: '01012345678' }));
  assert.equal(result.status, 'failed');
  assert.equal(result.errorCode, 'SOLAPI_REGISTRATION_REJECTED_3040');
  assert.ok(!JSON.stringify(result).includes('sensitive contents'));
});

test('SOLAPI delivery failure is not hidden by a successful registration count', async () => {
  const result = await load(smsEnv, async () => json({
    failedMessageList: [], messageList: [{ messageId: 'M4_FAILED', statusCode: '4001' }],
    groupInfo: { groupId: 'G4_TEST', count: { registeredSuccess: 1, registeredFailed: 0 } },
  })).sendOrderNotificationMessage(fixture({ channel: 'customerSms', to: '01012345678' }));
  assert.equal(result.status, 'failed');
});

test('SOLAPI missing acceptance evidence and server failures remain unknown', async () => {
  for (const response of [json({ failedMessageList: [], groupInfo: { groupId: 'G4_UNKNOWN' } }), json({}, 502), json({})]) {
    const result = await load(smsEnv, async () => response)
      .sendOrderNotificationMessage(fixture({ channel: 'customerSms', to: '01012345678' }));
    assert.equal(result.status, 'unknown');
  }
});

test('no configured owner phone never sends an administrator SMS to an arbitrary fallback', async () => {
  let calls = 0;
  const result = await load({ ...smsEnv, ADMIN_NOTIFICATION_PHONE: '' }, async () => { calls += 1; return json({}); })
    .sendOrderNotificationMessage(fixture({ channel: 'adminSms', to: '01012345678' }));
  assert.equal(result.status, 'not_configured');
  assert.equal(calls, 0);
});

test('invalid content, recipient headers and empty event keys fail before provider calls', async () => {
  let calls = 0;
  const provider = load({ ...emailEnv, ...smsEnv }, async () => { calls += 1; return json({}); });
  for (const overrides of [{ eventKey: '' }, { text: '' }, { subject: 'order\nBcc: other@example.com' },
    { replyTo: 'owner@example.com\nBcc: other@example.com' }, { channel: 'customerSms', to: '01012345678', text: '가'.repeat(1_000) },
    { channel: 'customerSms', to: '01012345678', text: '입금 안내 😀' }]) {
    const result = await provider.sendOrderNotificationMessage(fixture(overrides));
    assert.equal(result.status, 'failed');
  }
  assert.equal((await provider.sendOrderNotificationMessage(fixture({ to: 'customer@example.com,attacker@example.com' }))).status, 'skipped');
  assert.equal(calls, 0);
});


const kakaoEnv = {
  SOLAPI_API_KEY: 'test-kakao-key', SOLAPI_API_SECRET: 'test-kakao-secret', SOLAPI_KAKAO_PF_ID: 'test-profile',
  SOLAPI_KAKAO_ORDER_RECEIVED_TEMPLATE_ID: 'test-order-template', SOLAPI_KAKAO_PAYMENT_CONFIRMED_TEMPLATE_ID: 'test-paid-template',
  SOLAPI_KAKAO_SHIPPING_STARTED_TEMPLATE_ID: 'test-shipping-template', ORDER_CUSTOMER_MESSAGE_CHANNEL: 'alimtalk',
};
function kakaoFixture(event = 'order_received') {
  return fixture({ channel: 'customerKakao', to: '+82 10-1234-5678',
    alimtalk: { event, variables: { '#{고객명}': '테스트', '#{주문번호}': 'TEST-ORDER' } } });
}

test('Kakao requests are signed ATA with exact template/variables and SMS replacement explicitly disabled', async () => {
  const calls = [];
  const subject = load(kakaoEnv, async (url, options) => { calls.push({ url, options });
    return json({ failedMessageList: [], messageList: [{ messageId: 'kakao-1', statusCode: '2000' }] }); });
  const health = subject.getNotificationConfigHealth();
  assert.equal(health.customerKakao, true);
  assert.equal(health.customerMessageChannel, 'alimtalk');
  assert.equal(health.customerSms, false, 'Kakao needs no registered SMS sender');
  const result = await subject.sendOrderNotificationMessage(kakaoFixture());
  assert.equal(result.status, 'sent');
  assert.equal(result.provider, 'solapi_alimtalk');
  const { options } = calls[0];
  const body = JSON.parse(options.body);
  assert.equal(body.messages.length, 1);
  const message = body.messages[0];
  assert.equal(message.type, 'ATA');
  assert.equal(message.to, '01012345678');
  assert.equal(message.from, undefined);
  assert.equal(message.kakaoOptions.disableSms, true);
  assert.equal(message.kakaoOptions.pfId, kakaoEnv.SOLAPI_KAKAO_PF_ID);
  assert.equal(message.kakaoOptions.templateId, kakaoEnv.SOLAPI_KAKAO_ORDER_RECEIVED_TEMPLATE_ID);
  assert.deepEqual(message.kakaoOptions.variables, kakaoFixture().alimtalk.variables);
  const auth = options.headers.Authorization.match(/^HMAC-SHA256 apiKey=([^,]+), date=([^,]+), salt=([^,]+), signature=(.+)$/);
  assert.equal(auth[4], crypto.createHmac('sha256', kakaoEnv.SOLAPI_API_SECRET).update(auth[2] + auth[3]).digest('hex'));
  assert.ok(!options.body.includes(kakaoEnv.SOLAPI_API_SECRET));
  assert.equal(body.strict, true);
  assert.equal(body.allowDuplicates, false);
});

test('each event selects its own template and missing approved templates never reuse a paid template', async () => {
  for (const [event, id] of [['order_received', 'test-order-template'], ['payment_confirmed', 'test-paid-template'], ['shipping_started', 'test-shipping-template']]) {
    const subject = load(kakaoEnv, async (_url, options) => {
      assert.equal(JSON.parse(options.body).messages[0].kakaoOptions.templateId, id);
      return json({ failedMessageList: [], messageList: [{ messageId: 'accepted', statusCode: '2000' }] });
    });
    assert.equal((await subject.sendOrderNotificationMessage(kakaoFixture(event))).status, 'sent');
  }
  const subject = load({ ...kakaoEnv, SOLAPI_KAKAO_ORDER_RECEIVED_TEMPLATE_ID: '' });
  assert.equal((await subject.sendOrderNotificationMessage(kakaoFixture())).status, 'not_configured');
});

test('Kakao timeout and 5xx are ambiguous and perform one attempt; rejected registration is a failure', async () => {
  for (const response of [null, json({}, 503), json({ failedMessageList: [{ statusCode: '1042' }] })]) {
    let calls = 0;
    const result = await load(kakaoEnv, async () => { calls++; if (!response) throw new Error('private network detail'); return response; })
      .sendOrderNotificationMessage(kakaoFixture());
    assert.equal(calls, 1);
    assert.equal(result.status, response && response.status === 200 ? 'failed' : 'unknown');
    assert.ok(!JSON.stringify(result).includes('private network detail'));
  }
});

test('invalid recipient, empty variables and oversized Kakao copy never reach the provider', async () => {
  const subject = load(kakaoEnv);
  for (const message of [
    { ...kakaoFixture(), to: 'invalid phone' },
    { ...kakaoFixture(), text: '가'.repeat(1001) },
    { ...kakaoFixture(), alimtalk: { event: 'order_received', variables: { '#{고객명}': '' } } },
  ]) assert.ok(['failed', 'skipped'].includes((await subject.sendOrderNotificationMessage(message)).status));
});
