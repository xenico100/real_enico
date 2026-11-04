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
    assert.equal(result.version, 2);
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
    assert.equal(result.source, '(unknown)', referrer);
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

test('click markers identify provider evidence without retaining IDs or claiming a paid/search subtype', () => {
  for (const [parameter, source] of [['gclid', 'google_ads'], ['gbraid', 'google_ads'], ['wbraid', 'google_ads'], ['msclkid', 'microsoft_ads'], ['fbclid', 'meta']]) {
    const result = infer('', `https://enicoveck.com/shop?${parameter}=OPAQUE_CLICK_DO_NOT_STORE&access_token=PRIVATE#PRIVATE`);
    assert.equal(result.source, source);
    assert.equal(result.method, 'click_id');
    assert.equal(result.channel, 'campaign');
    assert.equal(result.clickIdParameter, parameter);
    assert.equal(result.landingPath, '/shop');
    const serialized = analytics.serializeVisitMeta('/shop', 'other', [], result);
    assert.ok(!/OPAQUE_CLICK|PRIVATE|access_token/.test(serialized));
    assert.equal(analytics.parseVisitMeta(serialized).attribution.clickIdParameter, parameter);
  }
  assert.equal(infer('', 'https://enicoveck.com/?gclid=').method, 'direct');
});

test('observed Android app identities are allowlisted, neutral and retained alongside campaign tags/markers', () => {
  const app = 'android-app://com.instagram.android/https/private.example.test/private?token=DO_NOT_STORE';
  const appOnly = infer(app);
  assert.equal(appOnly.source, 'instagram');
  assert.equal(appOnly.channel, 'referral');
  assert.equal(appOnly.method, 'app_referrer');
  assert.equal(appOnly.appId, 'com.instagram.android');
  const tagged = infer(app, 'https://enicoveck.com/?utm_source=naver&utm_medium=cpc&fbclid=DO_NOT_STORE');
  assert.equal(tagged.source, 'naver');
  assert.equal(tagged.method, 'utm');
  assert.equal(tagged.appId, 'com.instagram.android');
  assert.equal(tagged.clickIdParameter, 'fbclid');
  const marked = infer(app, 'https://enicoveck.com/?fbclid=DO_NOT_STORE');
  assert.equal(marked.source, 'instagram');
  assert.equal(marked.method, 'app_referrer');
  assert.equal(marked.channel, 'referral');
  assert.equal(marked.clickIdParameter, 'fbclid');
  assert.ok(!JSON.stringify([appOnly, tagged, marked]).includes('DO_NOT_STORE'));
  for (const raw of ['android-app://com.instagram.android.evil.test/', 'android-app://unknown.private.app/', 'android-app://user:secret@com.instagram.android/']) {
    const unknown = infer(raw);
    assert.equal(unknown.source, '(unknown)');
    assert.equal(unknown.unknownReason, 'unrecognized_app');
    assert.equal(unknown.appId, undefined);
    assert.ok(!JSON.stringify(unknown).includes('private.app'));
  }
});

test('unknown evidence records why a new visit is unclassified without asserting direct traffic', () => {
  for (const [referrer, reason] of [['', 'no_referrer'], ['https://enicoveck.com/shop', 'internal_referrer'], ['javascript:PRIVATE', 'invalid_referrer']]) {
    const result = infer(referrer);
    assert.equal(result.version, 2);
    assert.equal(result.source, '(unknown)');
    assert.equal(result.method, 'direct');
    assert.equal(result.channel, 'direct_or_unknown');
    assert.equal(result.unknownReason, reason);
  }
});

test('v1 remains readable while v2 evidence rejects unknown marker/app types and arbitrary properties', () => {
  const legacy = { version: 1, source: '(direct)', channel: 'direct_or_unknown', method: 'direct', landingPath: '/' };
  assert.deepEqual(analytics.normalizeVisitAttribution({ ...legacy, unknownReason: 'no_referrer' }), legacy);
  assert.equal(analytics.normalizeVisitAttribution({ ...legacy, method: 'click_id', clickIdParameter: 'gclid' }), undefined);
  assert.equal(analytics.normalizeVisitAttribution({ ...legacy, version: 2, method: 'click_id', clickIdParameter: 'gclid=PRIVATE' }), undefined);
  assert.equal(analytics.normalizeVisitAttribution({ ...legacy, version: 2, method: 'app_referrer', appId: 'unlisted.private.app' }), undefined);
  const normalized = analytics.normalizeVisitAttribution({ ...infer('', 'https://enicoveck.com/?gclid=DO_NOT_STORE'), clickId: 'DO_NOT_STORE', rawQuery: 'PRIVATE' });
  assert.equal(normalized.clickIdParameter, 'gclid');
  assert.ok(!/DO_NOT_STORE|PRIVATE/.test(JSON.stringify(normalized)));
});

test('query observation keys exclude raw click values and unrelated query/fragment data', () => {
  const a = analytics.visitAcquisitionQueryKey(new URL('https://enicoveck.com/?gclid=PRIVATE_A&access_token=PRIVATE#PRIVATE').searchParams);
  const b = analytics.visitAcquisitionQueryKey(new URL('https://enicoveck.com/?gclid=PRIVATE_B&session=PRIVATE').searchParams);
  assert.equal(a, b);
  assert.ok(!a.includes('PRIVATE'));
  assert.notEqual(a, analytics.visitAcquisitionQueryKey(new URL('https://enicoveck.com/?utm_source=instagram').searchParams));
});

test('generic provider tags and missing or unrecognized UTM medium are not asserted as organic traffic', () => {
  for (const [tag, source] of [['meta', 'meta'], ['google_ads', 'google_ads'], ['googleads', 'google_ads'], ['naver_ads', 'naver_ads'], ['google', 'google'], ['instagram', 'instagram']]) {
    for (const suffix of ['', '&utm_medium=unrecognized_custom_value']) {
      const result = infer('', `https://enicoveck.com/?utm_source=${tag}${suffix}`);
      assert.equal(result.source, source);
      assert.equal(result.method, 'utm');
      assert.equal(result.channel, 'campaign');
    }
  }
  assert.equal(infer('https://www.google.com/').channel, 'organic_search');
  assert.equal(infer('https://www.instagram.com/').channel, 'organic_social');
});

test('an observed external hop remains primary and click markers do not assert organic/paid traffic', () => {
  for (const [referrer, marker, source, channel] of [
    ['https://www.google.com/', 'gclid', 'google', 'referral'],
    ['https://l.instagram.com/', 'fbclid', 'instagram', 'referral'],
    ['https://www.facebook.com/', 'fbclid', 'facebook', 'referral'],
    ['https://l.kakao.com/', 'gclid', 'kakao', 'messaging'],
    ['https://mail.google.com/', 'gclid', 'google', 'email'],
  ]) {
    const result = infer(referrer, `https://enicoveck.com/?${marker}=PRIVATE`);
    assert.equal(result.source, source);
    assert.equal(result.channel, channel);
    assert.equal(result.method, 'referrer');
    assert.equal(result.clickIdParameter, marker);
    assert.ok(!JSON.stringify(result).includes('PRIVATE'));
  }
});

test('prototype-shaped campaign values remain bounded strings rather than inherited object values', () => {
  for (const source of ['__proto__', 'constructor', 'toString', 'hasOwnProperty']) {
    const result = infer('', `https://enicoveck.com/?utm_source=${source}`);
    assert.equal(typeof result.source, 'string');
    assert.equal(result.method, 'utm');
    assert.equal(result.channel, 'campaign');
    assert.ok(analytics.normalizeVisitAttribution(result));
    assert.doesNotThrow(() => analytics.serializeVisitMeta('/', 'other', [], result));
  }
});

test('conflicting click provider markers remain an unspecified campaign unless real source evidence exists', () => {
  const url = 'https://enicoveck.com/?gclid=PRIVATE_GOOGLE&fbclid=PRIVATE_META';
  const mixed = infer('', url);
  assert.equal(mixed.source, '(campaign)');
  assert.equal(mixed.method, 'click_id');
  assert.equal(mixed.channel, 'campaign');
  assert.equal(mixed.clickIdParameter, 'gclid');
  assert.ok(!JSON.stringify(mixed).includes('PRIVATE'));
  assert.equal(infer('', 'https://enicoveck.com/?gclid=PRIVATE&wbraid=PRIVATE').source, 'google_ads');
  assert.equal(infer('https://www.instagram.com/', url).source, 'instagram');
  assert.equal(infer('', url + '&utm_source=naver&utm_medium=cpc').source, 'naver');
});

test('new metadata serialization strips private query/fragment values from the supplied path without rewriting legacy reads', () => {
  const unsafe = '/shop?gclid=PRIVATE_CLICK&session_token=PRIVATE_SESSION#PRIVATE_FRAGMENT';
  const stored = analytics.serializeVisitMeta(unsafe, 'other', [], infer('', 'https://enicoveck.com/?gclid=PRIVATE_CLICK'));
  assert.equal(analytics.parseVisitMeta(stored).path, '/shop');
  assert.ok(!stored.includes('PRIVATE'));
  assert.equal(analytics.parseVisitMeta(unsafe).path, unsafe, 'historical records are interpreted as stored, never backfilled or rewritten');
});
