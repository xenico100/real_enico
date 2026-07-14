'use client';

import Image from 'next/image';
import { ChevronLeft, ChevronRight, X, Box } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import {
  getFashionCartItemKey,
  useFashionCart,
} from '@/app/context/FashionCartContext';
import { shouldBypassImageOptimization } from '@/lib/images';
import { useEffect, useMemo, useRef, useState, type TouchEventHandler } from 'react';
import type { Product } from '@/lib/storefront/productCatalog';
import dynamic from 'next/dynamic';

const Viewer3D = dynamic(() => import('@/components/common/Viewer3D').then((m) => m.Viewer3D), {
  ssr: false,
});

interface ProductDetailPopupProps {
  product: Product;
  onClose: () => void;
}

const SMARTSTORE_HOME_URL = 'https://smartstore.naver.com/xenicolack';

function NaverIcon() {
  return (
    <span className="inline-flex h-5 w-5 items-center justify-center rounded-sm bg-[#03c75a] text-[11px] font-black text-white">
      N
    </span>
  );
}

export function ProductDetailPopup({ product, onClose }: ProductDetailPopupProps) {
  const { cart, addToCart, lastAddedItem } = useFashionCart();
  const [imageState, setImageState] = useState(() => ({
    productId: product.id,
    index: 0,
  }));
  const [isCartBurstVisible, setIsCartBurstVisible] = useState(false);
  const [viewMode, setViewMode] = useState<'photo' | '3d'>('photo');
  const touchStartX = useRef<number | null>(null);
  const itemKey = getFashionCartItemKey(product.id, null);
  const isInCart = cart.some(
    (item) => getFashionCartItemKey(item.id, item.selectedSize) === itemKey,
  );
  const isSoldOut = Boolean(product.isSoldOut);
  const smartstoreUrl = SMARTSTORE_HOME_URL;

  const productImages = useMemo(() => {
    const normalized = Array.isArray(product.images)
      ? product.images.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      : [];

    if (normalized.length > 0) {
      return Array.from(new Set(normalized.map((item) => item.trim())));
    }

    if (typeof product.image === 'string' && product.image.trim().length > 0) {
      return [product.image.trim()];
    }

    return [];
  }, [product.image, product.images]);

  const canSlide = productImages.length > 1;
  const defaultActiveImageIndex = 0;
  const activeImageIndex =
    imageState.productId === product.id ? imageState.index : defaultActiveImageIndex;
  const activeImage = productImages[activeImageIndex] || '';
  const detailImages = productImages
    .map((image, index) => ({ image, index }))
    .filter(({ index }) => index > 0);
  const shouldUseDirectActiveImage = shouldBypassImageOptimization(activeImage);

  useEffect(() => {
    if (lastAddedItem?.itemKey !== itemKey) return;

    setIsCartBurstVisible(true);
    const timeoutId = window.setTimeout(() => {
      setIsCartBurstVisible(false);
    }, 950);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [itemKey, lastAddedItem]);

  const moveImage = (direction: 'next' | 'prev') => {
    if (!canSlide) return;
    const delta = direction === 'next' ? 1 : -1;
    setImageState((prev) => {
      const currentIndex = prev.productId === product.id ? prev.index : 0;
      return {
        productId: product.id,
        index: (currentIndex + delta + productImages.length) % productImages.length,
      };
    });
  };

  const handleTouchStart: TouchEventHandler<HTMLDivElement> = (event) => {
    touchStartX.current = event.changedTouches[0]?.clientX ?? null;
  };

  const handleTouchEnd: TouchEventHandler<HTMLDivElement> = (event) => {
    if (!canSlide || touchStartX.current === null) return;
    const endX = event.changedTouches[0]?.clientX ?? touchStartX.current;
    const deltaX = endX - touchStartX.current;
    const threshold = 40;
    if (Math.abs(deltaX) < threshold) return;
    moveImage(deltaX < 0 ? 'next' : 'prev');
    touchStartX.current = null;
  };

  const handleAddToCart = () => {
    if (isSoldOut) {
      return;
    }
    if (isInCart) {
      onClose();
      return;
    }
    addToCart({
      id: product.id,
      name: product.name,
      price: product.price,
      quantity: 1,
      image: product.image,
      category: product.category,
    });
  };

  const handleSmartstorePurchase = () => {
    if (!smartstoreUrl) return;
    window.open(smartstoreUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-white/90 backdrop-blur-md z-[60] flex items-start md:items-center justify-center p-0 md:p-8 overflow-y-auto md:overflow-hidden"
        data-lenis-prevent
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="relative w-full max-w-6xl min-h-full md:min-h-0 md:h-[90vh] bg-white border border-[#d1d5db] overflow-y-auto md:overflow-hidden flex flex-col md:flex-row shadow-2xl shadow-[#b8001f]/10"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={onClose}
            className="fixed right-3 top-[calc(env(safe-area-inset-top)+12px)] z-[120] inline-flex h-11 w-11 items-center justify-center rounded-full border border-[#d1d5db] bg-white text-[#111827] shadow-[0_0_18px_rgba(0,0,0,0.15)] transition-colors hover:border-[#b8001f] hover:text-[#b8001f] md:hidden"
            aria-label="상품 닫기"
          >
            <X size={18} />
          </button>
          {/* Close Button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 z-50 hidden bg-white p-2 text-[#111827] transition-all hover:border-[#b8001f] hover:text-[#b8001f] md:block md:border md:border-[#d1d5db] shadow-sm"
          >
            <X size={24} />
          </button>

          {/* Left: Images (Shopping Gallery) + 3D Viewer */}
          <div className="w-full md:w-1/2 shrink-0 md:min-h-0 relative bg-[#f8f9fa] border-b md:border-b-0 md:border-r border-[#d1d5db] flex flex-col">
            {/* Photo / 3D Toggle Tab */}
            <div className="flex border-b border-[#d1d5db] bg-white">
              <button
                type="button"
                onClick={() => setViewMode('photo')}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 font-mono text-xs uppercase tracking-widest transition-all border-b-2 ${
                  viewMode === 'photo'
                    ? 'border-[#b8001f] text-[#b8001f] font-bold bg-white'
                    : 'border-transparent text-[#4b5563] hover:text-[#b8001f] bg-[#f8f9fa]'
                }`}
              >
                📷 사진
              </button>
              <button
                type="button"
                onClick={() => setViewMode('3d')}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 font-mono text-xs uppercase tracking-widest transition-all border-b-2 ${
                  viewMode === '3d'
                    ? 'border-[#b8001f] text-[#b8001f] font-bold bg-white'
                    : 'border-transparent text-[#4b5563] hover:text-[#b8001f] bg-[#f8f9fa]'
                }`}
              >
                <Box size={14} />
                3D 뷰어
              </button>
            </div>

            {viewMode === '3d' ? (
              /* 3D Viewer Mode */
              <div className="flex-1 min-h-[400px] md:min-h-0">
                <Viewer3D
                  modelUrl="/3d/bomber_jacket.glb"
                  title={product.name}
                  embedded
                />
              </div>
            ) : (
              /* Photo Gallery Mode */
              <>
            <div
              className="relative w-full aspect-[1080/1350] md:aspect-[4/5] group"
              onTouchStart={handleTouchStart}
              onTouchEnd={handleTouchEnd}
            >
              <div className="absolute inset-0 z-10 opacity-15 bg-[radial-gradient(circle_at_1px_1px,rgba(0,0,0,0.12)_1px,transparent_0)] bg-[size:14px_14px]" />
              {activeImage ? (
                <Image
                  key={activeImage}
                  src={activeImage}
                  alt={`${product.name} 상세 이미지 ${activeImageIndex + 1}`}
                  fill
                  priority
                  unoptimized={shouldUseDirectActiveImage}
                  sizes="(max-width: 768px) 100vw, 50vw"
                  className="object-contain bg-[#f8f9fa]"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-[#f3f4f6] text-[#4b5563] font-mono text-xs font-semibold">
                  이미지 없음
                </div>
              )}

              {canSlide && (
                <>
                  <button
                    type="button"
                    aria-label="이전 이미지"
                    onClick={() => moveImage('prev')}
                    className="absolute left-4 top-1/2 -translate-y-1/2 z-20 w-10 h-10 border border-[#d1d5db] bg-white/90 text-[#111827] hover:border-[#b8001f] hover:text-[#b8001f] shadow-sm transition-colors flex items-center justify-center"
                  >
                    <ChevronLeft size={18} />
                  </button>
                  <button
                    type="button"
                    aria-label="다음 이미지"
                    onClick={() => moveImage('next')}
                    className="absolute right-4 top-1/2 -translate-y-1/2 z-20 w-10 h-10 border border-[#d1d5db] bg-white/90 text-[#111827] hover:border-[#b8001f] hover:text-[#b8001f] shadow-sm transition-colors flex items-center justify-center"
                  >
                    <ChevronRight size={18} />
                  </button>
                </>
              )}
            </div>

            <div className="p-4 border-t border-[#d1d5db] bg-white">
              <p className="font-mono text-[10px] tracking-[0.18em] uppercase text-[#4b5563] mb-3 font-bold">
                상세 사진 {Math.max(productImages.length, 1)}장
              </p>
              <div className="grid grid-cols-4 gap-2">
                {(productImages.length > 0 ? productImages : ['']).map((image, index) => {
                  const active = index === activeImageIndex;
                  return (
                    <button
                      key={`${product.id}-thumb-${index}`}
                      type="button"
                      onClick={() => setImageState({ productId: product.id, index })}
                      className={`relative h-20 md:h-auto md:aspect-[4/5] overflow-hidden border ${
                        active ? 'border-[#b8001f] shadow-sm' : 'border-[#d1d5db] hover:border-[#b8001f]/70'
                      } transition-all`}
                    >
                      {image ? (
                        <Image
                          src={image}
                          alt={`${product.name} 썸네일 ${index + 1}`}
                          fill
                          unoptimized={shouldBypassImageOptimization(image)}
                          sizes="(max-width: 768px) 25vw, 12vw"
                          className="object-contain bg-[#f8f9fa]"
                        />
                      ) : (
                        <div className="w-full h-full bg-[#f3f4f6] flex items-center justify-center text-[10px] text-[#4b5563] font-mono">
                          없음
                        </div>
                      )}
                      <span
                        className={`absolute left-1 top-1 text-[10px] font-mono px-1 border ${
                          active
                            ? 'bg-[#b8001f] text-white border-[#b8001f] font-bold'
                            : 'bg-white/90 text-[#4b5563] border-[#d1d5db] font-semibold'
                        }`}
                      >
                        {index + 1}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
              </>
            )}
          </div>

          {/* Right: Info (Terminal) */}
          <div className="w-full md:w-1/2 min-h-0 px-5 py-7 md:px-10 md:py-10 lg:px-12 lg:py-12 flex flex-col bg-white text-[#111827] relative overflow-visible md:overflow-y-auto md:overscroll-contain">
            {/* Background Grid */}
            <div className="absolute inset-0 bg-[linear-gradient(to_right,#e5e7eb_1px,transparent_1px),linear-gradient(to_bottom,#e5e7eb_1px,transparent_1px)] bg-[size:40px_40px] opacity-[0.4] pointer-events-none" />

            <div className="relative z-10 px-1 md:px-2">
              <div className="flex justify-between items-start mb-8 border-b border-[#d1d5db] pb-4">
                <span className="font-mono text-xs text-[#4b5563] font-bold">{'/// 분류_문서'}</span>
                <span className="font-mono text-xs text-[#b8001f] animate-pulse font-bold">● 활성</span>
              </div>

              <h2 className="max-w-[calc(100%-3.5rem)] pr-6 text-[2rem] md:text-[2.75rem] lg:text-5xl font-heading font-black uppercase leading-[0.92] mb-6 text-[#111827] tracking-[-0.03em] break-words">
                {product.name}
              </h2>

              {/* Top Actions */}
              <div className="relative z-10 mb-8 border border-[#d1d5db] bg-[#f8f9fa] p-4 md:p-5 shadow-sm">
                <div className="flex justify-between items-end mb-5">
                  <span className="font-mono text-xs text-[#4b5563] uppercase tracking-widest font-bold">가격</span>
                  <span className="pl-4 text-right font-heading text-3xl md:text-4xl leading-none text-[#111827] break-keep font-black">
                    {product.price.toLocaleString('ko-KR')}원
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="relative">
                    <AnimatePresence>
                      {isCartBurstVisible ? (
                        <>
                          <motion.div
                            key={`${itemKey}-detail-burst`}
                            initial={{ opacity: 0.82, scale: 0.9 }}
                            animate={{ opacity: 0, scale: 1.16 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.7, ease: 'easeOut' }}
                            className="pointer-events-none absolute inset-0 z-10 rounded-none bg-[radial-gradient(circle_at_50%_50%,rgba(184,0,31,0.32)_0%,rgba(184,0,31,0.14)_36%,rgba(184,0,31,0)_74%)]"
                          />
                          <motion.span
                            key={`${itemKey}-detail-plus`}
                            initial={{ opacity: 0, y: 8, scale: 0.84 }}
                            animate={{ opacity: 1, y: -14, scale: 1 }}
                            exit={{ opacity: 0, y: -24, scale: 0.92 }}
                            transition={{ duration: 0.55, ease: 'easeOut' }}
                            className="pointer-events-none absolute right-3 top-3 z-20 rounded-full border border-[#d93853] bg-[#ffe6eb] px-3 py-1 font-mono text-[10px] font-black uppercase tracking-[0.2em] text-[#6e0013] shadow-[0_12px_26px_rgba(184,0,31,0.25)]"
                          >
                            +1
                          </motion.span>
                        </>
                      ) : null}
                    </AnimatePresence>

                    <motion.button
                      type="button"
                      onClick={handleAddToCart}
                      disabled={isSoldOut}
                      animate={
                        isCartBurstVisible
                          ? {
                              scale: [1, 0.97, 1.03, 1],
                              boxShadow: [
                                '0 0 0 rgba(184,0,31,0)',
                                '0 0 0 rgba(184,0,31,0)',
                                '0 0 34px rgba(184,0,31,0.32)',
                                '0 0 0 rgba(184,0,31,0)',
                              ],
                            }
                          : { scale: 1, boxShadow: '0 0 0 rgba(184,0,31,0)' }
                      }
                      transition={{ duration: 0.72, ease: 'easeOut' }}
                      className={`min-h-[88px] w-full px-5 py-4 font-mono font-bold text-base uppercase tracking-wider border transition-all duration-300 relative overflow-hidden group text-left ${
                        isSoldOut
                          ? 'bg-[#fef2f2] text-[#991b1b] border-[#f87171] cursor-not-allowed'
                          : isInCart
                            ? 'bg-[#fff1f2] text-[#8f0018] border-[#d93853]'
                            : 'bg-transparent text-[#b8001f] border-[#b8001f] hover:text-white'
                      }`}
                    >
                      {!isInCart && !isSoldOut ? (
                        <div className="absolute inset-0 bg-[#b8001f] translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-out" />
                      ) : null}
                      <AnimatePresence>
                        {isCartBurstVisible ? (
                          <motion.span
                            key={`${itemKey}-detail-sweep`}
                            initial={{ opacity: 0.95, x: '-100%' }}
                            animate={{ opacity: 0, x: '115%' }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.55, ease: 'easeOut' }}
                            className="pointer-events-none absolute inset-y-0 left-[-25%] w-[45%] bg-[linear-gradient(90deg,transparent,rgba(255,224,235,0.95),transparent)]"
                          />
                        ) : null}
                      </AnimatePresence>
                      <span className="relative z-10 flex h-full items-center justify-between gap-3">
                        <span className="leading-tight">
                          {isSoldOut
                            ? '품절'
                            : isInCart
                              ? '장바구니 담김'
                              : '장바구니 담기'}
                        </span>
                        <span className="text-xl">{isSoldOut ? 'X' : isInCart ? '✓' : '+'}</span>
                      </span>
                    </motion.button>
                  </div>

                  <button
                    type="button"
                    onClick={handleSmartstorePurchase}
                    className="min-h-[88px] px-5 py-4 font-mono font-bold text-base uppercase tracking-wider border transition-colors text-left border-[#03c75a] text-[#03c75a] hover:bg-[#03c75a] hover:text-white shadow-sm"
                  >
                    <span className="flex h-full items-center justify-between gap-3">
                      <span className="inline-flex items-center gap-2 leading-tight">
                        <NaverIcon />
                        네이버 구매
                      </span>
                      <span className="text-xl">↗</span>
                    </span>
                  </button>
                </div>
              </div>

              {/* Extended Detail Sections (scrollable) */}
              <div className="mb-10 space-y-6 border-t border-[#d1d5db] pt-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 font-mono text-[11px]">
                  <div className="border border-[#d1d5db] bg-[#f8f9fa] p-3 shadow-sm">
                    <p className="text-[#4b5563] mb-1 font-bold">항목 식별값</p>
                    <p className="text-[#111827] font-semibold">{product.id}</p>
                  </div>
                  <div className="border border-[#d1d5db] bg-[#f8f9fa] p-3 shadow-sm">
                    <p className="text-[#4b5563] mb-1 font-bold">카테고리</p>
                    <p className="text-[#111827] font-semibold">{product.category}</p>
                  </div>
                </div>

                <section className="border border-[#d1d5db] bg-white shadow-sm">
                  <div className="px-4 py-2 border-b border-[#d1d5db] bg-[#f8f9fa]">
                    <h3 className="font-mono text-[11px] tracking-widest uppercase text-[#b8001f] font-bold">
                      상세설명
                    </h3>
                  </div>
                  <div className="p-4 font-mono text-xs md:text-sm text-[#374151] leading-relaxed whitespace-pre-wrap font-medium">
                    {product.description || '상세 설명이 없습니다.'}
                  </div>
                </section>

                <section className="border border-[#d1d5db] bg-white shadow-sm">
                  <div className="px-4 py-2 border-b border-[#d1d5db] bg-[#f8f9fa]">
                    <h3 className="font-mono text-[11px] tracking-widest uppercase text-[#b8001f] font-bold">
                      상세보기 사진
                    </h3>
                  </div>
                  <div className="p-3 space-y-3">
                    {detailImages.length > 0 ? (
                      detailImages.map(({ image, index }) => (
                        <button
                          key={`${product.id}-detail-list-${index}`}
                          type="button"
                          onClick={() => setImageState({ productId: product.id, index })}
                          className={`w-full border p-2 text-left transition-colors ${
                            activeImageIndex === index
                              ? 'border-[#b8001f] bg-[#fff1f2]'
                              : 'border-[#d1d5db] bg-[#f8f9fa] hover:border-[#b8001f]/70'
                          }`}
                        >
                          <div className="relative border border-[#d1d5db] bg-white aspect-[1080/1350]">
                            <Image
                              src={image}
                              alt={`${product.name} 상세보기 ${index + 1}`}
                              fill
                              unoptimized={shouldBypassImageOptimization(image)}
                              sizes="(max-width: 768px) 100vw, 50vw"
                              className="object-contain bg-white"
                            />
                          </div>
                          <p className="mt-2 font-mono text-[10px] text-[#4b5563] font-semibold">
                            상세 {index + 1} / 총 {productImages.length}장
                          </p>
                        </button>
                      ))
                    ) : (
                      <p className="font-mono text-xs text-[#4b5563] font-semibold">추가 상세 이미지가 없습니다.</p>
                    )}
                  </div>
                </section>
              </div>
            </div>

          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
