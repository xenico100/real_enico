export const VISIT_SOURCES = ['instagram', 'youtube', 'threads', 'twitter', 'other'] as const;

export type VisitSource = (typeof VISIT_SOURCES)[number];

export const VISIT_CHANNELS = [
  'organic_search', 'paid_search', 'organic_social', 'paid_social',
  'messaging', 'email', 'referral', 'campaign', 'direct_or_unknown',
] as const;
export type VisitChannel = (typeof VISIT_CHANNELS)[number];
export type VisitAttribution = {
  version: 1;
  source: string;
  channel: VisitChannel;
  method: 'utm' | 'referrer' | 'direct';
  landingPath: string;
  referrerHost?: string;
  utm?: { source?: string; medium?: string; campaign?: string; content?: string; term?: string };
};
export type VisitSourceDetail = {
  key: string;
  source: string;
  channel: VisitChannel | 'legacy_unknown';
  visitorCount: number;
  referrerHost?: string;
  landingPath?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  utmTerm?: string;
};

const SEARCH_SOURCES = new Set(['google', 'naver', 'daum', 'bing', 'yahoo', 'duckduckgo', 'baidu']);
const SOCIAL_SOURCES = new Set(['instagram', 'youtube', 'threads', 'twitter', 'facebook', 'tiktok', 'pinterest', 'linkedin']);
const SOURCE_DOMAINS: [string, string[]][] = [
  ['instagram', ['instagram.com', 'instagr.am']],
  ['youtube', ['youtube.com', 'youtu.be', 'youtube-nocookie.com']],
  ['threads', ['threads.net', 'threads.com']],
  ['twitter', ['twitter.com', 'x.com', 't.co']],
  ['google', ['google.com', 'google.co.kr', 'google.co.jp', 'google.co.uk', 'google.com.au', 'google.ca', 'google.de', 'google.fr', 'google.co.in', 'google.com.tw', 'google.com.hk']],
  ['naver', ['naver.com', 'naver.me']],
  ['daum', ['daum.net']],
  ['bing', ['bing.com']],
  ['yahoo', ['yahoo.com', 'yahoo.co.jp']],
  ['duckduckgo', ['duckduckgo.com']],
  ['baidu', ['baidu.com']],
  ['kakao', ['kakao.com', 'kakao.co.kr', 'kakao.link', 'kakaotalk.com']],
  ['facebook', ['facebook.com', 'fb.com', 'fb.me']],
  ['tiktok', ['tiktok.com']],
  ['pinterest', ['pinterest.com', 'pin.it']],
  ['linkedin', ['linkedin.com', 'lnkd.in']],
  ['telegram', ['telegram.org', 't.me']],
  ['whatsapp', ['whatsapp.com', 'wa.me']],
];
const SOURCE_ALIASES: Record<string, string> = {
  ig: 'instagram', insta: 'instagram', yt: 'youtube', x: 'twitter',
  google_ads: 'google', googleads: 'google', naver_ads: 'naver',
  kakao: 'kakao', kakaotalk: 'kakao', kakao_talk: 'kakao', 카카오: 'kakao', 카카오톡: 'kakao',
  fb: 'facebook', meta: 'facebook', 네이버: 'naver', 구글: 'google', 다음: 'daum',
};

function cleanMarketingValue(value: unknown, max = 160): string | undefined {
  if (typeof value !== 'string') return undefined;
  const text = value.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max);
  // A URL accidentally used as a campaign tag must not retain credentials,
  // private query parameters or fragments in either source or UTM fields.
  if (/^https?:\/\//i.test(text)) {
    try { return new URL(text).hostname.toLowerCase().slice(0, max) || undefined; } catch { return undefined; }
  }
  return text || undefined;
}

function cleanLandingPath(value: unknown) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) return '/';
  return value.split(/[?#]/, 1)[0].replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 200) || '/';
}

function cleanHost(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length > 253 || /[\s/@?#:]/.test(value)) return undefined;
  try {
    return new URL(`https://${value}`).hostname.toLowerCase().replace(/^www\./, '').replace(/\.$/, '') || undefined;
  } catch { return undefined; }
}

function hostMatches(host: string, domain: string) {
  return host === domain || host.endsWith(`.${domain}`);
}

function sourceFromHost(host: string) {
  return SOURCE_DOMAINS.find(([, domains]) => domains.some((domain) => hostMatches(host, domain)))?.[0];
}

function sourceFromTag(value: string) {
  const token = value.toLowerCase().trim();
  const url = tryParseUrl(token);
  const host = url?.hostname || cleanHost(token);
  return SOURCE_ALIASES[token] || (host ? sourceFromHost(host) || host : token);
}

function channelForSource(source: string, medium?: string): VisitChannel {
  const token = (medium || '').toLowerCase().replace(/[\s-]+/g, '_');
  const paid = /^(cpc|ppc|paid|paid_search|paid_social|paidsearch|paidsocial|display|cpm|cpv|ads|retargeting)$/.test(token);
  if (token === 'email' || token === 'e_mail' || token === 'newsletter') return 'email';
  if (token === 'referral') return 'referral';
  if (['social', 'organic_social', 'social_media'].includes(token)) return 'organic_social';
  if (source === 'kakao' || source === 'telegram' || source === 'whatsapp' || token === 'messenger' || token === 'messaging' || token === 'sms') return 'messaging';
  if (SEARCH_SOURCES.has(source)) return paid ? 'paid_search' : 'organic_search';
  if (SOCIAL_SOURCES.has(source)) return paid ? 'paid_social' : 'organic_social';
  if (token === 'paid_search' || token === 'paidsearch' || token === 'cpc' || token === 'ppc') return 'paid_search';
  if (token === 'paid_social' || token === 'paidsocial') return 'paid_social';
  if (token === 'organic') return 'organic_search';
  return 'campaign';
}

function channelForReferrer(source: string, host: string): VisitChannel {
  // A provider domain alone does not prove a search: its blog, cafe, mail
  // and document services are different acquisition channels.
  if (/^(mail|outlook)\./.test(host)) return 'email';
  if (SEARCH_SOURCES.has(source)) {
    if (source === 'naver' && !['naver.com', 'search.naver.com', 'm.search.naver.com', 'm.naver.com'].includes(host)) return 'referral';
    if (source === 'daum' && !['daum.net', 'search.daum.net', 'm.search.daum.net', 'm.daum.net'].includes(host)) return 'referral';
    if (source === 'google' && /^(docs|drive|maps|translate|accounts|calendar|sites)\./.test(host)) return 'referral';
  }
  return channelForSource(source);
}

export function normalizeVisitAttribution(raw: unknown): VisitAttribution | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const item = raw as Record<string, unknown>;
  if (item.version !== 1 || !VISIT_CHANNELS.includes(item.channel as VisitChannel)) return undefined;
  if (!['utm', 'referrer', 'direct'].includes(String(item.method))) return undefined;
  const source = cleanMarketingValue(item.source);
  if (!source) return undefined;
  const referrerHost = cleanHost(item.referrerHost);
  const rawUtm = item.utm && typeof item.utm === 'object' ? item.utm as Record<string, unknown> : {};
  const utm: NonNullable<VisitAttribution['utm']> = {};
  for (const key of ['source', 'medium', 'campaign', 'content', 'term'] as const) {
    const value = cleanMarketingValue(rawUtm[key]);
    if (value) utm[key] = value;
  }
  return {
    version: 1, source, channel: item.channel as VisitChannel,
    method: item.method as VisitAttribution['method'],
    landingPath: cleanLandingPath(item.landingPath),
    ...(referrerHost ? { referrerHost } : {}),
    ...(Object.keys(utm).length ? { utm } : {}),
  };
}

export function inferVisitAttribution(params: {
  currentUrl?: string | null;
  referrer?: string | null;
}): VisitAttribution {
  const currentUrl = tryParseUrl(params.currentUrl);
  const referrer = tryParseUrl(params.referrer);
  const currentHost = cleanHost(currentUrl?.hostname);
  const candidateHost = cleanHost(referrer?.hostname);
  const isInternal = candidateHost && (
    candidateHost === currentHost ||
    (hostMatches(candidateHost, 'enicoveck.com') && Boolean(currentHost && hostMatches(currentHost, 'enicoveck.com')))
  );
  const referrerHost = candidateHost && !isInternal ? candidateHost : undefined;
  const utm: NonNullable<VisitAttribution['utm']> = {};
  for (const key of ['source', 'medium', 'campaign', 'content', 'term'] as const) {
    const value = cleanMarketingValue(currentUrl?.searchParams.get(`utm_${key}`));
    if (value) utm[key] = value;
  }
  const tag = cleanMarketingValue(currentUrl?.searchParams.get('ref')) || cleanMarketingValue(currentUrl?.searchParams.get('source'));
  const landingPath = cleanLandingPath(currentUrl?.pathname);
  if (Object.keys(utm).length || tag) {
    const source = utm.source ? sourceFromTag(utm.source) : tag ? sourceFromTag(tag) : referrerHost ? sourceFromHost(referrerHost) || referrerHost : utm.medium?.toLowerCase() === 'email' ? 'email' : '(campaign)';
    return {
      version: 1, source, channel: channelForSource(source, utm.medium), method: 'utm', landingPath,
      ...(referrerHost ? { referrerHost } : {}), ...(Object.keys(utm).length ? { utm } : {}),
    };
  }
  if (referrerHost) {
    const knownSource = sourceFromHost(referrerHost);
    return {
      version: 1, source: knownSource || referrerHost,
      channel: knownSource ? channelForReferrer(knownSource, referrerHost) : 'referral',
      method: 'referrer', landingPath, referrerHost,
    };
  }
  return { version: 1, source: '(direct)', channel: 'direct_or_unknown', method: 'direct', landingPath };
}

export function mergeVisitAttribution(
  stored: VisitAttribution | undefined,
  incoming: VisitAttribution | undefined,
): VisitAttribution | undefined {
  const previous = normalizeVisitAttribution(stored);
  const next = normalizeVisitAttribution(incoming);
  if (!previous) return next;
  if (previous.method !== 'direct' || !next || next.method === 'direct') return previous;
  return next;
}

export const VISIT_EVENT_TYPES = [
  'page_view',
  'tab_click',
  'category_filter',
  'product_click',
  'add_to_cart',
  'cart_open',
  'checkout_open',
  'order_submit',
] as const;

export type VisitEventType = (typeof VISIT_EVENT_TYPES)[number];

export type VisitEventItem = {
  type: VisitEventType;
  target: string;
  detail?: string;
  at: string;
};

export type VisitEventBreakdown = {
  tab_click: number;
  category_filter: number;
  product_click: number;
  add_to_cart: number;
  cart_open: number;
  checkout_open: number;
  order_submit: number;
};

export type VisitMeta = {
  path: string;
  source: VisitSource;
  events?: VisitEventItem[];
  attribution?: VisitAttribution;
};

function tryParseUrl(value: string | null | undefined) {
  const normalized = (value || '').trim();
  if (!normalized) return null;

  try {
    const url = new URL(normalized);
    return ['http:', 'https:'].includes(url.protocol) ? url : null;
  } catch {
    return null;
  }
}

export function inferVisitSource(params: {
  currentUrl?: string | null;
  referrer?: string | null;
}): VisitSource {
  return normalizeVisitSource(inferVisitAttribution(params).source);
}

export function normalizeVisitSource(value: string | null | undefined): VisitSource {
  const normalized = (value || '').trim().toLowerCase();
  return VISIT_SOURCES.includes(normalized as VisitSource) ? normalized as VisitSource : 'other';
}

export function mergeVisitSource(
  storedSource: string | null | undefined,
  incomingSource: string | null | undefined,
): VisitSource {
  const normalizedStored = normalizeVisitSource(storedSource);
  const normalizedIncoming = normalizeVisitSource(incomingSource);

  if (normalizedStored !== 'other') {
    return normalizedStored;
  }

  return normalizedIncoming;
}

export function isVisitEventType(value: unknown): value is VisitEventType {
  return (
    typeof value === 'string' &&
    VISIT_EVENT_TYPES.includes(value.trim() as VisitEventType)
  );
}

export function normalizeVisitEventItem(
  raw: unknown,
  fallbackIso = new Date().toISOString(),
): VisitEventItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const candidate = raw as Record<string, unknown>;
  if (!isVisitEventType(candidate.type)) return null;
  const target =
    typeof candidate.target === 'string' ? candidate.target.trim().slice(0, 120) : '';
  if (!target) return null;
  const detail =
    typeof candidate.detail === 'string' && candidate.detail.trim()
      ? candidate.detail.trim().slice(0, 160)
      : undefined;
  const at =
    typeof candidate.at === 'string' && candidate.at.trim()
      ? candidate.at.trim().slice(0, 40)
      : fallbackIso;

  return {
    type: candidate.type,
    target,
    ...(detail ? { detail } : {}),
    at,
  };
}

export function appendVisitEvents(
  existingEvents: VisitEventItem[] | undefined,
  nextEvent: VisitEventItem | null | undefined,
  maxEvents = 50,
): VisitEventItem[] {
  const list = Array.isArray(existingEvents) ? [...existingEvents] : [];
  if (nextEvent) {
    list.push(nextEvent);
  }
  if (list.length > maxEvents) {
    return list.slice(list.length - maxEvents);
  }
  return list;
}

export function serializeVisitMeta(
  path: string,
  source: string | null | undefined,
  events?: VisitEventItem[],
  attribution?: VisitAttribution,
) {
  const normalizedEvents = Array.isArray(events)
    ? events
        .map((item) => normalizeVisitEventItem(item))
        .filter((item): item is VisitEventItem => Boolean(item))
    : [];

  const normalizedAttribution = normalizeVisitAttribution(attribution);
  const payload: VisitMeta = {
    path,
    source: normalizeVisitSource(source),
    ...(normalizedEvents.length > 0 ? { events: normalizedEvents } : {}),
    ...(normalizedAttribution ? { attribution: normalizedAttribution } : {}),
  };

  return JSON.stringify(payload);
}

export function parseVisitMeta(value: string | null | undefined): VisitMeta {
  const fallbackPath = (value || '').trim();

  if (!fallbackPath) {
    return { path: '/', source: 'other' };
  }

  try {
    const raw = JSON.parse(fallbackPath);
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { path: fallbackPath, source: 'other' };
    const parsed = raw as Partial<VisitMeta>;
    const path =
      typeof parsed.path === 'string' && parsed.path.trim() ? parsed.path.trim() : fallbackPath;
    const events = Array.isArray(parsed.events)
      ? parsed.events
          .map((item) => normalizeVisitEventItem(item))
          .filter((item): item is VisitEventItem => Boolean(item))
      : [];

    const attribution = normalizeVisitAttribution(parsed.attribution);
    return {
      path,
      source: normalizeVisitSource(parsed.source),
      ...(events.length > 0 ? { events } : {}),
      ...(attribution ? { attribution } : {}),
    };
  } catch {
    return {
      path: fallbackPath,
      source: 'other',
    };
  }
}

export function createEmptyVisitSourceBreakdown() {
  return {
    instagram: 0,
    youtube: 0,
    threads: 0,
    twitter: 0,
    other: 0,
  };
}

export function createEmptyVisitEventBreakdown(): VisitEventBreakdown {
  return {
    tab_click: 0,
    category_filter: 0,
    product_click: 0,
    add_to_cart: 0,
    cart_open: 0,
    checkout_open: 0,
    order_submit: 0,
  };
}
