'use client';

import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useRef, useState, type TouchEventHandler } from 'react';
import type { Collection } from './CollectionSection';

interface CollectionDetailPopupProps {
  collection: Collection;
  onClose: () => void;
}

export function CollectionDetailPopup({ collection, onClose }: CollectionDetailPopupProps) {
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
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

  const nextImage = () => {
    if (!hasImages) return;
    setCurrentImageIndex((prev) => (prev + 1) % imageList.length);
  };

  const prevImage = () => {
    if (!hasImages) return;
    setCurrentImageIndex((prev) => (prev - 1 + imageList.length) % imageList.length);
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
        className="fixed inset-0 bg-[#000000]/95 z-[70] p-3 md:p-6 flex items-center justify-center"
        data-lenis-prevent
        onClick={onClose}
      >
        <button
          type="button"
          onClick={onClose}
          className="fixed md:hidden right-3 top-[calc(env(safe-area-inset-top)+12px)] z-[120] inline-flex items-center gap-1 rounded-full border border-[#00ffd1] bg-black/95 px-3 py-2 text-[11px] font-mono uppercase tracking-widest text-[#00ffd1] shadow-[0_0_18px_rgba(0,255,209,0.35)]"
          aria-label="컬렉션 닫기"
        >
          <span>닫기</span>
          <X size={16} />
        </button>
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-[#00ffd1] to-transparent z-50" />
        
        <motion.div
          initial={{ y: 100 }}
          animate={{ y: 0 }}
          exit={{ y: 100 }}
          transition={{ duration: 0.5 }}
          className="relative w-[min(1320px,96vw)] h-[min(860px,92vh)] bg-[#050505] text-[#e5e5e5] border border-[#333] rounded-2xl overflow-hidden shadow-[0_40px_100px_rgba(0,0,0,0.75)]"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Close Button */}
          <button
            onClick={onClose}
            className="hidden md:flex absolute top-4 right-4 z-50 text-white bg-black border border-[#333] hover:border-[#00ffd1] hover:text-[#00ffd1] p-2 transition-all"
          >
            <X size={32} />
          </button>

          {/* Film Strip Header */}
          <div className="h-14 border-b border-[#333] flex items-center px-5 bg-[#0a0a0a]">
            <span className="font-mono text-xs text-[#00ffd1] animate-pulse mr-4">● 컬렉션</span>
            {showSeason && <span className="font-mono text-xs text-[#666]">{season}</span>}
          </div>

          <div className="flex flex-col lg:flex-row h-[calc(100%-56px)]">
            
            {/* Left: Image Viewer */}
            <div className="lg:w-[62%] h-full relative bg-[#000] flex flex-col overflow-hidden px-4 py-4">
              <div className="flex-1 min-h-0 flex items-center justify-center">
                <div
                  className="relative w-full h-full border border-[#222] bg-black overflow-hidden flex items-center justify-center"
                  onTouchStart={handleTouchStart}
                  onTouchEnd={handleTouchEnd}
                >
                  <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 mix-blend-overlay pointer-events-none z-10" />

                  {hasImages ? (
                    <img
                      key={safeImageIndex}
                      src={imageList[safeImageIndex]}
                      alt="컬렉션 이미지"
                      className="max-w-full max-h-full w-auto h-auto object-contain bg-black"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center font-mono text-xs text-[#666]">
                      이미지 없음
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-3 border border-[#222] bg-[#0a0a0a] px-4 py-3">
                <div className="flex items-center justify-center gap-8">
                  <button
                    onClick={prevImage}
                    disabled={!hasImages || imageList.length <= 1}
                    className="hover:text-[#00ffd1] transition-colors disabled:opacity-30 disabled:hover:text-inherit"
                  >
                    <ChevronLeft size={32} />
                  </button>
                  <span className="font-mono text-lg">
                    {hasImages ? safeImageIndex + 1 : 0} / {imageList.length}
                  </span>
                  <button
                    onClick={nextImage}
                    disabled={!hasImages || imageList.length <= 1}
                    className="hover:text-[#00ffd1] transition-colors disabled:opacity-30 disabled:hover:text-inherit"
                  >
                    <ChevronRight size={32} />
                  </button>
                </div>
              </div>
            </div>

            {/* Right: Info Panel */}
            <div className="lg:w-[38%] h-full border-l border-[#333] bg-[#0a0a0a] overflow-y-auto overscroll-contain p-5 md:p-6">
               <div className="mb-12">
                 <h2 className="text-4xl md:text-5xl font-heading font-black uppercase text-[#e5e5e5] leading-[0.9] mb-5 tracking-tighter">
                   {collection.title}
                 </h2>
                 {showDescription && (
                   <p className="font-mono text-sm text-[#888] leading-relaxed border-l-2 border-[#00ffd1] pl-4">
                     {fullDescription}
                   </p>
                 )}

                 {hasImages && (
                   <div className="mt-6 border border-[#333] bg-[#111] p-3">
                     <p className="font-mono text-[10px] uppercase tracking-widest text-[#00ffd1] mb-3">
                       상세 이미지 {imageList.length}장
                     </p>
                     <div className="grid grid-cols-3 gap-2 max-h-[44vh] overflow-y-auto overscroll-contain pr-1">
                       {imageList.map((image, index) => (
                         <button
                           key={`${image}-detail-${index}`}
                           type="button"
                           onClick={() => setCurrentImageIndex(index)}
                           className={`aspect-[1080/1350] border overflow-hidden ${
                             index === safeImageIndex
                               ? 'border-[#00ffd1]'
                               : 'border-[#333] hover:border-[#00ffd1]/70'
                           }`}
                         >
                           <img
                             src={image}
                             alt={`상세 이미지 ${index + 1}`}
                             className="w-full h-full object-contain bg-black"
                           />
                         </button>
                       ))}
                     </div>
                   </div>
                 )}
               </div>

               {(showItems || showReleaseDate) && (
                 <div className="space-y-8 font-mono text-xs">
                   <div className="grid grid-cols-2 gap-4 border-t border-[#333] pt-4">
                     {showItems && (
                       <>
                         <div className="text-[#666]">총 항목수</div>
                         <div className="text-[#e5e5e5]">{collection.items}개</div>
                       </>
                     )}
                     {showReleaseDate && (
                       <>
                         <div className="text-[#666]">출시일</div>
                         <div className="text-[#e5e5e5]">{releaseDate}</div>
                       </>
                     )}
                   </div>
                 </div>
               )}
            </div>
          </div>

        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
