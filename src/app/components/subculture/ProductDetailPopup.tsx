'use client';

import { StorefrontImage as Image } from './StorefrontImage';
import dynamic from 'next/dynamic';
import { Box, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type TouchEventHandler } from 'react';
import { getFashionCartItemKey, useFashionCart } from '@/app/context/FashionCartContext';
import { shouldBypassImageOptimization } from '@/lib/images';
import type { Product } from '@/lib/storefront/productCatalog';
import styles from './DetailPopup.module.css';

const Viewer3D = dynamic(() => import('@/components/common/Viewer3D').then((module) => module.Viewer3D), { ssr: false });
const SMARTSTORE_HOME_URL = 'https://smartstore.naver.com/xenicolack';

interface ProductDetailPopupProps {
  product: Product;
  onClose: () => void;
  initialImageIndex?: number;
  onAddToCart?: () => Promise<boolean>;
  onCheckout?: () => Promise<void> | void;
}

export function ProductDetailPopup(props: ProductDetailPopupProps) {
  return <ProductDetailContent key={props.product.id + ':' + (props.initialImageIndex ?? 0)} {...props} />;
}

function ProductDetailContent({ product, onClose, initialImageIndex = 0, onAddToCart, onCheckout }: ProductDetailPopupProps) {
  const { cart, addToCart, lastAddedItem } = useFashionCart();
  const overlayRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const pointerStartedOutside = useRef(false);
  const busyRef = useRef(false);
  const mountedRef = useRef(true);
  const [pending, setPending] = useState<'add' | 'checkout' | null>(null);
  const [error, setError] = useState('');
  const [viewMode, setViewMode] = useState<'photo' | '3d'>('photo');
  const [imageIndex, setImageIndex] = useState(() => Math.max(0, Math.floor(initialImageIndex) || 0));
  const allImages = useMemo(() => {
    const sources = Array.isArray(product.images) && product.images.length ? product.images : [product.image];
    return Array.from(new Set(sources.filter((url): url is string => typeof url === 'string' && Boolean(url.trim())).map((url) => url.trim())));
  }, [product.image, product.images]);
  const detailImage = useMemo(() => product.detailImageUrl?.trim() || allImages.find((url) => {
    const lower = url.toLowerCase();
    return lower.includes('상세페이지') || lower.includes('/detail_') || lower.includes('_detail_') || lower.includes('detail-page');
  }) || '', [allImages, product.detailImageUrl]);
  const images = useMemo(() => {
    const photos = allImages.filter((url) => url !== detailImage);
    return photos.length ? photos : allImages;
  }, [allImages, detailImage]);
  const activeIndex = images.length ? Math.min(imageIndex, images.length - 1) : 0;
  const activeImage = images[activeIndex] || '';
  const canSlide = images.length > 1;
  const modelUrl = product.modelUrl || Object.values(product.modelVariants || {}).find(Boolean);
  const activeViewMode = modelUrl ? viewMode : 'photo';
  const itemKey = getFashionCartItemKey(product.id, null);
  const isInCart = cart.some((item) => getFashionCartItemKey(item.id, item.selectedSize) === itemKey);
  const isSoldOut = Boolean(product.isSoldOut);
  const wasAdded = lastAddedItem?.itemKey === itemKey;
  const productStoreUrl = product.smartstoreUrl?.trim() || '';
  const hasProductStoreUrl = /^https?:\/\//i.test(productStoreUrl);
  const smartstoreUrl = hasProductStoreUrl ? productStoreUrl : SMARTSTORE_HOME_URL;

  useEffect(() => { closeRef.current = onClose; }, [onClose]);

  useEffect(() => {
    mountedRef.current = true;
    const dialog = dialogRef.current;
    const overlay = overlayRef.current;
    if (!dialog || !overlay) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    let outsideTouch: { x: number; y: number } | null = null;
    const focusFrame = requestAnimationFrame(() => dialog.focus({ preventScroll: true }));
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        closeRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'))
        .filter((element) => element.getClientRects().length > 0 && element.getAttribute('aria-hidden') !== 'true');
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) {
        event.preventDefault();
        dialog.focus({ preventScroll: true });
      } else if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog)) {
        event.preventDefault();
        first.focus();
      }
    };
    const keepFocus = (event: FocusEvent) => {
      if (event.target instanceof Node && !dialog.contains(event.target)) dialog.focus({ preventScroll: true });
    };
    const outsideWheel = (event: WheelEvent) => {
      const isVerticalScroll = !event.ctrlKey && Math.abs(event.deltaY) > 1 && Math.abs(event.deltaY) > Math.abs(event.deltaX);
      if (isVerticalScroll && event.target instanceof Node && !dialog.contains(event.target)) {
        event.preventDefault();
        closeRef.current();
      }
    };
    const startTouch = (event: TouchEvent) => {
      const point = event.touches.length === 1 ? event.touches[0] : undefined;
      outsideTouch = point && event.target instanceof Node && !dialog.contains(event.target)
        ? { x: point.clientX, y: point.clientY } : null;
    };
    const moveTouch = (event: TouchEvent) => {
      if (event.touches.length !== 1) {
        outsideTouch = null;
        return;
      }
      const point = event.touches[0];
      if (!outsideTouch || !point) return;
      const dx = Math.abs(point.clientX - outsideTouch.x);
      const dy = Math.abs(point.clientY - outsideTouch.y);
      if (dy > 14 && dy > dx * 1.2) {
        event.preventDefault();
        outsideTouch = null;
        closeRef.current();
      }
    };
    window.addEventListener('keydown', handleKey);
    document.addEventListener('focusin', keepFocus);
    overlay.addEventListener('wheel', outsideWheel, { passive: false });
    overlay.addEventListener('touchstart', startTouch, { passive: true });
    overlay.addEventListener('touchmove', moveTouch, { passive: false });
    return () => {
      mountedRef.current = false;
      cancelAnimationFrame(focusFrame);
      window.removeEventListener('keydown', handleKey);
      document.removeEventListener('focusin', keepFocus);
      overlay.removeEventListener('wheel', outsideWheel);
      overlay.removeEventListener('touchstart', startTouch);
      overlay.removeEventListener('touchmove', moveTouch);
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, []);

  const moveImage = (delta: number) => {
    if (canSlide) setImageIndex((current) => (Math.min(current, images.length - 1) + delta + images.length) % images.length);
  };
  const handleTouchStart: TouchEventHandler<HTMLDivElement> = (event) => {
    const point = event.touches.length === 1 ? event.touches[0] : undefined;
    touchStart.current = point ? { x: point.clientX, y: point.clientY } : null;
  };
  const handleTouchEnd: TouchEventHandler<HTMLDivElement> = (event) => {
    const start = touchStart.current;
    touchStart.current = null;
    const point = event.changedTouches[0];
    if (!start || !point || !canSlide) return;
    const dx = point.clientX - start.x;
    const dy = point.clientY - start.y;
    if (Math.abs(dx) >= 45 && Math.abs(dx) > Math.abs(dy) * 1.25) moveImage(dx < 0 ? 1 : -1);
  };
  const handleAdd = async () => {
    if (isSoldOut || busyRef.current) return;
    busyRef.current = true;
    setPending('add');
    setError('');
    try {
      if (onAddToCart) {
        const added = await onAddToCart();
        if (!added) return;
      } else if (isInCart) {
        closeRef.current();
      } else {
        addToCart({ id: product.id, name: product.name, price: product.price, quantity: 1, image: product.image, category: product.category });
      }
    } catch {
      if (mountedRef.current) setError('장바구니에 담지 못했습니다. 다시 시도해 주세요.');
    } finally {
      busyRef.current = false;
      if (mountedRef.current) setPending(null);
    }
  };
  const handleCheckout = async () => {
    if (isSoldOut || busyRef.current || !onCheckout) return;
    busyRef.current = true;
    setPending('checkout');
    setError('');
    try {
      // The parent verifies current inventory, adds the current product, and opens the real cart.
      await onCheckout();
    } catch {
      if (mountedRef.current) setError('주문 화면을 열지 못했습니다. 다시 시도해 주세요.');
    } finally {
      busyRef.current = false;
      if (mountedRef.current) setPending(null);
    }
  };

  return (
    <div
      ref={overlayRef}
      className={styles.backdrop}
      onPointerDown={(event) => { pointerStartedOutside.current = event.target === event.currentTarget; }}
      onClick={(event) => { if (event.target === event.currentTarget && pointerStartedOutside.current) closeRef.current(); }}
    >
      <div ref={dialogRef} className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="product-detail-title" tabIndex={-1}>
        <header className={styles.header}>
          <div className={styles.headerTitle}>
            <p className={styles.eyebrow}>ENICO VECK / {product.category}</p>
            <h2 id="product-detail-title" className={styles.title}>{product.name}</h2>
          </div>
          <button type="button" className={styles.iconButton} onClick={() => closeRef.current()} aria-label="상품 상세 닫기"><X size={20} /></button>
        </header>
        <div className={styles.overview}>
          <section className={styles.gallery} aria-label="상품 이미지">
            {modelUrl && (
              <div className={styles.tabs} role="tablist" aria-label="상품 보기 방식">
                <button type="button" className={styles.tab} role="tab" aria-selected={activeViewMode === 'photo'} aria-controls="product-photo-panel" onClick={() => setViewMode('photo')}>상품 사진</button>
                <button type="button" className={styles.tab} role="tab" aria-selected={activeViewMode === '3d'} aria-controls="product-model-panel" onClick={() => setViewMode('3d')}><Box size={15} />3D VIEW</button>
              </div>
            )}
            {activeViewMode === '3d' && modelUrl ? (
              <div id="product-model-panel" className={styles.viewer} role="tabpanel" aria-label="3D 상품 보기">
                <Viewer3D key={product.id + '-' + modelUrl} modelUrl={modelUrl} variants={product.modelVariants} fallbackImageUrl={product.image} title={product.name} embedded />
              </div>
            ) : (
              <div id="product-photo-panel">
                <div
                  className={styles.mainImage}
                  onTouchStart={handleTouchStart}
                  onTouchEnd={handleTouchEnd}
                  onTouchCancel={() => { touchStart.current = null; }}
                  onKeyDown={(event) => {
                    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
                      event.preventDefault();
                      moveImage(event.key === 'ArrowLeft' ? -1 : 1);
                    }
                  }}
                  tabIndex={canSlide ? 0 : undefined}
                  role="group"
                  aria-label="상품 사진, 좌우 방향키로 이동"
                >
                  {activeImage ? (
                    <Image key={activeImage} src={activeImage} alt={product.name + ' — ' + (activeIndex + 1)} fill priority sizes="(max-width: 820px) 100vw, 540px" unoptimized={shouldBypassImageOptimization(activeImage)} draggable={false} />
                  ) : <p className={styles.empty}>등록된 상품 이미지가 없습니다.</p>}
                  {canSlide && <>
                    <button type="button" className={styles.arrow + ' ' + styles.previous} onClick={() => moveImage(-1)} aria-label="이전 상품 사진"><ChevronLeft size={21} /></button>
                    <button type="button" className={styles.arrow + ' ' + styles.next} onClick={() => moveImage(1)} aria-label="다음 상품 사진"><ChevronRight size={21} /></button>
                  </>}
                  {images.length > 0 && <p className={styles.imageCount} aria-live="polite">{activeIndex + 1} / {images.length}</p>}
                </div>
                {canSlide && <div className={styles.thumbnails} aria-label="상품 사진 선택">
                  {images.map((src, index) => <button type="button" key={src} className={styles.thumbnail} onClick={() => setImageIndex(index)} aria-label={(index + 1) + '번 상품 사진'} aria-current={index === activeIndex ? 'true' : undefined}>
                    <Image src={src} alt="" fill sizes="72px" unoptimized={shouldBypassImageOptimization(src)} />
                  </button>)}
                </div>}
              </div>
            )}
          </section>
          <section className={styles.info} aria-label="상품 정보">
            <p className={styles.eyebrow}>{product.category}</p>
            <h3 className={styles.productName}>{product.name}</h3>
            <div className={styles.priceRow}>
              <p className={styles.price}>₩{product.price.toLocaleString('ko-KR')}</p>
              {isSoldOut && <span className={styles.soldOut}>SOLD OUT</span>}
            </div>
            <p className={styles.description}>{product.description}</p>
            <div className={styles.actions}>
              <button type="button" className={styles.action + ' ' + styles.primary} onClick={handleAdd} disabled={isSoldOut || pending !== null}>
                {isSoldOut ? '품절' : pending === 'add' ? '재고 확인 중…' : isInCart ? '장바구니 담김' : '장바구니 담기'}
              </button>
              {onCheckout && <button type="button" className={styles.action + ' ' + styles.checkout} onClick={handleCheckout} disabled={isSoldOut || pending !== null}>
                {isSoldOut ? '품절' : pending === 'checkout' ? '주문 준비 중…' : '바로 구매'}
              </button>}
              <button type="button" className={styles.action} disabled={isSoldOut || pending !== null} onClick={() => {
                if (!isSoldOut && !busyRef.current) window.open(smartstoreUrl, '_blank', 'noopener,noreferrer');
              }}>
                <span className={styles.naverIcon} aria-hidden="true">N</span>
                {hasProductStoreUrl ? '네이버에서 구매' : '스마트스토어 방문'}
              </button>
              <p className={styles.feedback} role="status" aria-live="polite">{error || (wasAdded && !isSoldOut ? '장바구니에 담았습니다.' : '')}</p>
            </div>
            <dl className={styles.metadata}><dt>CATEGORY</dt><dd>{product.category}</dd></dl>
          </section>
        </div>
        {detailImage && <section className={styles.details} aria-label="상품 상세 이미지">
          <h3 className={styles.sectionTitle}>PRODUCT DETAILS</h3>
          {/* The original long image keeps its natural ratio and full width. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={detailImage} alt={product.name + ' 상세 정보'} className={styles.longImage} loading="lazy" decoding="async" />
        </section>}
        {images.length > 1 && <section className={styles.details} aria-label="상품 추가 사진">
          <h3 className={styles.sectionTitle}>MORE PHOTOS</h3>
          <div className={styles.additionalImages}>{images.slice(1).map((src, offset) => <button type="button" key={src} className={styles.additionalImage} onClick={() => {
            setImageIndex(offset + 1);
            setViewMode('photo');
            dialogRef.current?.scrollTo({ top: 0, behavior: 'auto' });
          }} aria-label={(offset + 2) + '번 상품 사진 크게 보기'}>
            <Image src={src} alt={product.name + ' 추가 사진 ' + (offset + 1)} fill sizes="(max-width: 820px) 50vw, 540px" unoptimized={shouldBypassImageOptimization(src)} />
          </button>)}</div>
        </section>}
      </div>
    </div>
  );
}
