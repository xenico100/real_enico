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

  const imageList =
    Array.isArray(collection.images) && collection.images.length > 0
      ? collection.images
      : collection.image
        ? [collection.image]
        : [];

  const hasImages = imageList.length > 0;
  const hasMultipleImages = imageList.length > 1;
  const safeImageIndex = hasImages ? ((currentImageIndex % imageList.length) + imageList.length) % imageList.length : 0;
  const prevPreviewImage =
    hasMultipleImages ? imageList[(safeImageIndex - 1 + imageList.length) % imageList.length] : null;
  const nextPreviewImage =
    hasMultipleImages ? imageList[(safeImageIndex + 1) % imageList.length] : null;
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
    setCurrentImageIndex(0);
    setDirection(0);
  }, [collection.id]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
        return;
      }

      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        prevImage();
      }

      if (event.key === 'ArrowRight') {
        event.preventDefault();
        nextImage();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, hasImages, imageList.length, safeImageIndex]);

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
        className="fixed inset-0 z-[70] bg-black/95 p-2 md:p-5"
        data-lenis-prevent
        onClick={onClose}
      >
        <motion.div
          initial={{ y: 40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 40, opacity: 0 }}
          transition={{ duration: 0.28, ease: 'easeOut' }}
          className="relative mx-auto flex h-[min(940px,96vh)] w-[min(1480px,98vw)] flex-col overflow-hidden rounded-[28px] border border-[#17332f] bg-[#07110f] text-[#d9fff7] shadow-[0_40px_120px_rgba(0,0,0,0.75)]"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="pointer-events-none absolute inset-0 opacity-[0.08] bg-[linear-gradient(rgba(255,255,255,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px)] bg-[size:18px_18px]" />
          <div className="absolute left-0 top-0 h-1 w-full bg-gradient-to-r from-[#00ffd1] via-[#9fffee] to-transparent" />

          <header className="relative z-10 border-b border-[#17332f] bg-[#0b1614]/95 px-4 py-4 md:px-7 md:py-5">
            <div className="pr-14">
              <div className="flex flex-wrap items-center gap-2 font-mono text-[10px] uppercase tracking-[0.32em] text-[#79b9ae]">
                <span className="rounded-full border border-[#22554d] bg-[#0f1f1c] px-3 py-1 text-[#d9fff7]">
                  Collection Lookbook
                </span>
                {showSeason ? <span>{season}</span> : null}
                <span>{hasImages ? `${imageList.length} pages` : '0 pages'}</span>
              </div>
              <div className="mt-3 flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
                <div className="max-w-5xl">
                  <h2 className="font-heading text-[2rem] uppercase leading-[0.88] tracking-[-0.04em] text-[#d9fff7] md:text-[3.3rem]">
                    {collection.title}
                  </h2>
                  {showDescription ? (
                    <p className="mt-2 max-w-3xl font-mono text-[12px] leading-relaxed text-[#91c8bd] md:text-[13px]">
                      {fullDescription}
                    </p>
                  ) : null}
                </div>
                <div className="flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.25em] text-[#79b9ae]">
                  <button
                    type="button"
                    onClick={prevImage}
                    disabled={!hasMultipleImages}
                    className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[#22554d] bg-[#0d1917] text-[#d9fff7] transition-colors hover:border-[#00ffd1] hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
                    aria-label="이전 페이지"
                  >
                    <ChevronLeft size={20} />
                  </button>
                  <span className="min-w-[92px] text-center">
                    {hasImages
                      ? `${String(safeImageIndex + 1).padStart(2, '0')} / ${String(imageList.length).padStart(2, '0')}`
                      : '00 / 00'}
                  </span>
                  <button
                    type="button"
                    onClick={nextImage}
                    disabled={!hasMultipleImages}
                    className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[#22554d] bg-[#0d1917] text-[#d9fff7] transition-colors hover:border-[#00ffd1] hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
                    aria-label="다음 페이지"
                  >
                    <ChevronRight size={20} />
                  </button>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="absolute right-4 top-4 inline-flex h-11 w-11 items-center justify-center rounded-full border border-[#22554d] bg-black text-white transition-colors hover:border-[#00ffd1] hover:text-[#d9fff7] md:right-6 md:top-5"
              aria-label="컬렉션 닫기"
            >
              <X size={18} />
            </button>
          </header>

          <div className="relative z-10 grid min-h-0 flex-1 grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px]">
            <div className="min-h-0 p-3 md:p-5">
              <div
                className="relative flex h-full min-h-[46vh] items-center justify-center overflow-hidden rounded-[26px] border border-[#73e1ce]/40 bg-[#d5fff3] p-3 md:p-5"
                onTouchStart={handleTouchStart}
                onTouchEnd={handleTouchEnd}
              >
                <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(0,0,0,0.05),transparent_12%,transparent_88%,rgba(0,0,0,0.08))]" />
                <div className="pointer-events-none absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-[linear-gradient(180deg,transparent,rgba(0,0,0,0.15),transparent)]" />
                <div className="pointer-events-none absolute inset-[12px] rounded-[20px] border border-black/10" />
                {prevPreviewImage ? (
                  <div className="pointer-events-none absolute left-[-4%] top-[11%] z-[1] h-[78%] w-[28%] overflow-hidden rounded-[16px] border border-[#00ffd1]/20 bg-[#effffb]/50 opacity-40 shadow-[0_20px_50px_rgba(0,0,0,0.12)] blur-[0.2px] md:left-[2%] md:w-[22%]">
                    <Image
                      src={prevPreviewImage}
                      alt="이전 컬렉션 미리보기"
                      fill
                      unoptimized={shouldBypassImageOptimization(prevPreviewImage)}
                      sizes="20vw"
                      className="object-cover"
                    />
                    <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(213,255,243,0.82),rgba(213,255,243,0.18))]" />
                    <div className="absolute bottom-3 left-3 font-mono text-[10px] uppercase tracking-[0.28em] text-[#1c5a52]">
                      Prev
                    </div>
                  </div>
                ) : null}
                {nextPreviewImage ? (
                  <div className="pointer-events-none absolute right-[-4%] top-[11%] z-[1] h-[78%] w-[28%] overflow-hidden rounded-[16px] border border-[#00ffd1]/20 bg-[#effffb]/50 opacity-40 shadow-[0_20px_50px_rgba(0,0,0,0.12)] blur-[0.2px] md:right-[2%] md:w-[22%]">
                    <Image
                      src={nextPreviewImage}
                      alt="다음 컬렉션 미리보기"
                      fill
                      unoptimized={shouldBypassImageOptimization(nextPreviewImage)}
                      sizes="20vw"
                      className="object-cover"
                    />
                    <div className="absolute inset-0 bg-[linear-gradient(270deg,rgba(213,255,243,0.82),rgba(213,255,243,0.18))]" />
                    <div className="absolute bottom-3 right-3 font-mono text-[10px] uppercase tracking-[0.28em] text-[#1c5a52]">
                      Next
                    </div>
                  </div>
                ) : null}

                {hasImages ? (
                  <>
                    <button
                      type="button"
                      onClick={prevImage}
                      disabled={!hasMultipleImages}
                      className="absolute left-2 top-1/2 z-20 inline-flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-[#00ffd1]/25 bg-[#effffb]/70 text-[#103531] backdrop-blur transition-colors hover:bg-[#f8fffd] disabled:cursor-not-allowed disabled:opacity-30 md:left-5"
                      aria-label="이전 페이지 보기"
                    >
                      <ChevronLeft size={20} />
                    </button>

                    <AnimatePresence custom={direction} mode="wait">
                      <motion.div
                        key={imageList[safeImageIndex]}
                        custom={direction}
                        initial={{
                          opacity: 0,
                          x: direction >= 0 ? 70 : -70,
                          rotateY: direction >= 0 ? -12 : 12,
                          scale: 0.985,
                        }}
                        animate={{ opacity: 1, x: 0, rotateY: 0, scale: 1 }}
                        exit={{
                          opacity: 0,
                          x: direction >= 0 ? -55 : 55,
                          rotateY: direction >= 0 ? 10 : -10,
                          scale: 0.99,
                        }}
                        transition={{ duration: 0.28, ease: 'easeOut' }}
                        style={{ transformPerspective: 1600, transformStyle: 'preserve-3d' }}
                        className="absolute inset-y-[20px] left-[16%] right-[16%] md:inset-y-[30px] md:left-[18%] md:right-[18%]"
                      >
                        <div className="relative h-full w-full overflow-hidden rounded-[18px] border border-[#00ffd1]/20 bg-[#f2fffb] shadow-[0_25px_60px_rgba(0,0,0,0.18)]">
                          <Image
                            src={imageList[safeImageIndex]}
                            alt={`${collection.title} 컬렉션 이미지 ${safeImageIndex + 1}`}
                            fill
                            priority
                            unoptimized={shouldBypassImageOptimization(imageList[safeImageIndex] || '')}
                            sizes="(max-width: 1280px) 100vw, 72vw"
                            className="object-contain"
                          />
                        </div>
                      </motion.div>
                    </AnimatePresence>

                    <button
                      type="button"
                      onClick={nextImage}
                      disabled={!hasMultipleImages}
                      className="absolute right-2 top-1/2 z-20 inline-flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-[#00ffd1]/25 bg-[#effffb]/70 text-[#103531] backdrop-blur transition-colors hover:bg-[#f8fffd] disabled:cursor-not-allowed disabled:opacity-30 md:right-5"
                      aria-label="다음 페이지 보기"
                    >
                      <ChevronRight size={20} />
                    </button>
                  </>
                ) : (
                  <div className="flex h-full w-full items-center justify-center font-mono text-xs uppercase tracking-[0.3em] text-black/50">
                    Image Missing
                  </div>
                )}

                <div className="pointer-events-none absolute bottom-4 left-4 rounded-full border border-[#00ffd1]/25 bg-[#effffb]/72 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.3em] text-[#15443e] backdrop-blur md:bottom-6 md:left-6">
                  Page {hasImages ? String(safeImageIndex + 1).padStart(2, '0') : '00'}
                </div>
              </div>
            </div>

            <aside className="hidden min-h-0 overflow-y-auto border-l border-[#17332f] bg-[#0b1514] xl:block">
              <div className="space-y-4 p-5">
                <section className="rounded-[22px] border border-[#1c3b36] bg-[#10201d] p-4">
                  <p className="font-mono text-[10px] uppercase tracking-[0.34em] text-[#79b9ae]">
                    Editorial Note
                  </p>
                  <p className="mt-3 text-sm leading-7 text-[#d9fff7]">
                    {showDescription
                      ? fullDescription
                      : '실제 디자이너 브랜드 컬렉션을 보는 것처럼, 한 장씩 넘기며 룩을 확인하는 보기 모드입니다.'}
                  </p>
                </section>

                <section className="rounded-[22px] border border-[#1c3b36] bg-[#0d1817] p-4 font-mono text-[11px] uppercase tracking-[0.22em] text-[#79b9ae]">
                  <div className="grid grid-cols-[92px_minmax(0,1fr)] gap-3">
                    <span>Title</span>
                    <span className="break-words text-[#d9fff7]">{collection.title}</span>
                  </div>
                  {showSeason ? (
                    <div className="mt-4 grid grid-cols-[92px_minmax(0,1fr)] gap-3">
                      <span>Season</span>
                      <span className="text-[#d9fff7]">{season}</span>
                    </div>
                  ) : null}
                  {showReleaseDate ? (
                    <div className="mt-4 grid grid-cols-[92px_minmax(0,1fr)] gap-3">
                      <span>Release</span>
                      <span className="text-[#d9fff7]">{releaseDate}</span>
                    </div>
                  ) : null}
                  {showItems ? (
                    <div className="mt-4 grid grid-cols-[92px_minmax(0,1fr)] gap-3">
                      <span>Looks</span>
                      <span className="text-[#d9fff7]">{collection.items}</span>
                    </div>
                  ) : null}
                  <div className="mt-4 grid grid-cols-[92px_minmax(0,1fr)] gap-3">
                    <span>Frames</span>
                    <span className="text-[#d9fff7]">{imageList.length}</span>
                  </div>
                </section>
              </div>
            </aside>
          </div>

          {hasImages ? (
            <footer className="relative z-10 border-t border-[#17332f] bg-[#0b1614]/96 px-3 py-3 md:px-5 md:py-4">
              <div className="mb-2 flex items-center justify-between gap-3">
                <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-[#79b9ae]">
                  Thumbnail Strip
                </p>
                <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#5ea89b]">
                  아래 사진을 스크롤해서 바로 이동
                </p>
              </div>

              <div className="flex gap-2 overflow-x-auto pb-1 md:gap-3">
                {imageList.map((image, index) => (
                  <button
                    key={`${image}-${index}`}
                    type="button"
                    onClick={() => jumpToImage(index)}
                    className={`group relative h-20 w-14 shrink-0 overflow-hidden rounded-[14px] border transition-all md:h-24 md:w-16 ${
                      index === safeImageIndex
                        ? 'border-[#00ffd1] bg-[#d9fff7]/12'
                        : 'border-[#22433e] bg-[#0f1a18] hover:border-[#8df9ea]'
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
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent px-2 pb-2 pt-6 text-left">
                      <span className="font-mono text-[10px] uppercase tracking-[0.28em] text-[#f4e8cf]">
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
