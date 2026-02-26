'use client';

import { useEffect, useState } from 'react';
import Masonry, { ResponsiveMasonry } from 'react-responsive-masonry';
import { motion } from 'motion/react';

export interface Product {
  id: string;
  name: string;
  category: string;
  price: number;
  image: string;
  description: string;
}

const products: Product[] = [
  {
    id: 'AX-001',
    name: 'TACTICAL DECONSTRUCTED VEST',
    category: 'OUTERWEAR',
    price: 890,
    image: 'https://images.unsplash.com/photo-1764787016268-31d48b3978f0?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHx0YWN0aWNhbCUyMHZlc3QlMjBzdHJlZXR3ZWFyfGVufDF8fHx8MTc3MDE3Mjk0Nnww&ixlib=rb-4.1.0&q=80&w=1080',
    description: 'Military-inspired vest with asymmetric construction',
  },
  {
    id: 'AX-002',
    name: 'AVANT-GARDE ASYMMETRIC COAT',
    category: 'OUTERWEAR',
    price: 1250,
    image: 'https://images.unsplash.com/photo-1764998112680-2f617dc9be40?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxhdmFudCUyMGdhcmRlJTIwZmFzaGlvbiUyMGJsYWNrfGVufDF8fHx8MTc3MDE3Mjk0NXww&ixlib=rb-4.1.0&q=80&w=1080',
    description: 'Experimental silhouette with deconstructed elements',
  },
  {
    id: 'AX-003',
    name: 'DYSTOPIAN FIELD JACKET',
    category: 'OUTERWEAR',
    price: 980,
    image: 'https://images.unsplash.com/photo-1764697584354-eb6d52727e04?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxkeXN0b3BpYW4lMjBmYXNoaW9uJTIwZWRpdG9yaWFsfGVufDF8fHx8MTc3MDE3Mjk0MXww&ixlib=rb-4.1.0&q=80&w=1080',
    description: 'Post-apocalyptic aesthetic with functional details',
  },
  {
    id: 'AX-004',
    name: 'INDUSTRIAL COMBAT BOOTS',
    category: 'FOOTWEAR',
    price: 450,
    image: 'https://images.unsplash.com/photo-1632513985069-e2559c8fa70b?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHx1bmRlcmdyb3VuZCUyMGZhc2hpb24lMjBib290c3xlbnwxfHx8fDE3NzAxNzI5NDF8MA&ixlib=rb-4.1.0&q=80&w=1080',
    description: 'Heavy-duty boots with reinforced steel construction',
  },
  {
    id: 'AX-005',
    name: 'RECONSTRUCTED TECH JACKET',
    category: 'OUTERWEAR',
    price: 1120,
    image: 'https://images.unsplash.com/photo-1628565931779-4f4f0b4f578a?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxkZWNvbnN0cnVjdGVkJTIwamFja2V0JTIwZmFzaGlvbnxlbnwxfHx8fDE3NzAxNzI5NDV8MA&ixlib=rb-4.1.0&q=80&w=1080',
    description: 'Futuristic streetwear with modular components',
  },
  {
    id: 'AX-006',
    name: 'ANARCHIC CHAIN HARNESS',
    category: 'ACCESSORIES',
    price: 320,
    image: 'https://images.unsplash.com/photo-1558015382-8feeaeb602f6?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxwdW5rJTIwZmFzaGlvbiUyMGFjY2Vzc29yaWVzJTIwY2hhaW5zfGVufDF8fHx8MTc3MDE3Mjk0Nnww&ixlib=rb-4.1.0&q=80&w=1080',
    description: 'Industrial chains with custom hardware',
  },
  {
    id: 'AX-007',
    name: 'CYBERPUNK UTILITY VEST',
    category: 'OUTERWEAR',
    price: 780,
    image: 'https://images.unsplash.com/photo-1587038255943-390cadaefffe?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxmdXR1cmlzdGljJTIwc3RyZWV0d2VhciUyMGphY2tldHxlbnwxfHx8fDE3NzAxNzI5NDB8MA&ixlib=rb-4.1.0&q=80&w=1080',
    description: 'Multi-pocket design with reflective accents',
  },
  {
    id: 'AX-008',
    name: 'HYPERREAL ACCESSORY KIT',
    category: 'ACCESSORIES',
    price: 560,
    image: 'https://images.unsplash.com/photo-1652766540048-de0a878a3266?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxpbmR1c3RyaWFsJTIwZmFzaGlvbiUyMGFjY2Vzc29yaWVzfGVufDF8fHx8MTc3MDE3Mjk0Mnww&ixlib=rb-4.1.0&q=80&w=1080',
    description: 'Complete set of industrial-grade accessories',
  },
];

interface ProductShowcaseProps {
  onProductClick: (product: Product) => void;
}

export function ProductShowcase({ onProductClick }: ProductShowcaseProps) {
  const [activeCategory, setActiveCategory] = useState('ALL');
  const [isHydrated, setIsHydrated] = useState(false);
  const categories = ['ALL', 'OUTERWEAR', 'FOOTWEAR', 'ACCESSORIES'];

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  const filteredProducts = activeCategory === 'ALL' 
    ? products 
    : products.filter(product => product.category === activeCategory);

  const productCards = filteredProducts.map((product) => (
    <motion.div
      key={product.id}
      initial={{ opacity: 0, y: 50 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5 }}
      onClick={() => onProductClick(product)}
      className="group cursor-pointer relative bg-[#111] border border-[#333] hover:border-[#00ffd1] transition-colors duration-300"
    >
      {/* Image Container */}
      <div className="relative aspect-[3/4] overflow-hidden">
        <div className="absolute inset-0 bg-[#00ffd1] mix-blend-color opacity-0 group-hover:opacity-20 z-10 transition-opacity duration-300" />
        
        {/* Image */}
        <img
          src={product.image}
          alt={product.name}
          className="w-full h-full object-cover contrast-125 brightness-90 group-hover:scale-105 transition-transform duration-500 ease-out"
        />
        
        {/* Glitch Overlay Elements on Hover */}
        <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-100 z-20 mix-blend-exclusion pointer-events-none">
           <div className="w-full h-full bg-[repeating-linear-gradient(0deg,transparent,transparent_2px,#000_3px)] opacity-20" />
        </div>
      </div>

      {/* Content */}
      <div className="p-4 relative overflow-hidden">
         {/* Background noise/scanlines */}
         <div className="absolute inset-0 bg-[#0a0a0a] z-0" />
         
         <div className="relative z-10 flex flex-col gap-2">
           <div className="flex justify-between items-start border-b border-[#333] pb-2 mb-2">
             <span className="font-mono text-[10px] text-[#00ffd1]">{product.id}</span>
             <span className="font-mono text-[10px] text-[#666]">IN_STOCK</span>
           </div>
           
           <h3 className="font-heading text-xl uppercase leading-none text-[#e5e5e5] group-hover:text-[#00ffd1] transition-colors">
             {product.name}
           </h3>
           
           <div className="flex justify-between items-center mt-2">
             <span className="font-mono text-xs text-[#888]">{product.category}</span>
             <span className="font-mono text-sm font-bold text-[#e5e5e5]">${product.price}</span>
           </div>
         </div>
      </div>

      {/* "Sticker" */}
      <div className="absolute top-2 right-2 z-30 opacity-0 group-hover:opacity-100 transition-opacity duration-300 transform rotate-12">
         <div className="bg-[#00ffd1] text-black font-heading text-xs px-2 py-1 uppercase tracking-tighter border border-white">
           Figure.0{product.id.split('-')[1]}
         </div>
      </div>

    </motion.div>
  ));

  return (
    <section id="clothes-section" className="py-20 bg-[#050505] min-h-screen border-t border-[#333] scroll-mt-24">
      <div className="px-4 md:px-10">
        <div className="mb-6 inline-flex items-center gap-3 border border-[#333] bg-[#0b0b0b] px-3 py-2">
          <span className="font-mono text-[10px] tracking-[0.2em] text-[#00ffd1]">SECTION_01</span>
          <span className="h-3 w-px bg-[#333]" />
          <span className="font-mono text-[11px] tracking-[0.18em] text-[#b8b8b8]">CLOTHES</span>
        </div>
        
        {/* Header - Industrial Label Style */}
        <div className="flex flex-col md:flex-row justify-between items-end mb-16 border-b border-[#333] pb-4">
          <div>
            <h2 className="text-4xl md:text-7xl font-heading font-black text-[#e5e5e5] uppercase tracking-tighter">
              Clothes
            </h2>
            <p className="font-mono text-xs text-[#666] mt-2">
              /// CLOTHING POSTS // PRODUCT FEED
            </p>
          </div>
          
          <div className="flex flex-wrap gap-3 mt-8 md:mt-0">
            {categories.map((cat) => (
              <motion.button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                whileHover={{ y: -2 }}
                whileTap={{ scale: 0.97, y: 0 }}
                className={`group relative overflow-hidden min-w-[112px] text-left font-mono text-xs px-3 py-2 uppercase tracking-widest border transition-all duration-300 ${
                  activeCategory === cat 
                    ? 'bg-[#00ffd1] text-black font-bold border-[#00ffd1] shadow-[0_0_0_1px_rgba(0,255,209,0.35),0_0_18px_rgba(0,255,209,0.18)]' 
                    : 'bg-[#0a0a0a] text-[#666] border-[#333] hover:text-[#00ffd1] hover:border-[#00ffd1] hover:bg-[#111]'
                }`}
              >
                <span className={`absolute inset-0 opacity-0 transition-opacity duration-200 ${
                  activeCategory === cat ? 'opacity-100' : 'group-hover:opacity-100'
                }`}>
                  <span className={`absolute inset-0 ${
                    activeCategory === cat
                      ? 'bg-[linear-gradient(90deg,rgba(255,255,255,0.18),rgba(255,255,255,0.05),transparent)]'
                      : 'bg-[linear-gradient(90deg,rgba(0,255,209,0.14),rgba(0,255,209,0.05),transparent)]'
                  }`} />
                  <span className={`absolute left-0 top-0 h-full w-8 ${
                    activeCategory === cat ? 'bg-black/10' : 'bg-[#00ffd1]/10'
                  } blur-md`} />
                </span>

                <span
                  className={`absolute inset-x-0 top-0 h-[1px] translate-x-[-100%] transition-transform duration-300 ${
                    activeCategory === cat
                      ? 'bg-black/70 translate-x-0'
                      : 'bg-[#00ffd1] group-hover:translate-x-0'
                  }`}
                />

                <span className="relative z-10 flex items-center justify-between gap-3">
                  <span className="flex flex-col leading-tight">
                    <span className={`${activeCategory === cat ? 'text-black/70' : 'text-[#555] group-hover:text-[#00ffd1]/70'} text-[9px] tracking-[0.18em] transition-colors`}>
                      FILTER
                    </span>
                    <span>{`[${cat}]`}</span>
                  </span>
                  <span
                    className={`text-[10px] transition-all duration-200 ${
                      activeCategory === cat
                        ? 'opacity-100 translate-x-0'
                        : 'opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0'
                    }`}
                  >
                    ///
                  </span>
                </span>

                <span className={`absolute inset-0 pointer-events-none opacity-0 transition-opacity duration-150 ${
                  activeCategory === cat ? 'opacity-30' : 'group-hover:opacity-20'
                }`}>
                  <span className="absolute inset-0 bg-[repeating-linear-gradient(0deg,transparent,transparent_2px,#000_3px)]" />
                </span>
              </motion.button>
            ))}
          </div>
        </div>

        {/* Grid */}
        {isHydrated ? (
          <ResponsiveMasonry columnsCountBreakPoints={{350: 1, 750: 2, 900: 3, 1200: 4}}>
            <Masonry gutter="1.5rem">{productCards}</Masonry>
          </ResponsiveMasonry>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
            {productCards}
          </div>
        )}

      </div>
    </section>
  );
}
