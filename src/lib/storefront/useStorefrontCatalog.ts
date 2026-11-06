'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Product } from '@/lib/storefront/productCatalog';
import type { Collection } from '@/lib/storefront/collectionCatalog';

export type StorefrontCatalog = { products: Product[]; collections: Collection[] };
const REFRESH_INTERVAL_MS = 60_000;
const REQUEST_TIMEOUT_MS = 10_000;

function isCatalog(value: unknown): value is StorefrontCatalog {
  if (!value || typeof value !== 'object') return false;
  const catalog = value as Partial<StorefrontCatalog>;
  return Array.isArray(catalog.products) && Array.isArray(catalog.collections) &&
    catalog.products.every((product) => product && typeof product.id === 'string' &&
      typeof product.name === 'string' && Number.isSafeInteger(product.price) &&
      product.price >= 0 && typeof product.isSoldOut === 'boolean' &&
      typeof product.image === 'string' && Array.isArray(product.images) &&
      product.images.every((image) => typeof image === 'string') &&
      typeof product.description === 'string' && typeof product.category === 'string') &&
    catalog.collections.every((collection) => collection && typeof collection.id === 'string' &&
      typeof collection.title === 'string' && typeof collection.image === 'string' &&
      Array.isArray(collection.images) && collection.images.every((image) => typeof image === 'string'));
}

// Return null on refresh failure so a caller can stop an add/checkout action.
// Keep the last successful catalog visible while the connection recovers.
export function useStorefrontCatalog(initialProducts: Product[], initialCollections: Collection[]) {
  const [catalog, setCatalog] = useState<StorefrontCatalog>({ products: initialProducts, collections: initialCollections });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);
  const inFlight = useRef<Promise<StorefrontCatalog | null> | null>(null);
  const controller = useRef<AbortController | null>(null);

  const refresh = useCallback((): Promise<StorefrontCatalog | null> => {
    if (inFlight.current) return inFlight.current;
    const abort = new AbortController();
    controller.current = abort;
    if (mounted.current) setIsLoading(true);
    const timeout = window.setTimeout(() => abort.abort(), REQUEST_TIMEOUT_MS);
    const request = (async (): Promise<StorefrontCatalog | null> => {
      try {
        const response = await fetch('/api/storefront/catalog', {
          cache: 'no-store', credentials: 'same-origin', signal: abort.signal,
          headers: { Accept: 'application/json' },
        });
        if (!response.ok) throw new Error('Catalog unavailable');
        const data: unknown = await response.json();
        if (!isCatalog(data)) throw new Error('Invalid catalog');
        const next = { products: data.products, collections: data.collections };
        if (mounted.current && controller.current === abort) {
          setCatalog(next);
          setError(null);
        }
        return next;
      } catch {
        if (mounted.current && controller.current === abort) {
          setError('최신 상품 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.');
        }
        return null;
      } finally {
        window.clearTimeout(timeout);
        if (controller.current === abort) {
          inFlight.current = null;
          controller.current = null;
          if (mounted.current) setIsLoading(false);
        }
      }
    })();
    inFlight.current = request;
    return request;
  }, []);

  useEffect(() => {
    mounted.current = true;
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    void refresh();
    window.addEventListener('focus', refreshWhenVisible);
    window.addEventListener('online', refreshWhenVisible);
    document.addEventListener('visibilitychange', refreshWhenVisible);
    const interval = window.setInterval(refreshWhenVisible, REFRESH_INTERVAL_MS);
    return () => {
      mounted.current = false;
      window.clearInterval(interval);
      window.removeEventListener('focus', refreshWhenVisible);
      window.removeEventListener('online', refreshWhenVisible);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
      controller.current?.abort();
      controller.current = null;
      inFlight.current = null;
    };
  }, [refresh]);

  return { ...catalog, isLoading, error, refresh };
}
