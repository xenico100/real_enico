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
  images: string[];
  description: string;
}

type ProductSeed = Omit<Product, 'images'>;

const productsSeed: ProductSeed[] = [
  {
    id: '의류-001',
    name: '전술 해체 베스트',
    category: '아우터',
    price: 890,
    image: 'https://images.unsplash.com/photo-1764787016268-31d48b3978f0?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHx0YWN0aWNhbCUyMHZlc3QlMjBzdHJlZXR3ZWFyfGVufDF8fHx8MTc3MDE3Mjk0Nnww&ixlib=rb-4.1.0&q=80&w=1080',
    description: '비대칭 구조를 적용한 밀리터리 무드 베스트',
  },
  {
    id: '의류-002',
    name: '아방가르드 비대칭 코트',
    category: '아우터',
    price: 1250,
    image: 'https://images.unsplash.com/photo-1764998112680-2f617dc9be40?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxhdmFudCUyMGdhcmRlJTIwZmFzaGlvbiUyMGJsYWNrfGVufDF8fHx8MTc3MDE3Mjk0NXww&ixlib=rb-4.1.0&q=80&w=1080',
    description: '해체 디테일이 들어간 실험적 실루엣 코트',
  },
  {
    id: '의류-003',
    name: '디스토피아 필드 재킷',
    category: '아우터',
    price: 980,
    image: 'https://images.unsplash.com/photo-1764697584354-eb6d52727e04?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxkeXN0b3BpYW4lMjBmYXNoaW9uJTIwZWRpdG9yaWFsfGVufDF8fHx8MTc3MDE3Mjk0MXww&ixlib=rb-4.1.0&q=80&w=1080',
    description: '포스트 아포칼립스 무드와 기능 디테일의 조합',
  },
  {
    id: '의류-004',
    name: '인더스트리얼 컴뱃 부츠',
    category: '신발',
    price: 450,
    image: 'https://images.unsplash.com/photo-1632513985069-e2559c8fa70b?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHx1bmRlcmdyb3VuZCUyMGZhc2hpb24lMjBib290c3xlbnwxfHx8fDE3NzAxNzI5NDF8MA&ixlib=rb-4.1.0&q=80&w=1080',
    description: '강화 구조 디테일이 들어간 헤비 듀티 부츠',
  },
  {
    id: '의류-005',
    name: '리컨스트럭트 테크 재킷',
    category: '아우터',
    price: 1120,
    image: 'https://images.unsplash.com/photo-1628565931779-4f4f0b4f578a?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxkZWNvbnN0cnVjdGVkJTIwamFja2V0JTIwZmFzaGlvbnxlbnwxfHx8fDE3NzAxNzI5NDV8MA&ixlib=rb-4.1.0&q=80&w=1080',
    description: '모듈형 구성의 미래지향 스트리트웨어 재킷',
  },
  {
    id: '의류-006',
    name: '아나키 체인 하네스',
    category: '액세서리',
    price: 320,
    image: 'https://images.unsplash.com/photo-1558015382-8feeaeb602f6?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxwdW5rJTIwZmFzaGlvbiUyMGFjY2Vzc29yaWVzJTIwY2hhaW5zfGVufDF8fHx8MTc3MDE3Mjk0Nnww&ixlib=rb-4.1.0&q=80&w=1080',
    description: '커스텀 하드웨어를 적용한 인더스트리얼 체인',
  },
  {
    id: '의류-007',
    name: '사이버펑크 유틸리티 베스트',
    category: '아우터',
    price: 780,
    image: 'https://images.unsplash.com/photo-1587038255943-390cadaefffe?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxmdXR1cmlzdGljJTIwc3RyZWV0d2VhciUyMGphY2tldHxlbnwxfHx8fDE3NzAxNzI5NDB8MA&ixlib=rb-4.1.0&q=80&w=1080',
    description: '멀티 포켓과 반사 포인트가 들어간 베스트',
  },
  {
    id: '의류-008',
    name: '하이퍼리얼 액세서리 키트',
    category: '액세서리',
    price: 560,
    image: 'https://images.unsplash.com/photo-1652766540048-de0a878a3266?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxpbmR1c3RyaWFsJTIwZmFzaGlvbiUyMGFjY2Vzc29yaWVzfGVufDF8fHx8MTc3MDE3Mjk0Mnww&ixlib=rb-4.1.0&q=80&w=1080',
    description: '인더스트리얼 무드 액세서리 풀세트 구성',
  },
];

const detailImagePool = [
  'https://images.unsplash.com/photo-1483985988355-763728e1935b?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=1080',
  'https://images.unsplash.com/photo-1496747611176-843222e1e57c?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=1080',
  'https://images.unsplash.com/photo-1445205170230-053b83016050?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=1080',
  'https://images.unsplash.com/photo-1539109136881-3be0616acf4b?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=1080',
  'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=1080',
  'https://images.unsplash.com/photo-1504593811423-6dd665756598?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=1080',
];

const products: Product[] = productsSeed.map((product, index) => {
  const extraImages = [
    detailImagePool[index % detailImagePool.length],
    detailImagePool[(index + 2) % detailImagePool.length],
    detailImagePool[(index + 4) % detailImagePool.length],
  ];

  return {
    ...product,
    images: Array.from(new Set([product.image, ...extraImages])),
  };
});

interface ProductShowcaseProps {
  onProductClick: (product: Product) => void;
}

export function ProductShowcase({ onProductClick }: ProductShowcaseProps) {
  const [activeCategory, setActiveCategory] = useState('전체');
  const [isHydrated, setIsHydrated] = useState(false);
  const categories = ['전체', '아우터', '신발', '액세서리'];

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  const filteredProducts = activeCategory === '전체' 
    ? products 
    : products.filter(product => product.category === activeCategory);

  const categoryCounts = {
    전체: products.length,
    아우터: products.filter((product) => product.category === '아우터').length,
    신발: products.filter((product) => product.category === '신발').length,
    액세서리: products.filter((product) => product.category === '액세서리').length,
  };

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
             <span className="font-mono text-[10px] text-[#666]">재고있음</span>
           </div>
           
           <h3 className="font-heading text-xl uppercase leading-none text-[#e5e5e5] group-hover:text-[#00ffd1] transition-colors">
             {product.name}
           </h3>
           
           <div className="flex justify-between items-center mt-2">
             <span className="font-mono text-xs text-[#888]">{product.category}</span>
             <span className="font-mono text-sm font-bold text-[#e5e5e5]">
               {product.price.toLocaleString('ko-KR')}원
             </span>
           </div>
         </div>
      </div>

      {/* "Sticker" */}
      <div className="absolute top-2 right-2 z-30 opacity-0 group-hover:opacity-100 transition-opacity duration-300 transform rotate-12">
         <div className="bg-[#00ffd1] text-black font-heading text-xs px-2 py-1 uppercase tracking-tighter border border-white">
           도면.0{product.id.split('-')[1]}
         </div>
      </div>

    </motion.div>
  ));

  return (
    <section id="clothes-section" className="py-20 bg-[#050505] min-h-screen border-t border-[#333] scroll-mt-24">
      <div className="px-4 md:px-10">
        <div className="mb-6 inline-flex items-center gap-3 border border-[#333] bg-[#0b0b0b] px-3 py-2">
          <span className="font-mono text-[10px] tracking-[0.2em] text-[#00ffd1]">구역_01</span>
          <span className="h-3 w-px bg-[#333]" />
          <span className="font-mono text-[13px] md:text-sm tracking-[0.18em] text-[#b8b8b8]">의류</span>
        </div>
        
        {/* Header - Industrial Label Style */}
        <div className="flex flex-col md:flex-row justify-between items-end mb-16 border-b border-[#333] pb-4">
          <div>
            <h2 className="text-8xl md:text-[9rem] lg:text-[10rem] font-heading font-black text-[#e5e5e5] uppercase tracking-tighter leading-[0.9]">
              의류
            </h2>
          </div>
          
          <div className="w-full md:w-auto mt-8 md:mt-0 md:min-w-[520px] flex flex-col gap-3">
            <div className="border border-[#333] bg-[#090909] p-3 md:p-4">
              <div className="flex items-center justify-between gap-4 mb-3">
                <div>
                  <p className="font-mono text-[10px] tracking-[0.18em] uppercase text-[#00ffd1]">
                    카테고리 필터
                  </p>
                </div>
                <div className="text-right font-mono">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-[#666]">표시 수</p>
                  <p className="text-sm text-[#e5e5e5]">
                    <span className="text-[#00ffd1] font-bold">{filteredProducts.length}</span> / {products.length}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {categories.map((cat) => (
                <motion.button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  whileHover={{ y: -2 }}
                  whileTap={{ scale: 0.97, y: 0 }}
                  className={`group relative overflow-hidden text-left font-mono text-xs px-3 py-2.5 uppercase tracking-widest border transition-all duration-300 ${
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
                    <span className="flex flex-col leading-tight min-w-0">
                      <span className={`${activeCategory === cat ? 'text-black/70' : 'text-[#555] group-hover:text-[#00ffd1]/70'} text-[9px] tracking-[0.18em] transition-colors`}>
                        필터
                      </span>
                      <span className="truncate">{`[${cat}]`}</span>
                    </span>
                    <span className="flex flex-col items-end shrink-0 leading-none">
                      <span
                        className={`text-[10px] transition-all duration-200 ${
                          activeCategory === cat
                            ? 'opacity-100 translate-x-0'
                            : 'opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0'
                        }`}
                      >
                        ///
                      </span>
                      <span className={`${activeCategory === cat ? 'text-black/70' : 'text-[#8a8a8a]'} text-[10px] mt-1`}>
                        {categoryCounts[cat as keyof typeof categoryCounts]}
                      </span>
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
