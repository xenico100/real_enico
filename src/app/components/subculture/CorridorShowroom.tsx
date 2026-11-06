'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
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

const VIEW_MODE_KEY = 'enico-storefront-view';
const subscribeViewMode = (notify: () => void) => {
  window.addEventListener('storage', notify);
  return () => window.removeEventListener('storage', notify);
};
const readViewMode = (): '2d' | '3d' => {
  try { return window.localStorage.getItem(VIEW_MODE_KEY) === '2d' ? '2d' : '3d'; }
  catch { return '3d'; }
};
const serverViewMode = () => null;

export function CorridorShowroom({ products, collections, overlayOpen, onCommand }: Props) {
  const savedMode = useSyncExternalStore(subscribeViewMode, readViewMode, serverViewMode);
  const [chosenMode, setChosenMode] = useState<'2d' | '3d' | null>(null);
  const [fallback, setFallback] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [notice, setNotice] = useState('');
  const preferredMode = chosenMode ?? savedMode;
  const sceneEnabled = preferredMode === '3d' && !fallback;
  const showCatalog = preferredMode !== null && !sceneEnabled;
  const readyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const sceneMenuCleanup = useRef<(() => void) | null>(null);
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

  const observeSceneMenu = useCallback(() => {
    sceneMenuCleanup.current?.();
    const frame = iframeRef.current;
    const doc = frame?.contentDocument;
    const frameWindow = frame?.contentWindow;
    const toggle = toggleRef.current;
    if (!frame || !doc || !frameWindow || !toggle) return;
    const desktop = doc.querySelector<HTMLElement>('.desktop-nav');
    const mobile = doc.getElementById('mobileMenuBtn');
    const menu = doc.getElementById('mobileMenuOverlay');
    const detail = doc.getElementById('detail');
    const update = () => {
      const anchor = [desktop, mobile].find(element => element && element.getBoundingClientRect().width > 0);
      if (!anchor) { delete toggle.dataset.anchored; return; }
      const rect = anchor.getBoundingClientRect();
      const frameRect = frame.getBoundingClientRect();
      toggle.style.top = `max(${frameRect.top + rect.bottom + 8}px, env(safe-area-inset-top))`;
      toggle.style.right = `max(${window.innerWidth - frameRect.left - rect.right}px, env(safe-area-inset-right))`;
      toggle.style.width = `${rect.width}px`;
      toggle.dataset.anchored = 'true';
      // The iframe's own menus/details also need to stay above this parent control.
      toggle.dataset.sceneBlocked = String(Boolean(
        (menu && !menu.hidden) || (detail && !detail.hidden) || doc.body.classList.contains('open')
      ));
    };
    const resize = new ResizeObserver(update);
    [desktop, mobile, doc.documentElement].forEach(element => { if (element) resize.observe(element); });
    const mutation = new MutationObserver(update);
    [menu, detail, doc.body].forEach(element => {
      if (element) mutation.observe(element, { attributes: true, attributeFilter: ['hidden', 'class'] });
    });
    window.addEventListener('resize', update);
    frameWindow.addEventListener('resize', update);
    update();
    sceneMenuCleanup.current = () => {
      resize.disconnect();
      mutation.disconnect();
      window.removeEventListener('resize', update);
      frameWindow.removeEventListener('resize', update);
    };
  }, []);

  useEffect(() => () => {
    sceneMenuCleanup.current?.();
    sceneMenuCleanup.current = null;
  }, [sceneEnabled, identity, attempt]);

  useEffect(() => {
    if (!sceneEnabled) return;
    // A frame load/bridge handshake does not mean WebGL rendered successfully.
    readyTimer.current = setTimeout(() => setFallback(true), 10000);
    return () => { if (readyTimer.current) clearTimeout(readyTimer.current); };
  }, [identity, attempt, sceneEnabled]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      // Same-origin alone is insufficient: only this exact scene frame may issue commands.
      if (event.origin !== window.location.origin || event.source !== iframeRef.current?.contentWindow) return;
      if (event.data?.channel === CORRIDOR_CHANNEL && event.data?.type === 'scene-failed') {
        if (readyTimer.current) clearTimeout(readyTimer.current);
        setFallback(true);
        return;
      }
      const command = parseCorridorEvent(event.data);
      if (!command) return;
      if (command.type === 'scene-ready' && readyTimer.current) clearTimeout(readyTimer.current);
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

  const changeMode = (mode: '2d' | '3d') => {
    setChosenMode(mode);
    setFallback(false);
    setAttempt(value => value + 1);
    try { window.localStorage.setItem(VIEW_MODE_KEY, mode); } catch { /* Shopping still works when storage is unavailable. */ }
  };

  const command = (event: CorridorEvent) => onCommand(event, setNotice);

  const viewToggle = (
      <button
        ref={toggleRef}
        type="button"
        className={styles.viewToggle}
        aria-label="3D 전시"
        aria-pressed={sceneEnabled}
        data-active={sceneEnabled}
        data-scene={sceneEnabled}
        disabled={preferredMode === null}
        hidden={overlayOpen}
        onClick={() => changeMode(sceneEnabled ? '2d' : '3d')}
      >
        <span className={styles.toggleOrb} aria-hidden="true"><span /><span /><span /></span>
        <span className={styles.toggleLabel}><strong>3D <span>{sceneEnabled ? 'ON' : 'OFF'}</span></strong><span>{sceneEnabled ? '입체 전시' : '상품 목록'}</span></span>
        <span className={styles.toggleTrack} aria-hidden="true"><span /></span>
      </button>
  );

  return (
    <>
      {sceneEnabled && <iframe
        key={`${identity}:${attempt}`}
        ref={iframeRef}
        className={styles.scene}
        src="/corridor/index.html?v=20261106-r7"
        title="ENICO VECK — 천장 와이어 의류 전시"
        onLoad={() => { synchronize(); observeSceneMenu(); }}
        inert={overlayOpen || fallback}
        aria-hidden={overlayOpen || fallback || undefined}
        allow="fullscreen"
        referrerPolicy="same-origin"
      />}
      {showCatalog && (
        <section className={styles.catalogFallback} aria-label="상품 목록" inert={overlayOpen} aria-hidden={overlayOpen || undefined}>
          <header className={styles.catalogHeader}>
            <h1>ENICO VECK</h1>
            <div className={styles.catalogActions}>
              <nav aria-label="쇼핑 메뉴">
                <button type="button" onClick={() => command({ type: 'open-cart' })}>장바구니 ({state.cartCount})</button>
                <button type="button" onClick={() => command({ type: 'open-info', info: 'mypage' })}>{state.myPageLabel}</button>
              </nav>
              {viewToggle}
            </div>
          </header>
          <div className={styles.catalogNotice}>
            <p role="status">{fallback ? '3D 전시를 열 수 없어 상품 목록을 표시합니다.' : '상품 목록'}</p>
            {fallback && <button type="button" onClick={() => changeMode('3d')}>3D 전시 다시 열기</button>}
          </div>
          <ul className={styles.productGrid}>
            {catalog.pieces.map(product => (
              <li key={product.id}>
                <button className={styles.productCard} type="button" onClick={() => command({ type: 'open-product', id: product.id, imageIndex: 0 })}>
                  {/* Product images use the same validated catalog sources as the showroom. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={product.gallery[0]} alt="" loading="lazy" />
                  <span>{product.fullName}</span>
                  <span>{product.priceText}{product.isSoldOut ? ' · 품절' : ''}</span>
                </button>
              </li>
            ))}
          </ul>
          {!catalog.pieces.length && <p>현재 판매 중인 상품이 없습니다.</p>}
          {!!catalog.collections.length && <section className={styles.collections} aria-label="컬렉션">
            <h2>컬렉션</h2>
            {catalog.collections.map(collection => <button type="button" key={collection.id} onClick={() => command({ type: 'open-collection', id: collection.id, imageIndex: 0 })}>{collection.title}</button>)}
          </section>}
          <footer className={styles.catalogFooter}>
            <button type="button" onClick={() => command({ type: 'open-info', info: 'about' })}>브랜드 소개</button>
            <button type="button" onClick={() => command({ type: 'open-info', info: 'contact' })}>문의</button>
            <button type="button" onClick={() => command({ type: 'open-shop-info' })}>사업자 · 이용 안내</button>
          </footer>
          {notice && <p role="status">{notice}</p>}
        </section>
      )}
      {sceneEnabled && viewToggle}
    </>
  );
}

