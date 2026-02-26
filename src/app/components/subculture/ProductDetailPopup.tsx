'use client';

import { X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useFashionCart } from '@/app/context/FashionCartContext';
import { useState } from 'react';

interface ProductDetailPopupProps {
  product: any;
  onClose: () => void;
}

export function ProductDetailPopup({ product, onClose }: ProductDetailPopupProps) {
  const { addToCart } = useFashionCart();
  const [selectedSize, setSelectedSize] = useState<string | null>(null);

  const handleAddToCart = () => {
    addToCart({ ...product, quantity: 1, selectedSize });
    onClose();
  };

  const detailSections = [
    {
      title: 'Detail Description',
      body: `${product.description} This entry is now structured as a scrollable detail view so you can later attach long-form product posts, editorial writeups, release notes, and campaign copy without redesigning the modal layout.`,
    },
    {
      title: 'Construction Notes',
      body: 'Panelled silhouette with exaggerated proportions, industrial trims, and archive-inspired surface treatment. Replace this block with your actual production notes, fabric composition, washing instructions, and fit commentary.',
    },
    {
      title: 'Post Content Area (For Future CMS)',
      body: 'Use this area for longer post-style content: storytelling, styling guides, launch context, care tips, stock updates, and image captions. The right panel scroll is enabled so long text can continue downward safely.',
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

          {/* Left: Images (Scrollable Gallery) */}
          <div className="w-full md:w-1/2 min-h-0 relative bg-black overflow-y-auto scrollbar-hide">
             {/* Main Image */}
             <div className="relative w-full aspect-[3/4] group">
               <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 mix-blend-overlay z-10" />
               <img 
                 src={product.image} 
                 alt={product.name} 
                 className="w-full h-full object-cover contrast-125 brightness-90 group-hover:scale-105 transition-transform duration-700 ease-out"
               />
               <div className="absolute bottom-4 left-4 z-20 bg-black text-[#00ffd1] px-2 py-1 font-mono text-xs border border-[#00ffd1]">
                 FIG. {product.id} // MAIN
               </div>
               {/* Scan line */}
               <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#00ffd1]/10 to-transparent h-[10px] w-full animate-[scan_2s_linear_infinite] pointer-events-none z-20 mix-blend-screen opacity-50" />
             </div>

             {/* Detail Shot 1 - Grayscale High Contrast */}
             <div className="relative w-full aspect-square group border-t border-[#333]">
                <img 
                 src={product.image} 
                 alt="Detail 1" 
                 className="w-full h-full object-cover grayscale contrast-150 brightness-75 group-hover:scale-110 transition-transform duration-700"
               />
               <div className="absolute top-4 left-4 z-20 bg-black text-white px-2 py-1 font-mono text-xs border border-white">
                 DETAIL // TEXTURE
               </div>
             </div>

             {/* Detail Shot 2 - Inverted / X-Ray */}
             <div className="relative w-full aspect-[4/3] group border-t border-[#333] overflow-hidden">
                <img 
                 src={product.image} 
                 alt="Detail 2" 
                 className="w-full h-full object-cover invert hue-rotate-180 mix-blend-difference opacity-80 group-hover:scale-105 transition-transform duration-700"
               />
               <div className="absolute bottom-4 right-4 z-20 bg-[#00ffd1] text-black px-2 py-1 font-mono text-xs border border-black">
                 SCAN_MODE // X-RAY
               </div>
             </div>
             
             {/* Detail Shot 3 - Zoomed */}
             <div className="relative w-full aspect-square group border-t border-[#333] overflow-hidden">
                <img 
                 src={product.image} 
                 alt="Detail 3" 
                 className="w-full h-full object-cover scale-150 group-hover:scale-[1.6] transition-transform duration-700"
               />
               <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20 border border-[#00ffd1] w-20 h-20 rounded-full flex items-center justify-center">
                 <div className="w-1 h-1 bg-[#00ffd1]" />
               </div>
               <div className="absolute bottom-4 left-4 z-20 bg-black text-white px-2 py-1 font-mono text-xs border border-white">
                 ZOOM // MACRO
               </div>
             </div>
          </div>

          {/* Right: Info (Terminal) */}
          <div className="w-full md:w-1/2 min-h-0 p-8 md:p-12 flex flex-col bg-[#0a0a0a] text-[#e5e5e5] relative overflow-y-auto">
            {/* Background Grid */}
            <div className="absolute inset-0 bg-[linear-gradient(to_right,#333_1px,transparent_1px),linear-gradient(to_bottom,#333_1px,transparent_1px)] bg-[size:40px_40px] opacity-[0.05] pointer-events-none" />

            <div className="relative z-10">
              <div className="flex justify-between items-start mb-8 border-b border-[#333] pb-4">
                <span className="font-mono text-xs text-[#666]">/// CLASSIFIED_DOCUMENT</span>
                <span className="font-mono text-xs text-[#00ffd1] animate-pulse">● LIVE</span>
              </div>

              <h2 className="text-4xl md:text-5xl font-heading font-black uppercase leading-none mb-6 text-white tracking-tighter">
                {product.name}
              </h2>

              <div className="font-mono text-xs md:text-sm text-[#888] space-y-4 mb-8 leading-relaxed">
                <p>{product.description}</p>
                <p>
                  Specifications: <br/>
                  - MATERIAL: 100% UNKNOWN FIBER<br/>
                  - ORIGIN: [REDACTED]<br/>
                  - DURABILITY: COMBAT READY
                </p>
              </div>

              {/* Sizes */}
              <div className="mb-8">
                <p className="font-mono text-xs text-[#666] mb-3 uppercase">Select Configuration:</p>
                <div className="flex gap-2">
                  {['XS', 'S', 'M', 'L', 'XL'].map((size) => (
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
                    <p className="text-[#666] mb-1">ITEM_ID</p>
                    <p className="text-[#e5e5e5]">{product.id}</p>
                  </div>
                  <div className="border border-[#333] bg-[#111] p-3">
                    <p className="text-[#666] mb-1">CATEGORY</p>
                    <p className="text-[#e5e5e5]">{product.category}</p>
                  </div>
                </div>

                {detailSections.map((section) => (
                  <section key={section.title} className="border border-[#333] bg-[#0f0f0f]">
                    <div className="px-4 py-2 border-b border-[#333] bg-[#111] flex items-center justify-between">
                      <h3 className="font-mono text-[11px] tracking-widest uppercase text-[#00ffd1]">
                        {section.title}
                      </h3>
                      <span className="font-mono text-[10px] text-[#555]">SCROLLABLE</span>
                    </div>
                    <div className="p-4 font-mono text-xs md:text-sm text-[#9a9a9a] leading-relaxed space-y-3">
                      <p>{section.body}</p>
                      <p>
                        Placeholder paragraph for future product post content. You can attach longer markdown/CMS text here and keep stacking sections below without breaking the modal layout.
                      </p>
                    </div>
                  </section>
                ))}
              </div>
            </div>

            {/* Bottom Actions */}
            <div className="relative z-10 mt-auto pt-2">
              <div className="flex justify-between items-end mb-6">
                 <span className="font-mono text-xs text-[#666]">PRICE_UNIT</span>
                 <span className="font-heading text-4xl text-[#e5e5e5]">${product.price}</span>
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
                    <span>{selectedSize ? 'ACQUIRE_ASSET' : 'SELECT_SIZE'}</span>
                    <span>→</span>
                 </span>
              </button>
              
              <p className="mt-4 font-mono text-[10px] text-[#444] text-center">
                WARNING: THIS ITEM MAY CAUSE SOCIAL DISRUPTION.
              </p>
            </div>

          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
