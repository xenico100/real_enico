/* eslint-disable @typescript-eslint/no-require-imports -- Isolated, network-free TypeScript regression runner. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

// Execute the same helpers used by the browser and API. No database, network,
// browser identity or production configuration is used in these fixtures.
const file = path.resolve('src/lib/analytics/visitSource.ts');
const compiled = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const moduleUnderTest = { exports: {} };
vm.runInThisContext(`(function(require,module,exports){${compiled}\n})`, { filename: file })(
  name => { throw new Error(`Unexpected dependency in shared attribution helpers: ${name}`); },
  moduleUnderTest,
  moduleUnderTest.exports,
);
const analytics = moduleUnderTest.exports;
const currentUrl = 'https://enicoveck.com/';
const infer = (referrer = '', url = currentUrl) => analytics.inferVisitAttribution({ currentUrl: url, referrer });

test('search engines are separated from the old other bucket', () => {
  for (const [referrer, source] of [
    ['https://search.naver.com/search.naver?query=fixture', 'naver'],
    ['https://www.google.com/search?q=fixture', 'google'],
    ['https://www.google.co.kr/search?q=fixture', 'google'],
    ['https://search.daum.net/search?q=fixture', 'daum'],
    ['https://www.bing.com/search?q=fixture', 'bing'],
  ]) {
    const result = infer(referrer);
    assert.equal(result.source, source, referrer);
    assert.equal(result.channel, 'organic_search', referrer);
    assert.equal(result.method, 'referrer');
    assert.equal(result.version, 1);
  }
});

test('social networks and messaging referrers retain their own sources', () => {
  for (const [referrer, source, channel] of [
    ['https://l.instagram.com/', 'instagram', 'organic_social'],
    ['https://www.youtube.com/watch?v=fixture', 'youtube', 'organic_social'],
    ['https://youtu.be/fixture', 'youtube', 'organic_social'],
    ['https://www.threads.net/@fixture', 'threads', 'organic_social'],
    ['https://www.threads.com/@fixture', 'threads', 'organic_social'],
    ['https://t.co/fixture', 'twitter', 'organic_social'],
    ['https://x.com/fixture', 'twitter', 'organic_social'],
    ['https://l.facebook.com/', 'facebook', 'organic_social'],
    ['https://vm.tiktok.com/fixture/', 'tiktok', 'organic_social'],
    ['https://l.kakao.com/fixture', 'kakao', 'messaging'],
  ]) {
    const result = infer(referrer);
    assert.equal(result.source, source, referrer);
    assert.equal(result.channel, channel, referrer);
  }
});

test('unlisted external sites remain identifiable by their actual hostname', () => {
  const result = infer('https://creator.example.test/articles/fixture?private_referrer_token=DO_NOT_STORE#private');
  assert.equal(result.channel, 'referral');
  assert.equal(result.method, 'referrer');
  assert.equal(result.source, 'creator.example.test');
  assert.equal(result.referrerHost, 'creator.example.test');
  assert.ok(!JSON.stringify(result).includes('private_referrer_token'));
  assert.ok(!JSON.stringify(result).includes('DO_NOT_STORE'));
  assert.ok(!JSON.stringify(result).includes('/articles/fixture'));
});

test('hostname matching does not treat lookalike domains as real providers', () => {
  for (const host of ['youtube.com.evil.test', 'notinstagram.com', 'google.com.evil.test', 'x.com.evil.test', 'naver.com.evil.test']) {
    const result = infer(`https://${host}/`);
    assert.equal(result.channel, 'referral', host);
    assert.equal(result.source, host, host);
    assert.equal(result.referrerHost, host, host);
  }
});

test('no referrer and internal navigation are labelled directly or unavailable rather than invented sites', () => {
  for (const referrer of ['', 'https://enicoveck.com/', 'https://www.enicoveck.com/catalog?internal=1']) {
    const result = infer(referrer);
    assert.equal(result.source, '(direct)', referrer);
    assert.equal(result.channel, 'direct_or_unknown', referrer);
    assert.equal(result.method, 'direct', referrer);
    assert.equal(result.referrerHost, undefined, referrer);
  }
});

test('campaign tags take precedence over a social referrer and all allowlisted UTM fields survive', () => {
  const result = infer('https://www.youtube.com/', 'https://enicoveck.com/shop/jacket?utm_source=naver&utm_medium=cpc&utm_campaign=autumn&utm_content=video-a&utm_term=fixture&access_token=DO_NOT_STORE#session_secret');
  assert.equal(result.source, 'naver');
  assert.equal(result.channel, 'paid_search');
  assert.equal(result.method, 'utm');
  assert.equal(result.landingPath, '/shop/jacket');
  assert.deepEqual(result.utm, { source: 'naver', medium: 'cpc', campaign: 'autumn', content: 'video-a', term: 'fixture' });
  assert.equal(result.referrerHost, 'youtube.com');
  assert.ok(!JSON.stringify(result).includes('access_token'));
  assert.ok(!JSON.stringify(result).includes('DO_NOT_STORE'));
  assert.ok(!JSON.stringify(result).includes('session_secret'));
});

test('paid social and email campaigns are not reported as unpaid referrals', () => {
  const paid = infer('', 'https://enicoveck.com/?utm_source=instagram&utm_medium=cpc&utm_campaign=launch');
  assert.equal(paid.source, 'instagram');
  assert.equal(paid.channel, 'paid_social');
  const email = infer('', 'https://enicoveck.com/?utm_source=newsletter&utm_medium=email');
  assert.equal(email.source, 'newsletter');
  assert.equal(email.channel, 'email');
});

test('unsafe URL schemes do not become a referrer or leak arbitrary payloads', () => {
  for (const referrer of ['javascript:alert(1)', 'data:text/html,PRIVATE', 'file:///PRIVATE', 'not a url']) {
    const result = infer(referrer);
    assert.equal(result.channel, 'direct_or_unknown', referrer);
    assert.equal(result.referrerHost, undefined, referrer);
    assert.ok(!JSON.stringify(result).includes('PRIVATE'));
  }
});

test('normalization permits only the attribution contract and bounds strings', () => {
  const normalized = analytics.normalizeVisitAttribution({
    ...infer('https://search.naver.com/'),
    landingPath: '/shop?access_token=DO_NOT_STORE#PRIVATE',
    referrerHost: 'https://www.google.com/search?private=DO_NOT_STORE',
    utm: { source: 'x'.repeat(2000), medium: 'social', campaign: 'a'.repeat(2000), content: 'fixture\ncontent', term: 'fixture', secret: 'DO_NOT_STORE' },
    arbitrarySecret: 'DO_NOT_STORE',
    referrer: 'https://private.example.test/?secret=DO_NOT_STORE',
  });
  assert.ok(normalized);
  assert.equal(normalized.landingPath, '/shop');
  assert.ok(normalized.utm.source.length <= 200);
  assert.ok(normalized.utm.campaign.length <= 200);
  assert.ok(!JSON.stringify(normalized).includes('DO_NOT_STORE'));
  assert.ok(!JSON.stringify(normalized).includes('arbitrarySecret'));
  assert.ok(!/[\r\n\u0000]/.test(normalized.utm.content));
  assert.equal(analytics.normalizeVisitAttribution(null), undefined);
  assert.equal(analytics.normalizeVisitAttribution('youtube'), undefined);
});

test('first identified external attribution is preserved across navigation, events and later campaigns', () => {
  const first = infer('https://search.naver.com/', 'https://enicoveck.com/shop/jacket');
  const direct = infer('https://enicoveck.com/shop/jacket');
  const later = infer('', 'https://enicoveck.com/?utm_source=instagram&utm_medium=social');
  assert.deepEqual(analytics.mergeVisitAttribution(first, direct), first);
  assert.deepEqual(analytics.mergeVisitAttribution(first, later), first);
  assert.deepEqual(analytics.mergeVisitAttribution(first, undefined), first);
  assert.deepEqual(analytics.mergeVisitAttribution(direct, first), first);
  assert.deepEqual(analytics.mergeVisitAttribution(undefined, first), first);
});

test('legacy metadata and source counts remain compatible without fabricating attribution', () => {
  assert.equal(analytics.parseVisitMeta('/').attribution, undefined);
  const old = analytics.parseVisitMeta(JSON.stringify({ path: '/', source: 'youtube' }));
  assert.equal(old.source, 'youtube');
  assert.equal(old.attribution, undefined);
  const unknown = analytics.parseVisitMeta(JSON.stringify({ path: '/', source: 'other' }));
  assert.equal(unknown.source, 'other');
  assert.equal(unknown.attribution, undefined);
  assert.equal(analytics.mergeVisitSource('youtube', 'other'), 'youtube');
  assert.equal(analytics.mergeVisitSource('other', 'instagram'), 'instagram');
});

test('metadata round trips preserve attribution and bounded customer interaction events together', () => {
  const attribution = infer('https://search.naver.com/', 'https://enicoveck.com/shop/jacket');
  const event = { type: 'add_to_cart', target: 'fixture-jacket', at: '2026-10-20T08:00:00.000Z' };
  const original = analytics.serializeVisitMeta('/shop/jacket', 'other', [event], attribution);
  const decoded = analytics.parseVisitMeta(original);
  assert.deepEqual(decoded.attribution, attribution);
  assert.deepEqual(decoded.events, [event]);
  assert.equal(decoded.source, 'other');
  const next = analytics.serializeVisitMeta('/checkout', decoded.source,
    analytics.appendVisitEvents(decoded.events, { ...event, type: 'checkout_open', target: 'checkout' }),
    analytics.mergeVisitAttribution(decoded.attribution, infer('https://enicoveck.com/shop/jacket')));
  const updated = analytics.parseVisitMeta(next);
  assert.deepEqual(updated.attribution, attribution);
  assert.equal(updated.events.length, 2);
  assert.equal(updated.events[1].type, 'checkout_open');
  assert.equal(updated.path, '/checkout');
});

test('URL-valued ref, source and utm_source tags store only the hostname without credentials or private URL data', () => {
  const rawUrl = 'https://fixture-user:fixture-pass@creator.example.test/article?private_token=DO_NOT_STORE#PRIVATE_FRAGMENT';
  const forbidden = ['fixture-user', 'fixture-pass', '/article', 'private_token', 'DO_NOT_STORE', 'PRIVATE_FRAGMENT'];
  for (const key of ['ref', 'source', 'utm_source']) {
    const result = infer('', `https://enicoveck.com/?${key}=${encodeURIComponent(rawUrl)}`);
    assert.equal(result.source, 'creator.example.test', key);
    if (key === 'utm_source') assert.equal(result.utm.source, 'creator.example.test');
    const persisted = analytics.serializeVisitMeta('/', 'other', [], result);
    for (const secret of forbidden) assert.ok(!persisted.includes(secret), `${key} leaked ${secret}`);
  }
  // The API normalization boundary must also sanitize older or custom clients
  // which send their URL tag without using the browser inference helper first.
  const normalized = analytics.normalizeVisitAttribution({
    version: 1, source: rawUrl, channel: 'campaign', method: 'utm', landingPath: '/',
    utm: { source: rawUrl },
  });
  assert.equal(normalized.source, 'creator.example.test');
  assert.equal(normalized.utm.source, 'creator.example.test');
  for (const secret of forbidden) assert.ok(!JSON.stringify(normalized).includes(secret), `normalizer leaked ${secret}`);
});

test('provider blog, cafe, document and mail services are not falsely labelled as search traffic', () => {
  for (const [host, source, channel] of [
    ['blog.naver.com', 'naver', 'referral'],
    ['cafe.naver.com', 'naver', 'referral'],
    ['docs.google.com', 'google', 'referral'],
    ['mail.google.com', 'google', 'email'],
  ]) {
    const result = infer(`https://${host}/fixture`);
    assert.equal(result.source, source, host);
    assert.equal(result.channel, channel, host);
    assert.equal(result.referrerHost, host, host);
    assert.equal(result.method, 'referrer', host);
  }
});
