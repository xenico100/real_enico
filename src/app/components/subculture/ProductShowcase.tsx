'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';
import {
  PRODUCT_CATEGORIES,
  type ProductCategory,
} from '@/app/constants/productCategories';
import {
  getFashionCartItemKey,
  useFashionCart,
} from '@/app/context/FashionCartContext';
import { shouldBypassImageOptimization } from '@/lib/images';
import {
  buildProductCatalog,
  type Product,
} from '@/lib/storefront/productCatalog';
import { STOREFRONT_PRODUCT_SELECT, type StorefrontProductRow } from '@/lib/storefront/shared';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';

interface ProductShowcaseProps {
  initialProducts?: Product[];
  usingFallbackCatalog?: boolean;
  onProductClick: (product: Product) => void;
}

export type { Product };

export function ProductShowcase({
  initialProducts = [],
  usingFallbackCatalog = false,
  onProductClick,
}: ProductShowcaseProps) {
  const { cart, addToCart } = useFashionCart();
  const [activeCategory, setActiveCategory] = useState<'전체' | ProductCategory>('전체');
  const [catalogProducts, setCatalogProducts] = useState<Product[]>(initialProducts);
  const [isRecoveringProducts, setIsRecoveringProducts] = useState(false);
  const categories = ['전체', ...PRODUCT_CATEGORIES] as const;
  const filteredProducts =
    activeCategory === '전체'
      ? catalogProducts
      : catalogProducts.filter((product) => product.category === activeCategory);
  const categoryCounts = categories.reduce<Record<string, number>>((accumulator, category) => {
    accumulator[category] =
      category === '전체'
        ? catalogProducts.length
        : catalogProducts.filter((product) => product.category === category).length;
    return accumulator;
  }, {});
  const cartProductKeys = new Set(
    cart.map((item) => getFashionCartItemKey(item.id, item.selectedSize)),
  );

  useEffect(() => {
    setCatalogProducts(initialProducts);
  }, [initialProducts]);

  useEffect(() => {
    if (!usingFallbackCatalog) return;

    let active = true;

    const recoverProducts = async () => {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) return;

      setIsRecoveringProducts(true);

      try {
        let { data, error } = await supabase
          .from('products')
          .select(STOREFRONT_PRODUCT_SELECT)
          .eq('is_published', true)
          .order('updated_at', { ascending: false });

        if (error?.message?.toLowerCase().includes('updated_at')) {
          const createdAtFallback = await supabase
            .from('products')
            .select(STOREFRONT_PRODUCT_SELECT)
            .eq('is_published', true)
            .order('created_at', { ascending: false });
          data = createdAtFallback.data;
          error = createdAtFallback.error;
        }

        if (error?.message?.toLowerCase().includes('is_published')) {
          const fallbackQuery = await supabase
            .from('products')
            .select(STOREFRONT_PRODUCT_SELECT)
            .order('updated_at', { ascending: false });
          data = fallbackQuery.data;
          error = fallbackQuery.error;

          if (error?.message?.toLowerCase().includes('updated_at')) {
            const createdAtFallback = await supabase
              .from('products')
              .select(STOREFRONT_PRODUCT_SELECT)
              .order('created_at', { ascending: false });
            data = createdAtFallback.data;
            error = createdAtFallback.error;
          }
        }

        if (error || !active) return;

        const recoveredProducts = buildProductCatalog((data ?? []) as StorefrontProductRow[]);
        if (recoveredProducts.length > 0) {
          setCatalogProducts(recoveredProducts);
        }
      } finally {
        if (active) {
          setIsRecoveringProducts(false);
        }
      }
    };

    void recoverProducts();

    return () => {
      active = false;
    };
  }, [usingFallbackCatalog]);

  const productCards = filteredProducts.map((product) => {
    const isInCart = cartProductKeys.has(getFashionCartItemKey(product.id, null));
    const isSoldOut = Boolean(product.isSoldOut);
    const shouldUseDirectImage = shouldBypassImageOptimization(product.image);

    return (
      <div
        key={product.id}
        onClick={() => onProductClick(product)}
        className="group cursor-pointer relative bg-[#111] border border-[#333] hover:border-[#00ffd1] transition-colors duration-300"
      >
        <div className="relative overflow-hidden bg-black aspect-[1080/1350]">
          <div className="absolute inset-0 bg-[#00ffd1] mix-blend-color opacity-0 group-hover:opacity-20 z-10 transition-opacity duration-300" />

          <Image
            src={product.image}
            alt={product.name}
            fill
            unoptimized={shouldUseDirectImage}
            sizes="(max-width: 768px) 50vw, (max-width: 1280px) 33vw, 25vw"
            className="object-contain object-center bg-black"
          />

          <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-100 z-20 mix-blend-exclusion pointer-events-none">
            <div className="w-full h-full bg-[repeating-linear-gradient(0deg,transparent,transparent_2px,#000_3px)] opacity-20" />
          </div>
        </div>

        <div className="p-2 md:p-4 relative overflow-hidden">
          <div className="absolute inset-0 bg-[#0a0a0a] z-0" />

          <div className="relative z-10 flex flex-col gap-1.5 md:gap-2">
            <h3 className="font-heading text-[11px] md:text-xl uppercase leading-tight md:leading-none text-[#e5e5e5] group-hover:text-[#00ffd1] transition-colors line-clamp-2">
              {product.name}
            </h3>

            <div className="flex justify-between items-center mt-1 md:mt-2">
              <span className="font-mono text-[9px] md:text-xs text-[#888] truncate">
                {product.category}
              </span>
              <div className="flex items-center gap-2">
                {isSoldOut ? (
                  <span className="font-mono text-[9px] md:text-[10px] font-bold text-[#ff8888] uppercase tracking-widest">
                    품절
                  </span>
                ) : null}
                <span className="font-mono text-[10px] md:text-sm font-bold text-[#e5e5e5] whitespace-nowrap">
                  {product.price.toLocaleString('ko-KR')}원
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                if (isInCart || isSoldOut) return;
                addToCart({
                  id: product.id,
                  name: product.name,
                  price: product.price,
                  quantity: 1,
                  image: product.image,
                  category: product.category,
                });
              }}
              disabled={isInCart || isSoldOut}
              className={`mt-2 md:mt-3 w-full border px-2 py-2 text-[10px] md:text-xs font-mono uppercase tracking-widest transition-colors ${
                isSoldOut
                  ? 'border-[#6d2d2d] bg-[#1f0e0e] text-[#ffabab] cursor-not-allowed'
                  : isInCart
                    ? 'border-[#2d6d62] bg-[#0e1f1c] text-[#8fd6c8] cursor-default'
                    : 'border-[#00ffd1] text-[#00ffd1] hover:bg-[#00ffd1] hover:text-black'
              }`}
            >
              {isSoldOut ? '품절' : isInCart ? '장바구니 담김 (재고 1개)' : '장바구니 담기'}
            </button>
          </div>
        </div>
      </div>
    );
  });

  return (
    <section
      id="clothes-section"
      className="py-20 bg-[#050505] min-h-screen border-t border-[#333] scroll-mt-24"
    >
      <div className="px-4 md:px-10">
        <div className="flex flex-col md:flex-row justify-between items-end mb-16 border-b border-[#333] pb-4">
          <div>
            <h2 className="text-[10.5rem] md:text-[12rem] lg:text-[14rem] font-heading font-black text-[#e5e5e5] uppercase tracking-tighter leading-[0.86]">
              의류
            </h2>
          </div>

          <div className="w-full md:w-auto mt-8 md:mt-0 md:min-w-[560px] flex flex-col gap-3">
            <div className="relative overflow-hidden border border-[#2a2a2a] bg-[#0a0a0a] text-[#f3f3f3] shadow-[0_0_0_1px_rgba(255,255,255,0.03)]">
              <div className="absolute inset-0 opacity-[0.08] bg-[linear-gradient(rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.08)_1px,transparent_1px)] bg-[size:18px_18px]" />

              <div className="relative flex items-end justify-between gap-4 border-b border-[#242424] px-4 py-4">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-[#6f6f6f]">
                    Category
                  </p>
                  <p className="mt-2 font-heading text-[1.9rem] uppercase leading-none tracking-tight text-white">
                    카테고리
                  </p>
                </div>

                <p className="shrink-0 font-heading text-3xl leading-none text-[#00ffd1]">
                  {filteredProducts.length}
                  <span className="ml-1 text-xl text-[#5d5d5d]">/ {catalogProducts.length}</span>
                </p>
              </div>

              <div className="relative p-3 md:p-4">
                <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                  {categories.map((category, index) => {
                    const isActive = activeCategory === category;

                    return (
                      <button
                        key={category}
                        type="button"
                        onClick={() => setActiveCategory(category)}
                        className={`group relative overflow-hidden border px-3 py-3 text-left transition-all duration-200 ${
                          isActive
                            ? 'border-[#00ffd1] bg-[#00ffd1] text-black shadow-[0_0_24px_rgba(0,255,209,0.18)]'
                            : 'border-[#2e2e2e] bg-[#111] text-[#f1f1f1] hover:border-[#00ffd1]/60 hover:text-white'
                        }`}
                      >
                        <span
                          className={`absolute left-0 top-0 h-full w-[3px] ${
                            isActive
                              ? 'bg-black'
                              : 'bg-[#00ffd1]/0 group-hover:bg-[#00ffd1]/65'
                          }`}
                        />
                        <span
                          className={`block font-mono text-[10px] uppercase tracking-[0.2em] ${
                            isActive ? 'text-black/60' : 'text-[#6a6a6a]'
                          }`}
                        >
                          {String(index + 1).padStart(2, '0')}
                        </span>
                        <span className="mt-2 block font-heading text-[1.12rem] uppercase leading-none tracking-tight">
                          {category}
                        </span>
                        <span
                          className={`mt-3 block font-mono text-[11px] ${
                            isActive ? 'text-black/70' : 'text-[#8e8e8e]'
                          }`}
                        >
                          {String(categoryCounts[category]).padStart(2, '0')}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>

        {usingFallbackCatalog ? (
          <div className="mb-6 border border-[#333] bg-[#0a0a0a] px-4 py-3 font-mono text-[11px] text-[#9a9a9a]">
            {isRecoveringProducts
              ? '실제 의류 게시물을 다시 불러오는 중입니다...'
              : '실제 의류 게시물을 찾지 못했습니다. 샘플 이미지는 더 이상 표시하지 않습니다.'}
          </div>
        ) : null}

        {catalogProducts.length === 0 ? (
          <div className="border border-[#333] bg-[#0a0a0a] px-4 py-10 text-center font-mono text-sm text-[#9a9a9a]">
            표시할 의류 게시물이 없습니다.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4 xl:grid-cols-4">
            {productCards}
          </div>
        )}
      </div>
    </section>
  );
}
