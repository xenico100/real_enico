'use client';

import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useFashionCart } from '@/app/context/FashionCartContext';
import { useEffect, useMemo, useState } from 'react';
import type { Product } from '@/app/components/subculture/ProductShowcase';

interface ProductDetailPopupProps {
  product: Product;
  onClose: () => void;
}

export function ProductDetailPopup({ product, onClose }: ProductDetailPopupProps) {
  const { addToCart } = useFashionCart();
  const [selectedSize, setSelectedSize] = useState<string | null>(null);
  const [activeImageIndex, setActiveImageIndex] = useState(0);

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

  useEffect(() => {
    setActiveImageIndex(0);
  }, [product.id]);

  const canSlide = productImages.length > 1;
  const activeImage = productImages[activeImageIndex] || '';

  const moveImage = (direction: 'next' | 'prev') => {
    if (!canSlide) return;
    const delta = direction === 'next' ? 1 : -1;
    setActiveImageIndex((prev) => (prev + delta + productImages.length) % productImages.length);
  };

  const handleAddToCart = () => {
    addToCart({ ...product, quantity: 1, selectedSize });
    onClose();
  };

  const detailSections = [
    {
      title: '상세 설명',
      body: `${product.description} 이 영역은 스크롤 가능한 상세 뷰 구조로 잡아둔 상태라서, 나중에 긴 상품 게시글/에디토리얼/릴리즈 노트/캠페인 카피를 붙여도 모달 레이아웃을 다시 갈아엎지 않아도 됩니다.`,
    },
    {
      title: '구성 메모',
      body: '패널 분할 실루엣, 과장된 비율감, 인더스트리얼 트림, 아카이브 기반 표면 처리 디테일이 들어갑니다. 실제 생산 메모, 원단 구성, 세탁 안내, 핏 코멘트로 이 블록을 교체하면 됩니다.',
    },
    {
      title: '게시글 본문 영역 (향후 콘텐츠 시스템)',
      body: '스토리텔링, 스타일링 가이드, 발매 맥락, 관리 팁, 재고 업데이트, 이미지 캡션 같은 긴 게시글형 콘텐츠를 이 영역에 넣으면 됩니다. 우측 패널 스크롤이 켜져 있어서 길어져도 안전하게 내려갑니다.',
    },
  ];

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/95 backdrop-blur-md z-[60] flex items-center justify-center p-0 md:p-8"
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
            <div className="relative w-full aspect-[3/4] group">
              <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 mix-blend-overlay z-10" />
              {activeImage ? (
                <img
                  src={activeImage}
                  alt={`${product.name} 상세 이미지 ${activeImageIndex + 1}`}
                  className="w-full h-full object-cover contrast-125 brightness-90 group-hover:scale-105 transition-transform duration-700 ease-out"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-[#111] text-[#666] font-mono text-xs">
                  이미지 없음
                </div>
              )}

              <div className="absolute bottom-4 left-4 z-20 bg-black text-[#00ffd1] px-2 py-1 font-mono text-xs border border-[#00ffd1]">
                도면 {product.id} // {activeImageIndex + 1}/{Math.max(productImages.length, 1)}
              </div>

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
                      className={`relative aspect-square overflow-hidden border ${
                        active ? 'border-[#00ffd1]' : 'border-[#333] hover:border-[#00ffd1]/70'
                      } transition-colors`}
                    >
                      {image ? (
                        <img
                          src={image}
                          alt={`${product.name} 썸네일 ${index + 1}`}
                          className="w-full h-full object-cover"
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
          <div className="w-full md:w-1/2 min-h-0 p-8 md:p-12 flex flex-col bg-[#0a0a0a] text-[#e5e5e5] relative overflow-y-auto">
            {/* Background Grid */}
            <div className="absolute inset-0 bg-[linear-gradient(to_right,#333_1px,transparent_1px),linear-gradient(to_bottom,#333_1px,transparent_1px)] bg-[size:40px_40px] opacity-[0.05] pointer-events-none" />

            <div className="relative z-10">
              <div className="flex justify-between items-start mb-8 border-b border-[#333] pb-4">
                <span className="font-mono text-xs text-[#666]">/// 분류_문서</span>
                <span className="font-mono text-xs text-[#00ffd1] animate-pulse">● 활성</span>
              </div>

              <h2 className="text-4xl md:text-5xl font-heading font-black uppercase leading-none mb-6 text-white tracking-tighter">
                {product.name}
              </h2>

              <div className="font-mono text-xs md:text-sm text-[#888] space-y-4 mb-8 leading-relaxed">
                <p>{product.description}</p>
                <p>
                  사양: <br/>
                  - 소재: 100% 미확인 섬유<br/>
                  - 원산지: [비공개]<br/>
                  - 내구도: 실전 대응
                </p>
              </div>

              {/* Sizes */}
              <div className="mb-8">
                <p className="font-mono text-xs text-[#666] mb-3 uppercase">옵션 선택:</p>
                <div className="flex gap-2">
                  {['초소', '소', '중', '대', '특대'].map((size) => (
                    <button
                      key={size}
                      onClick={() => setSelectedSize(size)}
                      className={`w-10 h-10 flex items-center justify-center font-mono text-xs border ${
                        selectedSize === size 
                          ? 'bg-[#00ffd1] text-black border-[#00ffd1] font-bold' 
                          : 'bg-transparent text-[#666] border-[#333] hover:border-[#e5e5e5] hover:text-[#e5e5e5]'
                      }`}
                    >
                      {size}
                    </button>
                  ))}
                </div>
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

                {detailSections.map((section) => (
                  <section key={section.title} className="border border-[#333] bg-[#0f0f0f]">
                    <div className="px-4 py-2 border-b border-[#333] bg-[#111] flex items-center justify-between">
                      <h3 className="font-mono text-[11px] tracking-widest uppercase text-[#00ffd1]">
                        {section.title}
                      </h3>
                      <span className="font-mono text-[10px] text-[#555]">스크롤 가능</span>
                    </div>
                    <div className="p-4 font-mono text-xs md:text-sm text-[#9a9a9a] leading-relaxed space-y-3">
                      <p>{section.body}</p>
                      <p>
                        향후 상품 게시글용 자리표시 문단입니다. 여기에 긴 마크다운/CMS 본문을 붙이고 아래로 섹션을 계속 추가해도 모달 레이아웃이 깨지지 않게 잡아둔 구조입니다.
                      </p>
                    </div>
                  </section>
                ))}
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
                disabled={!selectedSize}
                className={`w-full py-4 px-6 font-mono font-bold text-sm uppercase tracking-widest border transition-all duration-300 relative overflow-hidden group ${
                  !selectedSize 
                    ? 'bg-[#1a1a1a] text-[#444] border-[#333] cursor-not-allowed' 
                    : 'bg-transparent text-[#00ffd1] border-[#00ffd1] hover:text-black'
                }`}
              >
                 <div className={`absolute inset-0 bg-[#00ffd1] translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-out ${!selectedSize ? 'hidden' : ''}`} />
                 <span className="relative z-10 flex justify-between items-center w-full">
                    <span>{selectedSize ? '장바구니 담기' : '사이즈 선택'}</span>
                    <span>→</span>
                 </span>
              </button>
              
              <p className="mt-4 font-mono text-[10px] text-[#444] text-center">
                경고: 이 항목은 사회적 소음을 유발할 수 있습니다.
              </p>
            </div>

          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
