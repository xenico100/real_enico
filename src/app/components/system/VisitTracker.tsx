'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { inferVisitSource, normalizeVisitSource } from '@/lib/analytics/visitSource';

const TRACK_STORAGE_PREFIX = 'visit_track';
const SOURCE_STORAGE_PREFIX = 'visit_source';

function toSeoulDateKey(date: Date) {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
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
    if (!pathname) return;

    const dateKey = toSeoulDateKey(new Date());
    const storageKey = `${TRACK_STORAGE_PREFIX}:${dateKey}:${pathname}`;

    if (typeof window !== 'undefined') {
      const tracked = window.sessionStorage.getItem(storageKey);
      if (tracked === '1') {
        return;
      }
      window.sessionStorage.setItem(storageKey, '1');
    }

    let source = 'other';
    if (typeof window !== 'undefined') {
      const sourceStorageKey = `${SOURCE_STORAGE_PREFIX}:${dateKey}`;
      const storedSource = normalizeVisitSource(window.localStorage.getItem(sourceStorageKey));
      const inferredSource = inferVisitSource({
        currentUrl: window.location.href,
        referrer: document.referrer,
      });

      source =
        inferredSource !== 'other'
          ? inferredSource
          : storedSource !== 'other'
            ? storedSource
            : 'other';

      window.localStorage.setItem(sourceStorageKey, source);
    }

    const cancelIdleTask = requestWhenIdle(() => {
      void fetch('/api/analytics/visit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: pathname, source }),
        keepalive: true,
      }).catch(() => undefined);
    });

    return cancelIdleTask;
  }, [pathname]);

  return null;
}
