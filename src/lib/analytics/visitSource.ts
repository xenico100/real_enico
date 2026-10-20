export const VISIT_SOURCES = ['instagram', 'youtube', 'threads', 'twitter', 'other'] as const;

export type VisitSource = (typeof VISIT_SOURCES)[number];

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

type VisitMeta = {
  path: string;
  source: VisitSource;
  events?: VisitEventItem[];
};

function normalizeToken(value: string | null | undefined) {
  return (value || '').trim().toLowerCase();
}

function isVisitSource(value: string | null | undefined): value is VisitSource {
  return VISIT_SOURCES.includes((value || '').trim().toLowerCase() as VisitSource);
}

function classifySourceToken(value: string | null | undefined): VisitSource | null {
  const token = normalizeToken(value);
  if (!token) return null;

  if (
    token.includes('instagram') ||
    token.includes('instagr.am') ||
    token === 'ig' ||
    token === 'insta'
  ) {
    return 'instagram';
  }

  if (
    token.includes('youtube') ||
    token.includes('youtu.be') ||
    token === 'yt'
  ) {
    return 'youtube';
  }

  if (token.includes('threads') || token.includes('threads.net')) {
    return 'threads';
  }

  if (
    token.includes('twitter') ||
    token.includes('t.co') ||
    token.includes('x.com') ||
    token === 'x'
  ) {
    return 'twitter';
  }

  return null;
}

function tryParseUrl(value: string | null | undefined) {
  const normalized = (value || '').trim();
  if (!normalized) return null;

  try {
    return new URL(normalized);
  } catch {
    return null;
  }
}

export function inferVisitSource(params: {
  currentUrl?: string | null;
  referrer?: string | null;
}): VisitSource {
  const currentUrl = tryParseUrl(params.currentUrl);
  const referrer = tryParseUrl(params.referrer);

  const queryCandidates = [
    currentUrl?.searchParams.get('utm_source'),
    currentUrl?.searchParams.get('ref'),
    currentUrl?.searchParams.get('source'),
    currentUrl?.searchParams.get('utm_medium'),
  ];

  for (const candidate of queryCandidates) {
    const classified = classifySourceToken(candidate);
    if (classified) return classified;
  }

  const referrerCandidates = [referrer?.hostname, referrer?.origin, params.referrer];
  for (const candidate of referrerCandidates) {
    const classified = classifySourceToken(candidate);
    if (classified) return classified;
  }

  return 'other';
}

export function normalizeVisitSource(value: string | null | undefined): VisitSource {
  return isVisitSource(value) ? value : 'other';
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
) {
  const normalizedEvents = Array.isArray(events)
    ? events
        .map((item) => normalizeVisitEventItem(item))
        .filter((item): item is VisitEventItem => Boolean(item))
    : [];

  const payload: VisitMeta = {
    path,
    source: normalizeVisitSource(source),
    ...(normalizedEvents.length > 0 ? { events: normalizedEvents } : {}),
  };

  return JSON.stringify(payload);
}

export function parseVisitMeta(value: string | null | undefined): VisitMeta {
  const fallbackPath = (value || '').trim();

  if (!fallbackPath) {
    return { path: '/', source: 'other' };
  }

  try {
    const parsed = JSON.parse(fallbackPath) as Partial<VisitMeta>;
    const path =
      typeof parsed.path === 'string' && parsed.path.trim() ? parsed.path.trim() : fallbackPath;
    const events = Array.isArray(parsed.events)
      ? parsed.events
          .map((item) => normalizeVisitEventItem(item))
          .filter((item): item is VisitEventItem => Boolean(item))
      : [];

    return {
      path,
      source: normalizeVisitSource(parsed.source),
      ...(events.length > 0 ? { events } : {}),
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
