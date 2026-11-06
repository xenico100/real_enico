'use client';

import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CorridorShowroom } from '@/app/components/subculture/CorridorShowroom';
import { CollectionDetailPopup } from '@/app/components/subculture/CollectionDetailPopup';
import { SubcultureFooter } from '@/app/components/subculture/SubcultureFooter';
import { FashionCartProvider, useFashionCart } from '@/app/context/FashionCartContext';
import { trackStorefrontEvent } from '@/app/components/system/VisitTracker';
import { useStorefrontCatalog } from '@/lib/storefront/useStorefrontCatalog';
import { isPurchasableProduct, visibleCorridorProducts, type CorridorEvent } from '@/lib/storefront/corridorBridge';
import type { Collection } from '@/lib/storefront/collectionCatalog';
import type { Product } from '@/lib/storefront/productCatalog';
import styles from '@/app/components/subculture/CorridorShowroom.module.css';

const CartOverlay = lazy(() => import('@/app/components/subculture/CartOverlay').then(mod => ({ default: mod.CartOverlay })));
const InfoPopup = lazy(() => import('@/app/components/subculture/InfoPopup').then(mod => ({ default: mod.InfoPopup })));
const ProductDetailPopup = lazy(() => import('@/app/components/subculture/ProductDetailPopup').then(mod => ({ default: mod.ProductDetailPopup })));
const RandomChatModal = lazy(() => import('@/features/randomChat/RandomChatModal').then(mod => ({ default: mod.RandomChatModal })));

type MyPageTab = 'overview' | 'orders' | 'saved' | 'cart' | 'profile' | 'dailyStats' | 'members' | 'adminOrders';
interface AppProps {
  initialProducts?: Product[];
  usingFallbackProducts?: boolean;
  initialCollections?: Collection[];
  usingFallbackCollections?: boolean;
  initialPopup?: 'about' | 'contact' | 'mypage' | null;
  initialProductId?: string;
  initialMyPageTab?: MyPageTab;
}
type Overlay =
  | { type: 'product'; id: string; imageIndex: number }
  | { type: 'collection'; id: string; imageIndex: number }
  | { type: 'info'; info: 'about' | 'contact' | 'mypage'; tab?: MyPageTab }
  | { type: 'cart' | 'community' | 'shop' };

export default function App(props: AppProps) {
  return <FashionCartProvider><Storefront {...props} /></FashionCartProvider>;
}

function Storefront({ initialProducts = [], initialCollections = [], initialPopup, initialProductId, initialMyPageTab }: AppProps) {
  const { products, collections, isLoading, error, refresh } = useStorefrontCatalog(initialProducts, initialCollections);
  const { cart, addToCart, removeFromCart } = useFashionCart();
  const [activeOverlay, setActiveOverlay] = useState<Overlay | null>(null);
  const [ignoreInitial, setIgnoreInitial] = useState(false);
  const [notice, setNotice] = useState('');
  const pendingAdds = useRef(new Set<string>());
  const overlayIntent = useRef(0);
  const productList = useMemo(() => visibleCorridorProducts(products), [products]);
  const initialOverlay: Overlay | null = ignoreInitial ? null : initialPopup
    ? { type: 'info', info: initialPopup, tab: initialMyPageTab }
    : initialProductId && productList.some(product => product.id === initialProductId)
      ? { type: 'product', id: initialProductId, imageIndex: 0 } : null;
  const overlay = activeOverlay || initialOverlay;
  const shownProduct = overlay?.type === 'product' ? productList.find(product => product.id === overlay.id) : undefined;
  const shownCollection = overlay?.type === 'collection' ? collections.find(collection => collection.id === overlay.id) : undefined;
  const overlayOpen = Boolean(overlay && (overlay.type !== 'product' || shownProduct) && (overlay.type !== 'collection' || shownCollection));

  const closeOverlay = useCallback(() => {
    overlayIntent.current += 1;
    setActiveOverlay(null);
    setIgnoreInitial(true);
    const url = new URL(window.location.href);
    const hadPopup = url.searchParams.has('popup') || url.searchParams.has('product');
    url.searchParams.delete('popup');
    url.searchParams.delete('product');
    url.searchParams.delete('tab');
    // Closing a panel only changes its query; a route transition would replace the scene.
    if (hadPopup) window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
  }, []);

  const openOverlay = useCallback((next: Overlay) => {
    overlayIntent.current += 1;
    setIgnoreInitial(true);
    setNotice('');
    setActiveOverlay(next);
  }, []);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(''), 5000);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  // Inventory updates also apply to an already-open cart. A sold item cannot linger as purchasable.
  useEffect(() => {
    if (!products.length && (isLoading || error)) return;
    let removed = false;
    for (const item of cart) {
      const product = products.find(candidate => candidate.id === item.id);
      if (!isPurchasableProduct(product)) {
        removeFromCart(item.id, item.selectedSize);
        removed = true;
      } else if (product.price !== item.price || product.name !== item.name || product.image !== item.image) {
        removeFromCart(item.id, item.selectedSize);
        addToCart({ ...item, name: product.name, price: product.price, image: product.image, category: product.category });
      }
    }
    if (removed) setNotice('품절되었거나 판매가 종료된 상품을 장바구니에서 제외했어요.');
  }, [products, cart, addToCart, removeFromCart, isLoading, error]);

  const addCurrentProduct = useCallback(async (id: string, reply: (message: string) => void = setNotice) => {
    if (pendingAdds.current.has(id)) return false;
    pendingAdds.current.add(id);
    try {
      const current = await refresh();
      if (!current) { reply('재고를 확인하지 못했어요. 잠시 뒤 다시 시도해 주세요.'); return false; }
      const product = current.products.find(candidate => candidate.id === id);
      if (!isPurchasableProduct(product)) { reply('품절되었거나 판매가 종료된 상품입니다.'); return false; }
      const existing = cart.some(item => item.id === id);
      addToCart({ id: product.id, name: product.name, price: product.price, quantity: 1, image: product.image, category: product.category });
      reply(existing ? '이미 장바구니에 담긴 상품입니다.' : `${product.name} 장바구니에 담겼습니다.`);
      return true;
    } finally { pendingAdds.current.delete(id); }
  }, [addToCart, cart, refresh]);

  const openCart = useCallback(() => {
    // Show the cart immediately; refresh must not delay or override the next navigation.
    openOverlay({ type: 'cart' });
    void refresh();
    trackStorefrontEvent({ type: 'cart_open', target: 'corridor' });
  }, [openOverlay, refresh]);

  const handleCommand = useCallback((command: CorridorEvent, reply: (message: string) => void) => {
    switch (command.type) {
      case 'select': {
        const product = productList.find(item => item.id === command.id);
        if (command.kind === 'product' && product) trackStorefrontEvent({ type: 'product_click', target: product.id, detail: product.name });
        break;
      }
      case 'open-product':
        if (productList.some(product => product.id === command.id)) openOverlay({ type: 'product', id: command.id, imageIndex: command.imageIndex });
        break;
      case 'open-collection':
        if (collections.some(collection => collection.id === command.id)) openOverlay({ type: 'collection', id: command.id, imageIndex: command.imageIndex });
        break;
      case 'add-to-cart': void addCurrentProduct(command.id, reply); break;
      case 'open-cart': void openCart(); break;
      case 'open-info':
        openOverlay({ type: 'info', info: command.info });
        trackStorefrontEvent({ type: 'tab_click', target: command.info });
        break;
      case 'open-community':
        openOverlay({ type: 'community' });
        trackStorefrontEvent({ type: 'tab_click', target: 'randomChat' });
        break;
      case 'open-shop-info': openOverlay({ type: 'shop' }); break;
      case 'close-overlay': closeOverlay(); break;
    }
  }, [addCurrentProduct, closeOverlay, collections, openCart, openOverlay, productList]);

  return (
    <div className="relative min-h-dvh w-full bg-[#f8f9fa] font-mono text-[#111827] selection:bg-[#b8001f] selection:text-white">
      <main>
        {productList.length || collections.length ? (
          <CorridorShowroom products={products} collections={collections} overlayOpen={overlayOpen} onCommand={handleCommand} />
        ) : (
          <section className={styles.loading} role="status">
            <h1>ENICO VECK</h1>
            <p>{isLoading ? 'ARCHIVE / INDEXING' : error ? '상품을 불러오지 못했어요. 연결을 확인하고 다시 시도해 주세요.' : '현재 전시 중인 상품이 없습니다.'}</p>
            {!isLoading && <button type="button" onClick={() => void refresh()}>다시 시도</button>}
          </section>
        )}
      </main>
      {notice && <div role="status" className="fixed bottom-6 left-1/2 z-[120] max-w-[calc(100%_-_32px)] -translate-x-1/2 border border-[#d1d5db] bg-white px-5 py-3 text-center text-sm shadow-lg">{notice}</div>}
      <Suspense fallback={<OverlayLoading onClose={closeOverlay} />}>
      {overlay?.type === 'cart' && <CartOverlay isOpen onClose={closeOverlay} onOpenLogin={() => openOverlay({ type: 'info', info: 'mypage' })} onOpenMyPageOrders={() => openOverlay({ type: 'info', info: 'mypage', tab: 'orders' })} />}
      {overlay?.type === 'info' && <InfoPopup key={overlay.info} type={overlay.info} initialMyPageTab={overlay.tab} onClose={closeOverlay} onOpenContact={() => openOverlay({ type: 'info', info: 'contact' })} onOpenCart={openCart} />}
      {shownProduct && overlay?.type === 'product' && (
        <ProductDetailPopup key={shownProduct.id} product={shownProduct} initialImageIndex={overlay.imageIndex} onClose={closeOverlay}
          onAddToCart={() => addCurrentProduct(shownProduct.id)}
          onCheckout={async () => {
            const intent = overlayIntent.current;
            if (await addCurrentProduct(shownProduct.id) && intent === overlayIntent.current) openOverlay({ type: 'cart' });
          }} />
      )}
      {shownCollection && overlay?.type === 'collection' && <CollectionDetailPopup key={shownCollection.id} collection={shownCollection} initialImageIndex={overlay.imageIndex} onClose={closeOverlay} />}
      {overlay?.type === 'community' && <RandomChatModal open onClose={closeOverlay} />}
      {overlay?.type === 'shop' && <ShopInfo onClose={closeOverlay} />}
      </Suspense>
    </div>
  );
}

function OverlayLoading({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className={styles.overlayLoading} onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-label="화면 준비 중" className={styles.overlayLoadingPanel}>
        <span className={styles.overlayBrand}>ENICO VECK<span>®</span></span>
        <span className={styles.loadTrack} aria-hidden="true"><i /></span>
        <p role="status" aria-live="polite" className={styles.overlayLabel}>ACCESSING / ARCHIVE</p>
        <button type="button" onClick={onClose}>닫기 ×</button>
      </section>
    </div>
  );
}

function ShopInfo({ onClose }: { onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className={styles.shopBackdrop} onClick={event => { if (event.target === event.currentTarget) onClose(); }} onWheel={event => { if (event.target === event.currentTarget && Math.abs(event.deltaY) > 1) onClose(); }}>
      <section className={styles.shopPanel} role="dialog" aria-modal="true" aria-labelledby="shop-info-title">
        <header className={styles.shopHeader}><h2 id="shop-info-title">SHOP INFO</h2><button ref={closeRef} type="button" onClick={onClose} aria-label="사업자 정보 닫기">×</button></header>
        <SubcultureFooter />
      </section>
    </div>
  );
}
