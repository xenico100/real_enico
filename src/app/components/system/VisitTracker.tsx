'use client';

import { useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import {
  inferVisitAttribution,
  mergeVisitAttribution,
  mergeVisitSource,
  normalizeVisitAttribution,
  normalizeVisitSource,
  visitAcquisitionQueryKey,
  type VisitAttribution,
  type VisitEventType,
} from '@/lib/analytics/visitSource';

const TRACK_STORAGE_PREFIX = 'visit_track:v2';
const SOURCE_STORAGE_PREFIX = 'visit_source';
const ATTRIBUTION_STORAGE_PREFIX = 'visit_attribution:v1';
const PAGE_STORAGE_PREFIX = 'visit_page:v3';

// Serialize requests so the first response sets enico_vid before subsequent
// events are sent, including interactions before the idle page-view fires.
let requestQueue: Promise<void> = Promise.resolve();
const pendingPageViews = new Set<string>();
const successfulPageViews = new Set<string>();
const successfulAttributions = new Set<string>();
let memoryAcquisition: { dateKey: string; source: string; attribution: VisitAttribution } | undefined;

function sendVisit(payload: Record<string, unknown> | (() => Record<string, unknown>), onSuccess?: () => void): Promise<boolean> {
  const task = requestQueue.then(async () => {
    try {
      const response = await fetch('/api/analytics/visit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(typeof payload === 'function' ? payload() : payload),
        keepalive: true,
      });
      if (response.ok) onSuccess?.();
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
  if (memoryAcquisition && memoryAcquisition.dateKey !== dateKey) {
    successfulPageViews.clear();
    successfulAttributions.clear();
  }
  const attributionKey = `${ATTRIBUTION_STORAGE_PREFIX}:${dateKey}`;
  const sourceKey = `${SOURCE_STORAGE_PREFIX}:${dateKey}`;
  let stored: VisitAttribution | undefined;
  let storedSource = 'other';
  try {
    const raw = window.localStorage.getItem(attributionKey);
    stored = raw ? normalizeVisitAttribution(JSON.parse(raw)) : undefined;
    storedSource = normalizeVisitSource(window.localStorage.getItem(sourceKey));
  } catch { /* Tracking still works when storage is unavailable. */ }
  if (memoryAcquisition?.dateKey === dateKey) {
    stored = mergeVisitAttribution(memoryAcquisition.attribution, stored);
    storedSource = mergeVisitSource(memoryAcquisition.source, storedSource);
  }
  const inferred = inferVisitAttribution({ currentUrl: window.location.href, referrer: document.referrer });
  const attribution = mergeVisitAttribution(stored, inferred) || inferred;
  const source = mergeVisitSource(storedSource, attribution.source);
  memoryAcquisition = { dateKey, source, attribution };
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
  const acquisitionQueryKey = visitAcquisitionQueryKey(useSearchParams());

  useEffect(() => {
    // Synthetic component previews must never count as storefront visits.
    if (!pathname || !isStorefrontPath(pathname)) return;

    const dateKey = toSeoulDateKey(new Date());
    const { source, attribution } = browserAcquisition(dateKey);
    const storageKey = `${TRACK_STORAGE_PREFIX}:${dateKey}:${pathname}:${JSON.stringify(attribution)}`;
    const pageKey = `${PAGE_STORAGE_PREFIX}:${dateKey}:${pathname}`;
    if (successfulAttributions.has(storageKey)) return;
    try {
      const tracked = window.sessionStorage.getItem(storageKey);
      if (tracked === '1') return;
    } catch { /* Storage is optional. */ }

    const cancelIdleTask = requestWhenIdle(() => {
      if (pendingPageViews.has(storageKey)) return;
      pendingPageViews.add(storageKey);
      void sendVisit(() => {
        let pageCounted = successfulPageViews.has(pageKey);
        try { pageCounted ||= window.sessionStorage.getItem(pageKey) === '1'; } catch { /* Memory is sufficient when storage is unavailable. */ }
        return { path: pathname, source, attribution, ...(pageCounted ? { attributionOnly: true } : {}) };
      }, () => {
        successfulPageViews.add(pageKey);
        successfulAttributions.add(storageKey);
        try {
          window.sessionStorage.setItem(pageKey, '1');
          window.sessionStorage.setItem(storageKey, '1');
        } catch { /* Successful transport remains tracked in memory. */ }
      }).then(() => {
        pendingPageViews.delete(storageKey);
      });
    });

    return cancelIdleTask;
  }, [pathname, acquisitionQueryKey]);

  return null;
}
