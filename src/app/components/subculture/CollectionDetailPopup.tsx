'use client';

import Image from 'next/image';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState, type TouchEventHandler } from 'react';
import { shouldBypassImageOptimization } from '@/lib/images';
import type { Collection } from '@/lib/storefront/collectionCatalog';

interface CollectionDetailPopupProps {
  collection: Collection;
  onClose: () => void;
}

export function CollectionDetailPopup({ collection, onClose }: CollectionDetailPopupProps) {
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [direction, setDirection] = useState(0);
  const touchStartX = useRef<number | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  const imageList =
    Array.isArray(collection.images) && collection.images.length > 0
      ? collection.images
      : collection.image
        ? [collection.image]
        : [];

  const hasImages = imageList.length > 0;
  const hasMultipleImages = imageList.length > 1;
  const safeImageIndex = hasImages ? ((currentImageIndex % imageList.length) + imageList.length) % imageList.length : 0;
  const season = collection.season?.trim() || '';
  const showSeason = season.length > 0 && season !== '-';
  const fullDescription = collection.fullDescription?.trim() || '';
  const showDescription = fullDescription.length > 0 && fullDescription !== '상세 설명 없음';
  const releaseDate = collection.releaseDate?.trim() || '';
  const showReleaseDate = releaseDate.length > 0 && releaseDate !== '-';
  const showItems = Number.isFinite(collection.items) && collection.items > 0;

  const nextImage = () => {
    if (!hasMultipleImages) return;
    setDirection(1);
    setCurrentImageIndex((prev) => prev + 1);
  };

  const prevImage = () => {
    if (!hasMultipleImages) return;
    setDirection(-1);
    setCurrentImageIndex((prev) => prev - 1);
  };

  const jumpToImage = (index: number) => {
    if (!hasImages || index === safeImageIndex) return;
    setDirection(index > safeImageIndex ? 1 : -1);
    setCurrentImageIndex(index);
  };

  useEffect(() => {
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }

      if (!hasMultipleImages) return;
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        setDirection(-1);
        setCurrentImageIndex((previous) => previous - 1);
      }

      if (event.key === 'ArrowRight') {
        event.preventDefault();
        setDirection(1);
        setCurrentImageIndex((previous) => previous + 1);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      previousFocusRef.current?.focus();
    };
  }, [hasMultipleImages, onClose]);

  const handleTouchStart: TouchEventHandler<HTMLDivElement> = (event) => {
    touchStartX.current = event.changedTouches[0]?.clientX ?? null;
  };

  const handleTouchEnd: TouchEventHandler<HTMLDivElement> = (event) => {
    if (!hasImages || imageList.length <= 1 || touchStartX.current === null) return;
    const endX = event.changedTouches[0]?.clientX ?? touchStartX.current;
    const deltaX = endX - touchStartX.current;

    if (Math.abs(deltaX) < 36) return;
    if (deltaX < 0) {
      nextImage();
    } else {
      prevImage();
    }
    touchStartX.current = null;
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[70] flex items-center justify-center overflow-hidden bg-white/90 backdrop-blur-md px-2 pt-[calc(env(safe-area-inset-top)+8px)] pb-[calc(env(safe-area-inset-bottom)+8px)] md:p-5"
        data-lenis-prevent
        onClick={onClose}
      >
        <motion.div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="collection-detail-title"
          tabIndex={-1}
          initial={{ y: 30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 30, opacity: 0 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
          className="relative flex h-full w-full max-w-[1480px] flex-col overflow-hidden rounded-[20px] border border-[#d1d5db] bg-white text-[#111827] shadow-[0_40px_120px_rgba(184,0,31,0.15)] md:h-[min(940px,calc(100dvh-2.5rem))] md:w-[min(1480px,calc(100vw-2.5rem))] md:rounded-[24px]"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="absolute left-0 top-0 h-[2px] w-full bg-gradient-to-r from-[#b8001f]/60 via-[#b8001f]/20 to-transparent" />

          <header className="relative z-10 border-b border-[#d1d5db] bg-[#f8f9fa]/95 px-4 py-4 md:px-7 md:py-5">
            <div className="pr-14">
              <div className="flex flex-wrap items-center gap-2 font-mono text-[10px] uppercase tracking-[0.32em] text-[#4b5563]">
                <span className="rounded-full border border-[#d1d5db] bg-white px-3 py-1 text-[#111827] font-bold shadow-sm">
                  Collection Lookbook
                </span>
                {showSeason ? <span className="font-semibold">{season}</span> : null}
                <span className="font-semibold">{hasImages ? `${imageList.length} pages` : '0 pages'}</span>
              </div>
              <div className="mt-3 flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
                <div className="max-w-5xl">
                  <h2
                    id="collection-detail-title"
                    className="font-heading text-[2rem] uppercase leading-[0.88] tracking-[-0.04em] text-[#111827] md:text-[3.3rem] font-black"
                  >
                    {collection.title}
                  </h2>
                  {showDescription ? (
                    <p className="mt-2 max-w-3xl font-mono text-[12px] leading-relaxed text-[#4b5563] md:text-[13px] font-medium">
                      {fullDescription}
                    </p>
                  ) : null}
                </div>
                <div className="flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.25em] text-[#4b5563] font-bold">
                  <button
                    type="button"
                    onClick={prevImage}
                    disabled={!hasMultipleImages}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#d1d5db] bg-white text-[#111827] shadow-sm transition-colors hover:border-[#b8001f] hover:bg-[#b8001f] hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
                    aria-label="이전 페이지"
                  >
                    <ChevronLeft size={18} />
                  </button>
                  <span className="min-w-[80px] text-center text-[#111827] font-bold">
                    {hasImages
                      ? `${String(safeImageIndex + 1).padStart(2, '0')} / ${String(imageList.length).padStart(2, '0')}`
                      : '00 / 00'}
                  </span>
                  <button
                    type="button"
                    onClick={nextImage}
                    disabled={!hasMultipleImages}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#d1d5db] bg-white text-[#111827] shadow-sm transition-colors hover:border-[#b8001f] hover:bg-[#b8001f] hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
                    aria-label="다음 페이지"
                  >
                    <ChevronRight size={18} />
                  </button>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="absolute right-4 top-4 inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#d1d5db] bg-white text-[#111827] shadow-sm transition-colors hover:border-[#b8001f] hover:bg-[#b8001f] hover:text-white md:right-6 md:top-5"
              aria-label="컬렉션 닫기"
            >
              <X size={18} />
            </button>
          </header>

          <div className="relative z-10 grid min-h-0 flex-1 grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px]">
            <div className="min-h-0 p-3 md:p-5 flex items-center justify-center">
              <div
                className="relative flex h-full w-full min-h-[46vh] items-center justify-center overflow-hidden rounded-[20px] border border-[#d1d5db] bg-[#f8f9fa] p-4 md:p-8 shadow-inner"
                onTouchStart={handleTouchStart}
                onTouchEnd={handleTouchEnd}
              >
                {hasImages ? (
                  <>
                    <button
                      type="button"
                      onClick={prevImage}
                      disabled={!hasMultipleImages}
                      className="absolute left-3 top-1/2 z-20 inline-flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-black/15 bg-white/90 text-[#111827] shadow-md backdrop-blur transition-all hover:border-[#b8001f] hover:bg-[#b8001f] hover:text-white disabled:cursor-not-allowed disabled:opacity-25 md:left-6"
                      aria-label="이전 페이지 보기"
                    >
                      <ChevronLeft size={22} />
                    </button>

                    <AnimatePresence custom={direction} mode="wait">
                      <motion.div
                        key={imageList[safeImageIndex]}
                        custom={direction}
                        initial={{ opacity: 0, scale: 0.98 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.98 }}
                        transition={{ duration: 0.2, ease: 'easeOut' }}
                        className="relative h-full w-full max-w-4xl max-h-[75vh] flex items-center justify-center"
                      >
                        <Image
                          src={imageList[safeImageIndex]}
                          alt={`${collection.title} 컬렉션 이미지 ${safeImageIndex + 1}`}
                          fill
                          priority
                          unoptimized={shouldBypassImageOptimization(imageList[safeImageIndex] || '')}
                          sizes="(max-width: 1280px) 100vw, 75vw"
                          className="object-contain"
                        />
                      </motion.div>
                    </AnimatePresence>

                    <button
                      type="button"
                      onClick={nextImage}
                      disabled={!hasMultipleImages}
                      className="absolute right-3 top-1/2 z-20 inline-flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-black/15 bg-white/90 text-[#111827] shadow-md backdrop-blur transition-all hover:border-[#b8001f] hover:bg-[#b8001f] hover:text-white disabled:cursor-not-allowed disabled:opacity-25 md:right-6"
                      aria-label="다음 페이지 보기"
                    >
                      <ChevronRight size={22} />
                    </button>
                  </>
                ) : (
                  <div className="flex h-full w-full items-center justify-center font-mono text-xs uppercase tracking-[0.3em] text-[#4b5563] font-bold">
                    Image Missing
                  </div>
                )}

                <div className="pointer-events-none absolute bottom-4 left-4 rounded-full border border-black/15 bg-white/90 px-3.5 py-1.5 font-mono text-[11px] uppercase tracking-[0.25em] text-[#111827] font-bold shadow-sm backdrop-blur md:bottom-6 md:left-6">
                  Page {hasImages ? String(safeImageIndex + 1).padStart(2, '0') : '00'}
                </div>
              </div>
            </div>

            <aside className="hidden min-h-0 overflow-y-auto border-l border-[#d1d5db] bg-[#f8f9fa] xl:block">
              <div className="space-y-4 p-5">
                <section className="rounded-[16px] border border-[#d1d5db] bg-white p-4 shadow-sm">
                  <p className="font-mono text-[10px] uppercase tracking-[0.34em] text-[#b8001f] font-bold">
                    Editorial Note
                  </p>
                  <p className="mt-3 text-sm leading-7 text-[#111827] font-medium">
                    {showDescription
                      ? fullDescription
                      : '실제 디자이너 브랜드 컬렉션을 보는 것처럼, 한 장씩 넘기며 룩을 확인하는 뷰어 모드입니다.'}
                  </p>
                </section>

                <section className="rounded-[16px] border border-[#d1d5db] bg-white p-4 font-mono text-[11px] uppercase tracking-[0.22em] text-[#4b5563] shadow-sm font-semibold">
                  <div className="grid grid-cols-[92px_minmax(0,1fr)] gap-3">
                    <span className="font-bold">Title</span>
                    <span className="break-words text-[#111827] font-bold">{collection.title}</span>
                  </div>
                  {showSeason ? (
                    <div className="mt-4 grid grid-cols-[92px_minmax(0,1fr)] gap-3">
                      <span className="font-bold">Season</span>
                      <span className="text-[#111827] font-bold">{season}</span>
                    </div>
                  ) : null}
                  {showReleaseDate ? (
                    <div className="mt-4 grid grid-cols-[92px_minmax(0,1fr)] gap-3">
                      <span className="font-bold">Release</span>
                      <span className="text-[#111827] font-bold">{releaseDate}</span>
                    </div>
                  ) : null}
                  {showItems ? (
                    <div className="mt-4 grid grid-cols-[92px_minmax(0,1fr)] gap-3">
                      <span className="font-bold">Looks</span>
                      <span className="text-[#111827] font-bold">{collection.items}</span>
                    </div>
                  ) : null}
                  <div className="mt-4 grid grid-cols-[92px_minmax(0,1fr)] gap-3">
                    <span className="font-bold">Frames</span>
                    <span className="text-[#111827] font-bold">{imageList.length}</span>
                  </div>
                </section>
              </div>
            </aside>
          </div>

          {hasImages ? (
            <footer className="relative z-10 border-t border-[#d1d5db] bg-[#f8f9fa] px-3 py-3 md:px-5 md:py-4">
              <div className="mb-2 flex items-center justify-between gap-3">
                <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-[#b8001f] font-bold">
                  Thumbnail Strip
                </p>
                <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#4b5563] font-semibold">
                  아래 사진을 클릭해 바로 이동
                </p>
              </div>

              <div className="flex gap-2 overflow-x-auto pb-1 md:gap-3">
                {imageList.map((image, index) => (
                  <button
                    key={`${image}-${index}`}
                    type="button"
                    onClick={() => jumpToImage(index)}
                    className={`group relative h-20 w-14 shrink-0 overflow-hidden rounded-[12px] border transition-all md:h-24 md:w-16 ${
                      index === safeImageIndex
                        ? 'border-[#b8001f] bg-white ring-2 ring-[#b8001f] shadow-sm'
                        : 'border-[#d1d5db] bg-white hover:border-[#b8001f]/60'
                    }`}
                    aria-label={`컬렉션 이미지 ${index + 1} 보기`}
                  >
                    <Image
                      src={image}
                      alt={`컬렉션 썸네일 ${index + 1}`}
                      fill
                      unoptimized={shouldBypassImageOptimization(image)}
                      sizes="96px"
                      className="object-cover transition-transform duration-300 group-hover:scale-[1.04]"
                    />
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent px-2 pb-2 pt-6 text-left">
                      <span className="font-mono text-[10px] uppercase tracking-[0.28em] text-white font-bold">
                        {String(index + 1).padStart(2, '0')}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </footer>
          ) : null}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
