'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import {
  inferVisitAttribution,
  mergeVisitAttribution,
  mergeVisitSource,
  normalizeVisitAttribution,
  normalizeVisitSource,
  type VisitAttribution,
  type VisitEventType,
} from '@/lib/analytics/visitSource';

const TRACK_STORAGE_PREFIX = 'visit_track:v2';
const SOURCE_STORAGE_PREFIX = 'visit_source';
const ATTRIBUTION_STORAGE_PREFIX = 'visit_attribution:v1';

// Serialize requests so the first response sets enico_vid before subsequent
// events are sent, including interactions before the idle page-view fires.
let requestQueue: Promise<void> = Promise.resolve();
const pendingPageViews = new Set<string>();

function sendVisit(payload: Record<string, unknown>): Promise<boolean> {
  const task = requestQueue.then(async () => {
    try {
      const response = await fetch('/api/analytics/visit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        keepalive: true,
      });
      return response.ok;
    } catch { return false; }
  });
  requestQueue = task.then(() => undefined);
  return task;
}

function isStorefrontPath(pathname: string) {
  return !/^\/(admin|dev)(\/|$)/.test(pathname);
}

function browserAcquisition(dateKey: string): { source: string; attribution: VisitAttribution } {
  const attributionKey = `${ATTRIBUTION_STORAGE_PREFIX}:${dateKey}`;
  const sourceKey = `${SOURCE_STORAGE_PREFIX}:${dateKey}`;
  let stored: VisitAttribution | undefined;
  let storedSource = 'other';
  try {
    const raw = window.localStorage.getItem(attributionKey);
    stored = raw ? normalizeVisitAttribution(JSON.parse(raw)) : undefined;
    storedSource = normalizeVisitSource(window.localStorage.getItem(sourceKey));
  } catch { /* Tracking still works when storage is unavailable. */ }
  const inferred = inferVisitAttribution({ currentUrl: window.location.href, referrer: document.referrer });
  const attribution = mergeVisitAttribution(stored, inferred) || inferred;
  const source = mergeVisitSource(storedSource, attribution.source);
  try {
    window.localStorage.setItem(attributionKey, JSON.stringify(attribution));
    window.localStorage.setItem(sourceKey, source);
  } catch { /* Private browsing and full storage must not prevent a visit. */ }
  return { source, attribution };
}

function toSeoulDateKey(date: Date) {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function trackStorefrontEvent(params: {
  type: VisitEventType;
  target: string;
  detail?: string;
}) {
  if (typeof window === 'undefined') return;
  const pathname = window.location.pathname || '/';
  if (!isStorefrontPath(pathname)) return;

  const now = new Date();
  const dateKey = toSeoulDateKey(now);
  const { source, attribution } = browserAcquisition(dateKey);
  void sendVisit({
    path: pathname,
    source,
    attribution,
    event: {
      type: params.type,
      target: params.target,
      ...(params.detail ? { detail: params.detail } : {}),
      at: now.toISOString(),
    },
  });
}

function requestWhenIdle(callback: () => void) {
  if (typeof window === 'undefined') {
    return () => undefined;
  }

  const browserWindow = globalThis as typeof globalThis & {
    requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number;
    cancelIdleCallback?: (handle: number) => void;
  };

  if (typeof browserWindow.requestIdleCallback === 'function') {
    const idleId = browserWindow.requestIdleCallback(() => callback(), { timeout: 1500 });
    return () => browserWindow.cancelIdleCallback?.(idleId);
  }

  const timeoutId = globalThis.setTimeout(callback, 350);
  return () => globalThis.clearTimeout(timeoutId);
}

export function VisitTracker() {
  const pathname = usePathname();

  useEffect(() => {
    // Synthetic component previews must never count as storefront visits.
    if (!pathname || !isStorefrontPath(pathname)) return;

    const dateKey = toSeoulDateKey(new Date());
    const { source, attribution } = browserAcquisition(dateKey);
    const storageKey = `${TRACK_STORAGE_PREFIX}:${dateKey}:${pathname}:${JSON.stringify(attribution)}`;
    try {
      const tracked = window.sessionStorage.getItem(storageKey);
      if (tracked === '1') return;
    } catch { /* Storage is optional. */ }

    const cancelIdleTask = requestWhenIdle(() => {
      if (pendingPageViews.has(storageKey)) return;
      pendingPageViews.add(storageKey);
      void sendVisit({ path: pathname, source, attribution }).then((ok) => {
        pendingPageViews.delete(storageKey);
        if (ok) {
          try { window.sessionStorage.setItem(storageKey, '1'); } catch { /* Storage is optional. */ }
        }
      });
    });

    return cancelIdleTask;
  }, [pathname]);

  return null;
}
