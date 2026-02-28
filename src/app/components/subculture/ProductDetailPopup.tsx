'use client';

import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useFashionCart } from '@/app/context/FashionCartContext';
import { useMemo, useRef, useState, type TouchEventHandler } from 'react';
import type { Product } from '@/app/components/subculture/ProductShowcase';

interface ProductDetailPopupProps {
  product: Product;
  onClose: () => void;
}

export function ProductDetailPopup({ product, onClose }: ProductDetailPopupProps) {
  const { cart, addToCart } = useFashionCart();
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const touchStartX = useRef<number | null>(null);
  const isInCart = cart.some((item) => item.id === product.id);
  const isSoldOut = Boolean(product.isSoldOut);

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
  const activeImage = productImages[activeImageIndex] || '';
  const detailImages = productImages
    .map((image, index) => ({ image, index }))
    .filter(({ index }) => index > 0);

  const moveImage = (direction: 'next' | 'prev') => {
    if (!canSlide) return;
    const delta = direction === 'next' ? 1 : -1;
    setActiveImageIndex((prev) => (prev + delta + productImages.length) % productImages.length);
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
    onClose();
  };

  const specs = (product.apparelSpecs || '')
    .split(/\r?\n|,/)
    .map((line) => line.trim())
    .filter(Boolean);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/95 backdrop-blur-md z-[60] flex items-center justify-center p-0 md:p-8 overflow-hidden"
        data-lenis-prevent
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="relative w-full max-w-6xl h-full md:h-[90vh] bg-[#0a0a0a] border border-[#333] overflow-hidden flex flex-col md:flex-row shadow-2xl shadow-[#00ffd1]/10"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Close Button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 z-50 text-[#e5e5e5] hover:text-[#00ffd1] bg-black p-2 border border-[#333] hover:border-[#00ffd1] transition-all"
          >
            <X size={24} />
          </button>

          {/* Left: Images (Shopping Gallery) */}
          <div className="w-full md:w-1/2 min-h-0 relative bg-black border-b md:border-b-0 md:border-r border-[#333]">
            <div
              className="relative w-full aspect-[4/5] group"
              onTouchStart={handleTouchStart}
              onTouchEnd={handleTouchEnd}
            >
              <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 mix-blend-overlay z-10" />
              {activeImage ? (
                <img
                  src={activeImage}
                  alt={`${product.name} 상세 이미지 ${activeImageIndex + 1}`}
                  className="w-full h-full object-contain bg-black"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-[#111] text-[#666] font-mono text-xs">
                  이미지 없음
                </div>
              )}

              {canSlide && (
                <>
                  <button
                    type="button"
                    aria-label="이전 이미지"
                    onClick={() => moveImage('prev')}
                    className="absolute left-4 top-1/2 -translate-y-1/2 z-20 w-10 h-10 border border-[#333] bg-black/80 text-[#e5e5e5] hover:border-[#00ffd1] hover:text-[#00ffd1] transition-colors flex items-center justify-center"
                  >
                    <ChevronLeft size={18} />
                  </button>
                  <button
                    type="button"
                    aria-label="다음 이미지"
                    onClick={() => moveImage('next')}
                    className="absolute right-4 top-1/2 -translate-y-1/2 z-20 w-10 h-10 border border-[#333] bg-black/80 text-[#e5e5e5] hover:border-[#00ffd1] hover:text-[#00ffd1] transition-colors flex items-center justify-center"
                  >
                    <ChevronRight size={18} />
                  </button>
                </>
              )}
            </div>

            <div className="p-4 border-t border-[#333] bg-[#0a0a0a]">
              <p className="font-mono text-[10px] tracking-[0.18em] uppercase text-[#666] mb-3">
                상세 사진 {Math.max(productImages.length, 1)}장
              </p>
              <div className="grid grid-cols-4 gap-2">
                {(productImages.length > 0 ? productImages : ['']).map((image, index) => {
                  const active = index === activeImageIndex;
                  return (
                    <button
                      key={`${product.id}-thumb-${index}`}
                      type="button"
                      onClick={() => setActiveImageIndex(index)}
                      className={`relative aspect-[4/5] overflow-hidden border ${
                        active ? 'border-[#00ffd1]' : 'border-[#333] hover:border-[#00ffd1]/70'
                      } transition-colors`}
                    >
                      {image ? (
                        <img
                          src={image}
                          alt={`${product.name} 썸네일 ${index + 1}`}
                          className="w-full h-full object-contain bg-black"
                        />
                      ) : (
                        <div className="w-full h-full bg-[#111] flex items-center justify-center text-[10px] text-[#555] font-mono">
                          없음
                        </div>
                      )}
                      <span
                        className={`absolute left-1 top-1 text-[10px] font-mono px-1 border ${
                          active
                            ? 'bg-[#00ffd1] text-black border-[#00ffd1]'
                            : 'bg-black/80 text-[#aaa] border-[#333]'
                        }`}
                      >
                        {index + 1}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Right: Info (Terminal) */}
          <div className="w-full md:w-1/2 min-h-0 p-8 md:p-12 flex flex-col bg-[#0a0a0a] text-[#e5e5e5] relative overflow-y-auto overscroll-contain">
            {/* Background Grid */}
            <div className="absolute inset-0 bg-[linear-gradient(to_right,#333_1px,transparent_1px),linear-gradient(to_bottom,#333_1px,transparent_1px)] bg-[size:40px_40px] opacity-[0.05] pointer-events-none" />

            <div className="relative z-10">
              <div className="flex justify-between items-start mb-8 border-b border-[#333] pb-4">
                <span className="font-mono text-xs text-[#666]">{'/// 분류_문서'}</span>
                <span className="font-mono text-xs text-[#00ffd1] animate-pulse">● 활성</span>
              </div>

              <h2 className="text-4xl md:text-5xl font-heading font-black uppercase leading-none mb-6 text-white tracking-tighter">
                {product.name}
              </h2>

              <div className="font-mono text-xs md:text-sm text-[#888] mb-8 leading-relaxed">
                <p>{product.description || '상세 설명이 없습니다.'}</p>
              </div>

              {/* Extended Detail Sections (scrollable) */}
              <div className="mb-10 space-y-6 border-t border-[#333] pt-6">
                <div className="grid grid-cols-2 gap-3 font-mono text-[11px]">
                  <div className="border border-[#333] bg-[#111] p-3">
                    <p className="text-[#666] mb-1">항목 식별값</p>
                    <p className="text-[#e5e5e5]">{product.id}</p>
                  </div>
                  <div className="border border-[#333] bg-[#111] p-3">
                    <p className="text-[#666] mb-1">카테고리</p>
                    <p className="text-[#e5e5e5]">{product.category}</p>
                  </div>
                </div>

                <section className="border border-[#333] bg-[#0f0f0f]">
                  <div className="px-4 py-2 border-b border-[#333] bg-[#111]">
                    <h3 className="font-mono text-[11px] tracking-widest uppercase text-[#00ffd1]">
                      의류 사양
                    </h3>
                  </div>
                  <div className="p-4 font-mono text-xs md:text-sm text-[#9a9a9a] leading-relaxed">
                    {specs.length > 0 ? (
                      <ul className="space-y-2">
                        {specs.map((line, index) => (
                          <li key={`${line}-${index}`} className="border border-[#222] bg-[#111] px-3 py-2">
                            {line}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p>등록된 의류 사양이 없습니다.</p>
                    )}
                  </div>
                </section>

                <section className="border border-[#333] bg-[#0f0f0f]">
                  <div className="px-4 py-2 border-b border-[#333] bg-[#111]">
                    <h3 className="font-mono text-[11px] tracking-widest uppercase text-[#00ffd1]">
                      구조 상세설명
                    </h3>
                  </div>
                  <div className="p-4 font-mono text-xs md:text-sm text-[#9a9a9a] leading-relaxed whitespace-pre-wrap">
                    {product.description || '상세 설명이 없습니다.'}
                  </div>
                </section>

                <section className="border border-[#333] bg-[#0f0f0f]">
                  <div className="px-4 py-2 border-b border-[#333] bg-[#111]">
                    <h3 className="font-mono text-[11px] tracking-widest uppercase text-[#00ffd1]">
                      상세보기 사진
                    </h3>
                  </div>
                  <div className="p-3 space-y-3">
                    {detailImages.length > 0 ? (
                      detailImages.map(({ image, index }) => (
                        <button
                          key={`${product.id}-detail-list-${index}`}
                          type="button"
                          onClick={() => setActiveImageIndex(index)}
                          className={`w-full border p-2 text-left transition-colors ${
                            activeImageIndex === index
                              ? 'border-[#00ffd1] bg-[#001713]'
                              : 'border-[#333] bg-[#101010] hover:border-[#00ffd1]/70'
                          }`}
                        >
                          <div className="aspect-[4/5] overflow-hidden border border-[#222] bg-black">
                            <img
                              src={image}
                              alt={`${product.name} 상세보기 ${index + 1}`}
                              className="w-full h-full object-contain bg-black"
                            />
                          </div>
                          <p className="mt-2 font-mono text-[10px] text-[#7e7e7e]">
                            상세 {index + 1} / 총 {productImages.length}장
                          </p>
                        </button>
                      ))
                    ) : (
                      <p className="font-mono text-xs text-[#666]">추가 상세 이미지가 없습니다.</p>
                    )}
                  </div>
                </section>
              </div>
            </div>

            {/* Bottom Actions */}
            <div className="relative z-10 mt-auto pt-2">
              <div className="flex justify-between items-end mb-6">
                 <span className="font-mono text-xs text-[#666]">가격</span>
                 <span className="font-heading text-4xl text-[#e5e5e5]">
                   {product.price.toLocaleString('ko-KR')}원
                 </span>
              </div>

              <button
                onClick={handleAddToCart}
                disabled={isSoldOut}
                className={`w-full py-4 px-6 font-mono font-bold text-sm uppercase tracking-widest border transition-all duration-300 relative overflow-hidden group ${
                  isSoldOut
                    ? 'bg-[#1f0e0e] text-[#ffabab] border-[#6d2d2d] cursor-not-allowed'
                    : isInCart
                    ? 'bg-[#0e1f1c] text-[#8fd6c8] border-[#2d6d62]'
                    : 'bg-transparent text-[#00ffd1] border-[#00ffd1] hover:text-black'
                }`}
              >
                 {!isInCart && !isSoldOut ? (
                   <div className="absolute inset-0 bg-[#00ffd1] translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-out" />
                 ) : null}
                 <span className="relative z-10 flex justify-between items-center w-full">
                    <span>
                      {isSoldOut
                        ? '품절'
                        : isInCart
                          ? '장바구니 담김 (재고 1개)'
                          : '장바구니 담기'}
                    </span>
                    <span>{isSoldOut ? 'X' : isInCart ? '✓' : '→'}</span>
                 </span>
              </button>
              
            </div>

          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
