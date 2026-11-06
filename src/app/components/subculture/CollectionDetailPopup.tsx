'use client';

import { StorefrontImage as Image } from './StorefrontImage';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type TouchEventHandler } from 'react';
import { shouldBypassImageOptimization } from '@/lib/images';
import type { Collection } from '@/lib/storefront/collectionCatalog';
import styles from './DetailPopup.module.css';

interface CollectionDetailPopupProps {
  collection: Collection;
  onClose: () => void;
  initialImageIndex?: number;
}

export function CollectionDetailPopup(props: CollectionDetailPopupProps) {
  return <CollectionDetailContent key={props.collection.id + ':' + (props.initialImageIndex ?? 0)} {...props} />;
}

function CollectionDetailContent({ collection, onClose, initialImageIndex = 0 }: CollectionDetailPopupProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  const pointerStartedOutside = useRef(false);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const [imageIndex, setImageIndex] = useState(() => Math.max(0, Math.floor(initialImageIndex) || 0));
  const images = useMemo(() => {
    const sources = Array.isArray(collection.images) && collection.images.length ? collection.images : [collection.image];
    return Array.from(new Set(sources.filter((url): url is string => typeof url === 'string' && Boolean(url.trim())).map((url) => url.trim())));
  }, [collection.image, collection.images]);
  const activeIndex = images.length ? Math.min(imageIndex, images.length - 1) : 0;
  const activeImage = images[activeIndex] || '';
  const canSlide = images.length > 1;
  const season = collection.season?.trim() || '';
  const releaseDate = collection.releaseDate?.trim() || '';
  const fullDescription = collection.fullDescription?.trim() || '';
  const description = fullDescription && fullDescription !== '상세 설명 없음' ? collection.fullDescription : collection.description;
  const showItems = Number.isFinite(collection.items) && collection.items > 0;

  useEffect(() => { closeRef.current = onClose; }, [onClose]);

  useEffect(() => {
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

  return (
    <div
      ref={overlayRef}
      className={styles.backdrop}
      onPointerDown={(event) => { pointerStartedOutside.current = event.target === event.currentTarget; }}
      onClick={(event) => { if (event.target === event.currentTarget && pointerStartedOutside.current) closeRef.current(); }}
    >
      <div ref={dialogRef} className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="collection-detail-title" tabIndex={-1}>
        <header className={styles.header}>
          <div className={styles.headerTitle}>
            <p className={styles.eyebrow}>ENICO VECK / COLLECTION</p>
            <h2 id="collection-detail-title" className={styles.title}>{collection.title}</h2>
          </div>
          <button type="button" className={styles.iconButton} onClick={() => closeRef.current()} aria-label="컬렉션 상세 닫기"><X size={20} /></button>
        </header>
        <div className={styles.overview}>
          <section className={styles.gallery} aria-label="컬렉션 이미지">
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
              aria-label="컬렉션 사진, 좌우 방향키로 이동"
            >
              {activeImage ? (
                <Image key={activeImage} src={activeImage} alt={collection.title + ' — ' + (activeIndex + 1)} fill priority sizes="(max-width: 820px) 100vw, 540px" unoptimized={shouldBypassImageOptimization(activeImage)} draggable={false} />
              ) : <p className={styles.empty}>등록된 컬렉션 이미지가 없습니다.</p>}
              {canSlide && <>
                <button type="button" className={styles.arrow + ' ' + styles.previous} onClick={() => moveImage(-1)} aria-label="이전 컬렉션 사진"><ChevronLeft size={21} /></button>
                <button type="button" className={styles.arrow + ' ' + styles.next} onClick={() => moveImage(1)} aria-label="다음 컬렉션 사진"><ChevronRight size={21} /></button>
              </>}
              {images.length > 0 && <p className={styles.imageCount} aria-live="polite">{activeIndex + 1} / {images.length}</p>}
            </div>
            {canSlide && <div className={styles.thumbnails} aria-label="컬렉션 사진 선택">
              {images.map((src, index) => <button type="button" key={src} className={styles.thumbnail} onClick={() => setImageIndex(index)} aria-label={(index + 1) + '번 컬렉션 사진'} aria-current={index === activeIndex ? 'true' : undefined}>
                <Image src={src} alt="" fill sizes="72px" unoptimized={shouldBypassImageOptimization(src)} />
              </button>)}
            </div>}
          </section>
          <section className={styles.info} aria-label="컬렉션 정보">
            <p className={styles.eyebrow}>COLLECTION {season && season !== '-' ? '/ ' + season : ''}</p>
            <h3 className={styles.productName}>{collection.title}</h3>
            {description && <p className={styles.description}>{description}</p>}
            <dl className={styles.metadata}>
              {season && season !== '-' && <><dt>SEASON</dt><dd>{season}</dd></>}
              {releaseDate && releaseDate !== '-' && <><dt>RELEASE</dt><dd>{releaseDate}</dd></>}
              {showItems && <><dt>LOOKS</dt><dd>{collection.items}</dd></>}
              <dt>FRAMES</dt><dd>{images.length}</dd>
            </dl>
          </section>
        </div>
      </div>
    </div>
  );
}
