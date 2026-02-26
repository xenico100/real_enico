'use client';

import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useState } from 'react';
import type { Collection } from './CollectionSection';

interface CollectionDetailPopupProps {
  collection: Collection;
  onClose: () => void;
}

export function CollectionDetailPopup({ collection, onClose }: CollectionDetailPopupProps) {
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const imageList =
    Array.isArray(collection.images) && collection.images.length > 0
      ? collection.images
      : collection.image
        ? [collection.image]
        : [];
  const hasImages = imageList.length > 0;
  const safeImageIndex = hasImages ? currentImageIndex % imageList.length : 0;

  const nextImage = () => {
    if (!hasImages) return;
    setCurrentImageIndex((prev) => (prev + 1) % imageList.length);
  };

  const prevImage = () => {
    if (!hasImages) return;
    setCurrentImageIndex((prev) => (prev - 1 + imageList.length) % imageList.length);
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-[#000000] z-[70] overflow-y-auto"
        onClick={onClose}
      >
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-[#00ffd1] to-transparent z-50" />
        
        <motion.div
          initial={{ y: 100 }}
          animate={{ y: 0 }}
          exit={{ y: 100 }}
          transition={{ duration: 0.5 }}
          className="min-h-screen bg-[#050505] text-[#e5e5e5] relative"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Close Button */}
          <button
            onClick={onClose}
            className="fixed top-8 right-8 z-50 text-white bg-black border border-[#333] hover:border-[#00ffd1] hover:text-[#00ffd1] p-2 transition-all"
          >
            <X size={32} />
          </button>

          {/* Film Strip Header */}
          <div className="h-20 border-b border-[#333] flex items-center px-8 bg-[#0a0a0a]">
            <span className="font-mono text-xs text-[#00ffd1] animate-pulse mr-4">● 기록</span>
            <span className="font-mono text-xs text-[#666]">파일: {collection.id} /// {collection.season}</span>
          </div>

          <div className="flex flex-col lg:flex-row h-[calc(100vh-80px)]">
            
            {/* Left: Image Viewer */}
            <div className="lg:w-2/3 h-full relative bg-[#000] flex items-center justify-center overflow-hidden group">
               {/* Noise Overlay */}
               <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 mix-blend-overlay pointer-events-none z-10" />
               
               {hasImages ? (
                 <img 
                   key={safeImageIndex}
                   src={imageList[safeImageIndex]} 
                   alt="컬렉션 이미지"
                   className="w-full h-full object-contain grayscale contrast-125"
                 />
               ) : (
                 <div className="w-full h-full flex items-center justify-center font-mono text-xs text-[#666]">
                   이미지 없음
                 </div>
               )}
               
               {/* Navigation Controls */}
               <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex gap-8 z-20">
                 <button
                   onClick={prevImage}
                   disabled={!hasImages}
                   className="hover:text-[#00ffd1] transition-colors disabled:opacity-30 disabled:hover:text-inherit"
                 >
                   <ChevronLeft size={40} />
                 </button>
                 <span className="font-mono text-xl self-center">
                   {hasImages ? safeImageIndex + 1 : 0} / {imageList.length}
                 </span>
                 <button
                   onClick={nextImage}
                   disabled={!hasImages}
                   className="hover:text-[#00ffd1] transition-colors disabled:opacity-30 disabled:hover:text-inherit"
                 >
                   <ChevronRight size={40} />
                 </button>
               </div>
            </div>

            {/* Right: Info Panel */}
            <div className="lg:w-1/3 h-full border-l border-[#333] bg-[#0a0a0a] overflow-y-auto p-12">
               <div className="mb-12">
                 <h2 className="text-6xl font-heading font-black uppercase text-[#e5e5e5] leading-[0.85] mb-6 tracking-tighter">
                   {collection.title}
                 </h2>
                 <p className="font-mono text-sm text-[#888] leading-relaxed border-l-2 border-[#00ffd1] pl-4">
                   {collection.fullDescription}
                 </p>
               </div>

               <div className="space-y-8 font-mono text-xs">
                 <div className="grid grid-cols-2 gap-4 border-t border-[#333] pt-4">
                   <div className="text-[#666]">총 항목수</div>
                   <div className="text-[#e5e5e5]">{collection.items}개</div>
                   
                   <div className="text-[#666]">출시일</div>
                   <div className="text-[#e5e5e5]">{collection.releaseDate}</div>
                   
                   <div className="text-[#666]">상태</div>
                   <div className="text-[#00ffd1]">유출됨</div>
                 </div>

                 <div className="bg-[#111] p-4 border border-[#333]">
                   <p className="text-[#666] mb-2 uppercase">지시문:</p>
                   <ul className="list-disc list-inside space-y-2 text-[#aaa]">
                     <li>정상성 패턴을 교란할 것</li>
                     <li>시각적 무질서를 유도할 것</li>
                     <li>현실의 짜임 자체를 의심할 것</li>
                   </ul>
                 </div>

                 <button className="w-full py-4 bg-[#00ffd1] text-black font-bold uppercase tracking-widest hover:bg-white transition-colors">
                   전체 아카이브 열기
                 </button>
               </div>
            </div>
          </div>

        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
