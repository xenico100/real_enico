export const VISIT_SOURCES = ['instagram', 'youtube', 'other'] as const;

export type VisitSource = (typeof VISIT_SOURCES)[number];

type VisitMeta = {
  path: string;
  source: VisitSource;
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

export function serializeVisitMeta(path: string, source: string | null | undefined) {
  const payload: VisitMeta = {
    path,
    source: normalizeVisitSource(source),
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

    return {
      path,
      source: normalizeVisitSource(parsed.source),
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
    other: 0,
  };
}
