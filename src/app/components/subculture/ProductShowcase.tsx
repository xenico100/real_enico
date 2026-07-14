'use client';

import Image from 'next/image';
import { startTransition, useDeferredValue, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  PRODUCT_CATEGORIES,
  type ProductCategory,
} from '@/app/constants/productCategories';
import {
  type FashionCartAdditionFeedback,
  getFashionCartItemKey,
  useFashionCart,
} from '@/app/context/FashionCartContext';
import { useAuth } from '@/app/context/AuthContext';
import { shouldBypassImageOptimization } from '@/lib/images';
import {
  buildProductCatalog,
  NICEPAY_TEST_PRODUCT_ID,
  type Product,
} from '@/lib/storefront/productCatalog';
import {
  buildStorefrontSelect,
  extractMissingStorefrontColumn,
  STOREFRONT_PRODUCT_FIELDS,
  type StorefrontProductRow,
} from '@/lib/storefront/shared';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';

interface ProductShowcaseProps {
  initialProducts?: Product[];
  usingFallbackCatalog?: boolean;
  onProductClick: (product: Product) => void;
}

export type { Product };

const ALL_CATEGORY = '전체' as const;
const PRIMARY_ADMIN_EMAIL = 'morba9850@gmail.com';
const ADMIN_EMAIL_DOMAIN = 'enicoveck.com';
type ProductFilterCategory = typeof ALL_CATEGORY | ProductCategory;

const CATEGORY_LABELS: Record<ProductFilterCategory, string> = {
  전체: 'All',
  아우터: 'Outerwear',
  셔츠: 'Shirts',
  팬츠: 'Pants',
  가방: 'Bags',
  악세사리: 'Accessories',
  인형: 'Dolls',
  드레스: 'Dresses',
};

function getCategoryLabel(category: string) {
  return category in CATEGORY_LABELS
    ? CATEGORY_LABELS[category as keyof typeof CATEGORY_LABELS]
    : category;
}

function isDesignatedAdmin(email: string | null | undefined) {
  const normalized = (email || '').trim().toLowerCase();
  if (!normalized) return false;
  return normalized === PRIMARY_ADMIN_EMAIL || normalized.endsWith(`@${ADMIN_EMAIL_DOMAIN}`);
}

interface ProductCardProps {
  product: Product;
  isInCart: boolean;
  isSoldOut: boolean;
  cartFeedback: FashionCartAdditionFeedback | null;
  onProductClick: (product: Product) => void;
  onAddToCart: (product: Product) => void;
}

function ProductCard({
  product,
  isInCart,
  isSoldOut,
  cartFeedback,
  onProductClick,
  onAddToCart,
}: ProductCardProps) {
  const shouldUseDirectImage = shouldBypassImageOptimization(product.image);
  const itemKey = getFashionCartItemKey(product.id, null);
  const [isCartBurstVisible, setIsCartBurstVisible] = useState(false);

  useEffect(() => {
    if (cartFeedback?.itemKey !== itemKey) return;

    setIsCartBurstVisible(true);
    const timeoutId = window.setTimeout(() => {
      setIsCartBurstVisible(false);
    }, 950);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [cartFeedback, itemKey]);

  return (
    <motion.div
      layout
      onClick={() => onProductClick(product)}
      className="group relative cursor-pointer overflow-hidden bg-white border border-[#d1d5db] shadow-sm transition-all duration-300 hover:border-[#b8001f] hover:shadow-md"
    >
      <AnimatePresence>
        {isCartBurstVisible ? (
          <motion.div
            key={`${itemKey}-cart-burst`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="pointer-events-none absolute inset-0 z-30"
          >
            <motion.div
              initial={{ opacity: 0.78, scale: 0.88 }}
              animate={{ opacity: 0, scale: 1.24 }}
              transition={{ duration: 0.8, ease: 'easeOut' }}
              className="absolute inset-0 bg-[radial-gradient(circle_at_50%_52%,rgba(184,0,31,0.38)_0%,rgba(184,0,31,0.16)_32%,rgba(184,0,31,0)_74%)]"
            />
            <motion.div
              initial={{ opacity: 0.45, x: '-100%' }}
              animate={{ opacity: 0, x: '125%' }}
              transition={{ duration: 0.72, ease: 'easeOut' }}
              className="absolute inset-y-0 left-[-22%] w-[44%] bg-[linear-gradient(90deg,transparent,rgba(255,180,195,0.8),transparent)] blur-md"
            />
          </motion.div>
        ) : null}
      </AnimatePresence>

      <div className="relative overflow-hidden bg-[#f8f9fa] aspect-[1080/1350]">
        <div className="absolute inset-0 bg-[#b8001f] mix-blend-color opacity-0 z-10 transition-opacity duration-300 group-hover:opacity-20" />

        <Image
          src={product.image}
          alt={product.name}
          fill
          unoptimized={shouldUseDirectImage}
          sizes="(max-width: 768px) 50vw, (max-width: 1280px) 33vw, 25vw"
          className="object-contain object-center bg-[#f8f9fa]"
        />

        <div className="pointer-events-none absolute inset-0 z-20 opacity-0 transition-opacity duration-100 mix-blend-exclusion group-hover:opacity-100">
          <div className="h-full w-full bg-[repeating-linear-gradient(0deg,transparent,transparent_2px,#fff_3px)] opacity-20" />
        </div>
      </div>

      <div className="relative overflow-hidden p-2 md:p-4">
        <div className="absolute inset-0 z-0 bg-white" />

        <div className="relative z-10 flex flex-col gap-1.5 md:gap-2">
          <h3 className="line-clamp-2 font-heading text-[11px] uppercase leading-tight text-[#111827] transition-colors group-hover:text-[#b8001f] md:text-xl md:leading-none font-bold">
            {product.name}
          </h3>

          <div className="mt-1 flex items-center justify-between md:mt-2">
            <span className="truncate font-mono text-[9px] text-[#4b5563] md:text-xs font-semibold">
              {getCategoryLabel(product.category)}
            </span>
            <div className="flex items-center gap-2">
              {isSoldOut ? (
                <span className="font-mono text-[9px] font-bold uppercase tracking-widest text-[#dc2626] md:text-[10px]">
                  품절
                </span>
              ) : null}
              <span className="whitespace-nowrap font-mono text-[10px] font-bold text-[#111827] md:text-sm">
                {product.price.toLocaleString('ko-KR')}원
              </span>
            </div>
          </div>

          <div className="relative mt-2 md:mt-3">
            <AnimatePresence>
              {isCartBurstVisible ? (
                <motion.span
                  key={`${itemKey}-cart-toast`}
                  initial={{ opacity: 0, y: 6, scale: 0.92 }}
                  animate={{ opacity: 1, y: -10, scale: 1 }}
                  exit={{ opacity: 0, y: -18, scale: 0.96 }}
                  transition={{ duration: 0.55, ease: 'easeOut' }}
                  className="pointer-events-none absolute right-2 top-0 z-20 rounded-full border border-[#d93853] bg-[#ffe6eb] px-2.5 py-1 font-mono text-[9px] font-black uppercase tracking-[0.22em] text-[#6e0013] shadow-[0_10px_24px_rgba(184,0,31,0.28)]"
                >
                  + cart
                </motion.span>
              ) : null}
            </AnimatePresence>

            <motion.button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                if (isInCart || isSoldOut) return;
                onAddToCart(product);
              }}
              disabled={isInCart || isSoldOut}
              animate={
                isCartBurstVisible
                  ? {
                      scale: [1, 0.97, 1.04, 1],
                      boxShadow: [
                        '0 0 0 rgba(184,0,31,0)',
                        '0 0 0 rgba(184,0,31,0)',
                        '0 0 30px rgba(184,0,31,0.38)',
                        '0 0 0 rgba(184,0,31,0)',
                      ],
                    }
                  : { scale: 1, boxShadow: '0 0 0 rgba(184,0,31,0)' }
              }
              transition={{ duration: 0.72, ease: 'easeOut' }}
              className={`relative w-full overflow-hidden border px-2 py-2 text-[10px] font-mono uppercase tracking-widest transition-[color,background-color,border-color,transform] md:text-xs font-bold ${
                isSoldOut
                  ? 'cursor-not-allowed border-[#f87171] bg-[#fef2f2] text-[#991b1b]'
                  : isInCart
                    ? 'cursor-default border-[#d93853] bg-[#fff1f2] text-[#8f0018]'
                    : 'border-[#b8001f] text-[#b8001f] hover:bg-[#b8001f] hover:text-white'
              }`}
            >
              <AnimatePresence>
                {isCartBurstVisible ? (
                  <motion.span
                    key={`${itemKey}-button-sweep`}
                    initial={{ opacity: 0.95, x: '-100%' }}
                    animate={{ opacity: 0, x: '115%' }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.58, ease: 'easeOut' }}
                    className="pointer-events-none absolute inset-y-0 left-[-25%] w-[48%] bg-[linear-gradient(90deg,transparent,rgba(255,224,235,0.95),transparent)]"
                  />
                ) : null}
              </AnimatePresence>
              <span className="relative z-10">
                {isSoldOut ? '품절' : isInCart ? '장바구니 담김' : '장바구니 담기'}
              </span>
            </motion.button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

export function ProductShowcase({
  initialProducts = [],
  usingFallbackCatalog = false,
  onProductClick,
}: ProductShowcaseProps) {
  const { cart, addToCart, lastAddedItem } = useFashionCart();
  const { isAuthenticated, user } = useAuth();
  const [activeCategory, setActiveCategory] = useState<ProductFilterCategory>(ALL_CATEGORY);
  const [catalogProducts, setCatalogProducts] = useState<Product[]>(initialProducts);
  const [isRecoveringProducts, setIsRecoveringProducts] = useState(false);
  const canViewNicepayTestProduct = isAuthenticated && isDesignatedAdmin(user?.email);
  const shouldShowNicepayTestProduct =
    canViewNicepayTestProduct &&
    (!usingFallbackCatalog ||
      catalogProducts.some((product) => product.id !== NICEPAY_TEST_PRODUCT_ID));
  const visibleCatalogProducts = shouldShowNicepayTestProduct
    ? catalogProducts
    : catalogProducts.filter((product) => product.id !== NICEPAY_TEST_PRODUCT_ID);
  const categories = [ALL_CATEGORY, ...PRODUCT_CATEGORIES] as const;
  const deferredActiveCategory = useDeferredValue(activeCategory);
  const filteredProducts =
    deferredActiveCategory === ALL_CATEGORY
      ? visibleCatalogProducts
      : visibleCatalogProducts.filter((product) => product.category === deferredActiveCategory);
  const categoryCounts = categories.reduce<Record<string, number>>((accumulator, category) => {
    accumulator[category] =
      category === ALL_CATEGORY
        ? visibleCatalogProducts.length
        : visibleCatalogProducts.filter((product) => product.category === category).length;
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
        let fields: string[] = [...STOREFRONT_PRODUCT_FIELDS];
        let orderColumn: 'created_at' | 'updated_at' | null = 'created_at';
        let usePublishedFilter = true;
        let data: StorefrontProductRow[] | null = null;
        let error: { message?: string } | null = null;

        for (let attempt = 0; attempt < STOREFRONT_PRODUCT_FIELDS.length + 5; attempt += 1) {
          let query = supabase.from('products').select(buildStorefrontSelect(fields));

          if (usePublishedFilter) {
            query = query.eq('is_published', true);
          }

          if (orderColumn) {
            query = query.order(orderColumn, { ascending: false });
          }

          const result = await query.returns<StorefrontProductRow[]>();
          data = result.data;
          error = result.error;

          if (!error) {
            break;
          }

          const message = (error.message || '').toLowerCase();
          const missingColumn = extractMissingStorefrontColumn(error);

          if (usePublishedFilter && message.includes('is_published')) {
            usePublishedFilter = false;
            continue;
          }

          if (orderColumn && message.includes(orderColumn)) {
            orderColumn = orderColumn === 'created_at' ? 'updated_at' : null;
            continue;
          }

          if (missingColumn && fields.includes(missingColumn)) {
            fields = fields.filter((field) => field !== missingColumn);
            continue;
          }

          break;
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

    return (
      <ProductCard
        key={product.id}
        product={product}
        isInCart={isInCart}
        isSoldOut={isSoldOut}
        cartFeedback={lastAddedItem}
        onProductClick={onProductClick}
        onAddToCart={(nextProduct) =>
          addToCart({
            id: nextProduct.id,
            name: nextProduct.name,
            price: nextProduct.price,
            quantity: 1,
            image: nextProduct.image,
            category: nextProduct.category,
          })
        }
      />
    );
  });

  return (
    <section
      id="clothes-section"
      className="py-20 bg-[#f8f9fa] min-h-screen border-t border-[#d1d5db] scroll-mt-24"
    >
      <div className="px-4 md:px-10">
        <div className="flex flex-col md:flex-row justify-between items-end mb-16 border-b border-[#d1d5db] pb-4">
          <div>
            <h2 className="text-[10.5rem] md:text-[12rem] lg:text-[14rem] font-heading font-black text-[#111827] uppercase tracking-tighter leading-[0.86]">
              Apparel
            </h2>
          </div>

          <div className="w-full md:w-auto mt-8 md:mt-0 md:min-w-[560px] flex flex-col gap-3">
            <div className="relative overflow-hidden border border-[#d1d5db] bg-white text-[#111827] shadow-sm">
              <div className="absolute inset-0 opacity-[0.06] bg-[linear-gradient(rgba(0,0,0,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(0,0,0,0.08)_1px,transparent_1px)] bg-[size:18px_18px]" />

              <div className="relative flex items-end justify-between gap-4 border-b border-[#e5e7eb] px-4 py-4">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-[#4b5563] font-bold">
                    Category
                  </p>
                  <p className="mt-2 font-heading text-[1.9rem] uppercase leading-none tracking-tight text-[#111827]">
                    Categories
                  </p>
                </div>

                <p className="shrink-0 font-heading text-3xl leading-none text-[#b8001f]">
                  {filteredProducts.length}
                  <span className="ml-1 text-xl text-[#4b5563]">/ {visibleCatalogProducts.length}</span>
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
                        onClick={() => {
                          startTransition(() => {
                            setActiveCategory(category);
                          });
                        }}
                        className={`group relative overflow-hidden border px-3 py-3 text-left transition-all duration-200 ${
                          isActive
                            ? 'border-[#b8001f] bg-[#b8001f] text-white shadow-[0_0_24px_rgba(184,0,31,0.18)]'
                            : 'border-[#d1d5db] bg-[#f3f4f6] text-[#111827] hover:border-[#b8001f]/60 hover:bg-white hover:text-[#b8001f]'
                        }`}
                      >
                        <span
                          className={`absolute left-0 top-0 h-full w-[3px] ${
                            isActive
                              ? 'bg-white'
                              : 'bg-[#b8001f]/0 group-hover:bg-[#b8001f]/65'
                          }`}
                        />
                        <span
                          className={`block font-mono text-[10px] uppercase tracking-[0.2em] font-bold ${
                            isActive ? 'text-white/80' : 'text-[#4b5563]'
                          }`}
                        >
                          {String(index + 1).padStart(2, '0')}
                        </span>
                        <span className="mt-2 block font-heading text-[1.12rem] uppercase leading-none tracking-tight">
                          {getCategoryLabel(category)}
                        </span>
                        <span
                          className={`mt-3 block font-mono text-[11px] font-bold ${
                            isActive ? 'text-white/90' : 'text-[#4b5563]'
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
          <div className="mb-6 border border-[#d1d5db] bg-white shadow-sm px-4 py-3 font-mono text-[11px] text-[#4b5563] font-semibold">
            {isRecoveringProducts
              ? '실제 의류 게시물을 다시 불러오는 중입니다...'
              : '실제 의류 게시물을 찾지 못했습니다. 샘플 images는 더 이상 표시하지 않습니다.'}
          </div>
        ) : null}

        {visibleCatalogProducts.length === 0 ? (
          <div className="border border-[#d1d5db] bg-white shadow-sm px-4 py-10 text-center font-mono text-sm text-[#4b5563] font-semibold">
            표시할 의류 게시물이 없습니다.
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="border border-[#d1d5db] bg-white shadow-sm px-4 py-10 text-center font-mono text-sm text-[#4b5563] font-semibold">
            이 탭에 표시할 의류 게시물이 없습니다.
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
