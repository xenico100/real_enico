'use client';

import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { Collection } from '@/lib/storefront/collectionCatalog';
import type { Product } from '@/lib/storefront/productCatalog';
import { buildCorridorCatalog, CORRIDOR_CHANNEL, parseCorridorEvent, type CorridorEvent } from '@/lib/storefront/corridorBridge';
import { useFashionCart } from '@/app/context/FashionCartContext';
import { useAuth } from '@/app/context/AuthContext';
import styles from './CorridorShowroom.module.css';

interface Props {
  products: Product[];
  collections: Collection[];
  overlayOpen: boolean;
  onCommand: (event: CorridorEvent, reply: (message: string) => void) => void;
}

export function CorridorShowroom({ products, collections, overlayOpen, onCommand }: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const { cart } = useFashionCart();
  const { isAuthenticated, isAuthReady } = useAuth();
  const catalog = useMemo(() => buildCorridorCatalog(products, collections), [products, collections]);
  const identity = [...catalog.pieces.map(item => item.id), ...catalog.collections.map(item => item.id)].sort().join(':');
  const state = useMemo(() => ({
    cartCount: cart.reduce((count, item) => count + item.quantity, 0),
    cartIds: cart.map(item => item.id),
    myPageLabel: isAuthenticated ? '마이페이지' : isAuthReady ? '로그인 / 주문조회' : '마이페이지',
    overlayOpen,
  }), [cart, isAuthenticated, isAuthReady, overlayOpen]);
  const post = useCallback((type: string, payload: Record<string, unknown> = {}) => {
    iframeRef.current?.contentWindow?.postMessage({ channel: CORRIDOR_CHANNEL, type, ...payload }, window.location.origin);
  }, []);
  const synchronize = useCallback(() => {
    post('catalog', catalog);
    post('state', state);
  }, [catalog, post, state]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      // Same-origin alone is insufficient: only this exact scene frame may issue commands.
      if (event.origin !== window.location.origin || event.source !== iframeRef.current?.contentWindow) return;
      const command = parseCorridorEvent(event.data);
      if (!command) return;
      if (command.type === 'ready' || command.type === 'scene-ready') {
        synchronize();
        return;
      }
      onCommand(command, message => post('toast', { message }));
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [onCommand, post, synchronize]);

  useEffect(() => { synchronize(); }, [synchronize]);

  return (
    <iframe
      key={identity}
      ref={iframeRef}
      className={styles.scene}
      src="/corridor/index.html?v=20261106-r5"
      title="ENICO VECK — 천장 와이어 의류 전시"
      onLoad={synchronize}
      inert={overlayOpen}
      aria-hidden={overlayOpen || undefined}
      allow="fullscreen"
      referrerPolicy="same-origin"
    />
  );
}
