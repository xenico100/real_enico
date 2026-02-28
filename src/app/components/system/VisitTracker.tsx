'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

const TRACK_STORAGE_PREFIX = 'visit_track';

function toSeoulDateKey(date: Date) {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
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

    void fetch('/api/analytics/visit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: pathname }),
      keepalive: true,
    }).catch(() => undefined);
  }, [pathname]);

  return null;
}
