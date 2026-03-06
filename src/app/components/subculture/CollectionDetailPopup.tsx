'use client';

import Image from 'next/image';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
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
  const safeImageIndex = hasImages ? currentImageIndex % imageList.length : 0;
  const season = collection.season?.trim() || '';
  const showSeason = season.length > 0 && season !== '-';
  const fullDescription = collection.fullDescription?.trim() || '';
  const showDescription = fullDescription.length > 0 && fullDescription !== '상세 설명 없음';
  const releaseDate = collection.releaseDate?.trim() || '';
  const showReleaseDate = releaseDate.length > 0 && releaseDate !== '-';
  const showItems = Number.isFinite(collection.items) && collection.items > 0;

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
  }, [onClose, imageList.length]);

  const nextImage = () => {
    if (!hasImages) return;
    setDirection(1);
    setCurrentImageIndex((prev) => (prev + 1) % imageList.length);
  };

  const prevImage = () => {
    if (!hasImages) return;
    setDirection(-1);
    setCurrentImageIndex((prev) => (prev - 1 + imageList.length) % imageList.length);
  };

  const jumpToImage = (index: number) => {
    if (!hasImages || index === safeImageIndex) return;
    setDirection(index > safeImageIndex ? 1 : -1);
    setCurrentImageIndex(index);
  };

  const handleTouchStart: TouchEventHandler<HTMLDivElement> = (event) => {
    touchStartX.current = event.changedTouches[0]?.clientX ?? null;
  };

  const handleTouchEnd: TouchEventHandler<HTMLDivElement> = (event) => {
    if (!hasImages || imageList.length <= 1 || touchStartX.current === null) return;
    const endX = event.changedTouches[0]?.clientX ?? touchStartX.current;
    const deltaX = endX - touchStartX.current;
    const threshold = 40;
    if (Math.abs(deltaX) < threshold) return;
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
        className="fixed inset-0 z-[70] flex items-center justify-center bg-[#000000]/95 p-2 md:p-6"
        data-lenis-prevent
        onClick={onClose}
      >
        <button
          type="button"
          onClick={onClose}
          className="fixed right-3 top-[calc(env(safe-area-inset-top)+12px)] z-[120] inline-flex h-11 w-11 items-center justify-center rounded-full border border-[#2e2e2e] bg-black text-white shadow-[0_0_18px_rgba(0,0,0,0.45)] transition-colors hover:border-[#f24c3d] hover:text-[#f4e8cf]"
          aria-label="컬렉션 닫기"
        >
          <X size={18} />
        </button>
        <div className="absolute left-0 top-0 z-50 h-1 w-full bg-gradient-to-r from-[#f24c3d] via-[#f4e8cf] to-transparent" />
        
        <motion.div
          initial={{ y: 48, opacity: 0 }}
          animate={{ y: 0 }}
          exit={{ y: 48, opacity: 0 }}
          transition={{ duration: 0.35, ease: 'easeOut' }}
          className="relative h-[min(920px,96vh)] w-[min(1460px,98vw)] overflow-hidden rounded-[26px] border border-[#2b2b2b] bg-[#0c0c0c] text-[#f4e8cf] shadow-[0_40px_100px_rgba(0,0,0,0.75)]"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="absolute inset-0 opacity-[0.08] bg-[linear-gradient(rgba(255,255,255,0.07)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px)] bg-[size:18px_18px]" />

          <div className="relative flex h-full flex-col">
            <div className="border-b border-[#232323] bg-[#111111] px-4 py-4 md:px-7 md:py-5">
              <div className="flex flex-col gap-3 pr-12 md:pr-16">
                <div className="flex flex-wrap items-center gap-2 font-mono text-[10px] uppercase tracking-[0.35em] text-[#bda98e]">
                  <span className="border border-[#534c43] bg-[#181511] px-2 py-1 text-[#f4e8cf]">
                    Collection Archive
                  </span>
                  {showSeason ? <span>{season}</span> : null}
                  <span>{hasImages ? `${imageList.length} Looks` : 'No Image'}</span>
                </div>
                <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                  <div className="max-w-4xl">
                    <h2 className="font-heading text-[2rem] uppercase leading-[0.88] tracking-[-0.04em] text-[#f4e8cf] md:text-[3.2rem]">
                      {collection.title}
                    </h2>
                    {showDescription ? (
                      <p className="mt-3 max-w-3xl font-mono text-[12px] leading-relaxed text-[#b8ac97] md:text-[13px]">
                        {fullDescription}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-3 self-start md:self-end">
                    <button
                      type="button"
                      onClick={prevImage}
                      disabled={!hasImages || imageList.length <= 1}
                      className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[#3e3932] bg-[#15120f] text-[#f4e8cf] transition-colors hover:border-[#f24c3d] hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
                      aria-label="이전 이미지"
                    >
                      <ChevronLeft size={20} />
                    </button>
                    <div className="min-w-[92px] text-center font-mono text-[11px] uppercase tracking-[0.3em] text-[#bda98e]">
                      {hasImages ? `${String(safeImageIndex + 1).padStart(2, '0')} / ${String(imageList.length).padStart(2, '0')}` : '00 / 00'}
                    </div>
                    <button
                      type="button"
                      onClick={nextImage}
                      disabled={!hasImages || imageList.length <= 1}
                      className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[#3e3932] bg-[#15120f] text-[#f4e8cf] transition-colors hover:border-[#f24c3d] hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
                      aria-label="다음 이미지"
                    >
                      <ChevronRight size={20} />
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1.5fr)_360px]">
              <div className="flex min-h-0 flex-col border-b border-[#232323] lg:border-b-0 lg:border-r">
                <div className="min-h-0 flex-1 px-3 py-3 md:px-6 md:py-6">
                  <div
                    className="relative flex h-full min-h-[44vh] items-center justify-center overflow-hidden rounded-[24px] border border-[#b8aa8d]/35 bg-[#efe4cf] p-3 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)] md:p-5"
                    onTouchStart={handleTouchStart}
                    onTouchEnd={handleTouchEnd}
                  >
                    <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(0,0,0,0.05),transparent_14%,transparent_86%,rgba(0,0,0,0.07))]" />
                    <div className="pointer-events-none absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-[linear-gradient(180deg,transparent,rgba(0,0,0,0.12),transparent)]" />
                    <div className="pointer-events-none absolute inset-[12px] rounded-[18px] border border-black/10" />

                    {hasImages ? (
                      <AnimatePresence custom={direction} mode="wait">
                        <motion.div
                          key={imageList[safeImageIndex]}
                          custom={direction}
                          initial={{
                            opacity: 0,
                            x: direction >= 0 ? 90 : -90,
                            rotateY: direction >= 0 ? -12 : 12,
                            scale: 0.98,
                          }}
                          animate={{ opacity: 1, x: 0, rotateY: 0, scale: 1 }}
                          exit={{
                            opacity: 0,
                            x: direction >= 0 ? -70 : 70,
                            rotateY: direction >= 0 ? 10 : -10,
                            scale: 0.985,
                          }}
                          transition={{ duration: 0.32, ease: 'easeOut' }}
                          className="absolute inset-[20px] md:inset-[28px]"
                        >
                          <div className="relative h-full w-full overflow-hidden rounded-[16px] bg-[#e8dcc6] shadow-[0_25px_60px_rgba(0,0,0,0.18)]">
                            <Image
                              src={imageList[safeImageIndex]}
                              alt={`${collection.title} 룩 ${safeImageIndex + 1}`}
                              fill
                              priority
                              unoptimized={shouldBypassImageOptimization(imageList[safeImageIndex] || '')}
                              sizes="(max-width: 1024px) 100vw, 70vw"
                              className="object-contain"
                            />
                          </div>
                        </motion.div>
                      </AnimatePresence>
                    ) : (
                      <div className="flex h-full w-full items-center justify-center font-mono text-xs uppercase tracking-[0.3em] text-black/45">
                        Image Missing
                      </div>
                    )}

                    <div className="pointer-events-none absolute bottom-4 left-4 rounded-full border border-black/10 bg-white/55 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.3em] text-black/60 backdrop-blur md:bottom-6 md:left-6">
                      Look {hasImages ? String(safeImageIndex + 1).padStart(2, '0') : '00'}
                    </div>
                  </div>
                </div>

                {hasImages ? (
                  <div className="border-t border-[#232323] bg-[#101010] px-3 py-3 md:px-6 md:py-4">
                    <div className="mb-2 flex items-center justify-between gap-4">
                      <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-[#bda98e]">
                        Thumbnail Index
                      </p>
                      <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#7f7568]">
                        아래 썸네일로 바로 이동
                      </p>
                    </div>
                    <div className="flex gap-2 overflow-x-auto pb-1 md:gap-3">
                      {imageList.map((image, index) => (
                        <button
                          key={`${image}-thumb-${index}`}
                          type="button"
                          onClick={() => jumpToImage(index)}
                          className={`group relative h-20 w-14 shrink-0 overflow-hidden rounded-[14px] border transition-all md:h-24 md:w-16 ${
                            index === safeImageIndex
                              ? 'border-[#f24c3d] bg-[#f3e7d0]/12'
                              : 'border-[#3c3a36] bg-[#171717] hover:border-[#c7b69e]'
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
                  </div>
                ) : null}
              </div>

              <aside className="min-h-0 overflow-y-auto bg-[#131313] px-4 py-4 md:px-6 md:py-6">
                <div className="space-y-6">
                  <section className="rounded-[20px] border border-[#2b2925] bg-[#171512] p-4">
                    <p className="font-mono text-[10px] uppercase tracking-[0.35em] text-[#bda98e]">
                      Editorial Notes
                    </p>
                    <p className="mt-3 text-sm leading-7 text-[#f1e6d0]">
                      {showDescription
                        ? fullDescription
                        : '실제 컬렉션 룩과 분위기를 책장 넘기듯이 볼 수 있도록 정리된 아카이브입니다.'}
                    </p>
                  </section>

                  <section className="rounded-[20px] border border-[#2b2925] bg-[#111111] p-4">
                    <div className="space-y-4 font-mono text-[11px] uppercase tracking-[0.24em] text-[#bda98e]">
                      <div className="grid grid-cols-[92px_minmax(0,1fr)] gap-3">
                        <span>Title</span>
                        <span className="break-words text-[#f4e8cf]">{collection.title}</span>
                      </div>
                      {showSeason ? (
                        <div className="grid grid-cols-[92px_minmax(0,1fr)] gap-3">
                          <span>Season</span>
                          <span className="text-[#f4e8cf]">{season}</span>
                        </div>
                      ) : null}
                      {showReleaseDate ? (
                        <div className="grid grid-cols-[92px_minmax(0,1fr)] gap-3">
                          <span>Release</span>
                          <span className="text-[#f4e8cf]">{releaseDate}</span>
                        </div>
                      ) : null}
                      {showItems ? (
                        <div className="grid grid-cols-[92px_minmax(0,1fr)] gap-3">
                          <span>Looks</span>
                          <span className="text-[#f4e8cf]">{collection.items} pieces</span>
                        </div>
                      ) : null}
                      <div className="grid grid-cols-[92px_minmax(0,1fr)] gap-3">
                        <span>Frames</span>
                        <span className="text-[#f4e8cf]">{imageList.length}</span>
                      </div>
                    </div>
                  </section>

                  {hasImages ? (
                    <section className="rounded-[20px] border border-[#2b2925] bg-[#111111] p-4">
                      <p className="font-mono text-[10px] uppercase tracking-[0.35em] text-[#bda98e]">
                        Spread Flow
                      </p>
                      <div className="mt-4 grid grid-cols-3 gap-2">
                        {imageList.slice(
                          Math.max(0, safeImageIndex - 1),
                          Math.min(imageList.length, safeImageIndex + 5),
                        ).map((image, offset) => {
                          const actualIndex = Math.max(0, safeImageIndex - 1) + offset;
                          return (
                            <button
                              key={`${image}-mini-${actualIndex}`}
                              type="button"
                              onClick={() => jumpToImage(actualIndex)}
                              className={`relative aspect-[4/5] overflow-hidden rounded-[12px] border ${
                                actualIndex === safeImageIndex
                                  ? 'border-[#f24c3d]'
                                  : 'border-[#2d2b27] hover:border-[#c7b69e]'
                              }`}
                            >
                              <Image
                                src={image}
                                alt={`컬렉션 미리보기 ${actualIndex + 1}`}
                                fill
                                unoptimized={shouldBypassImageOptimization(image)}
                                sizes="120px"
                                className="object-cover"
                              />
                            </button>
                          );
                        })}
                      </div>
                    </section>
                  ) : null}
                </div>
              </aside>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
