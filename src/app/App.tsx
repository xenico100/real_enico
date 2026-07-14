'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { SubcultureHeader } from '@/app/components/subculture/SubcultureHeader';
import { HeroSection } from '@/app/components/subculture/HeroSection';
import { ProductShowcase } from '@/app/components/subculture/ProductShowcase';
import { CollectionSection } from '@/app/components/subculture/CollectionSection';
import { CollectionDetailPopup } from '@/app/components/subculture/CollectionDetailPopup';
import { SubcultureFooter } from '@/app/components/subculture/SubcultureFooter';
import { FashionCartProvider } from '@/app/context/FashionCartContext';
import type { Collection } from '@/lib/storefront/collectionCatalog';
import type { Product } from '@/lib/storefront/productCatalog';

const CartOverlay = dynamic(
  () => import('@/app/components/subculture/CartOverlay').then((mod) => mod.CartOverlay),
  { loading: () => null },
);
const InfoPopup = dynamic(
  () => import('@/app/components/subculture/InfoPopup').then((mod) => mod.InfoPopup),
  { loading: () => null },
);
const ProductDetailPopup = dynamic(
  () =>
    import('@/app/components/subculture/ProductDetailPopup').then((mod) => mod.ProductDetailPopup),
  { loading: () => null },
);
const RandomChatModal = dynamic(
  () => import('@/features/randomChat/RandomChatModal').then((mod) => mod.RandomChatModal),
  { loading: () => null },
);

interface AppProps {
  initialProducts?: Product[];
  usingFallbackProducts?: boolean;
  initialCollections?: Collection[];
  usingFallbackCollections?: boolean;
  initialPopup?: 'about' | 'contact' | 'mypage' | null;
  initialMyPageTab?:
    | 'overview'
    | 'orders'
    | 'saved'
    | 'cart'
    | 'profile'
    | 'dailyStats'
    | 'members'
    | 'adminOrders';
}

export default function App({
  initialProducts,
  usingFallbackProducts,
  initialCollections,
  usingFallbackCollections,
  initialPopup,
  initialMyPageTab,
}: AppProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [activePopup, setActivePopup] = useState<'about' | 'contact' | 'mypage' | null>(null);
  const [isRandomChatOpen, setIsRandomChatOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedCollection, setSelectedCollection] = useState<Collection | null>(null);
  const [ignoreInitialPopup, setIgnoreInitialPopup] = useState(false);
  const deepLinkPopup =
    ignoreInitialPopup ? null : initialPopup || null;
  const shownPopup = activePopup || deepLinkPopup;
  const shouldLockBodyScroll =
    isCartOpen ||
    Boolean(shownPopup) ||
    Boolean(selectedProduct) ||
    Boolean(selectedCollection);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const body = document.body;
    const previousBodyOverflow = body.style.overflow;

    if (shouldLockBodyScroll) {
      body.style.overflow = 'hidden';
    } else {
      body.style.overflow = '';
    }

    return () => {
      body.style.overflow = previousBodyOverflow;
    };
  }, [shouldLockBodyScroll]);

  return (
    <FashionCartProvider>
      <div className="relative min-h-screen w-full overflow-x-hidden bg-[#f8f9fa] font-mono text-[#111827] selection:bg-[#b8001f] selection:text-white">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(0,0,0,0.05),transparent_42%),linear-gradient(180deg,rgba(0,0,0,0.03),transparent_22%)]" />
        <div className="pointer-events-none absolute inset-0 opacity-[0.14] bg-[linear-gradient(rgba(0,0,0,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(0,0,0,0.04)_1px,transparent_1px)] bg-[size:28px_28px]" />

        <SubcultureHeader 
          onCartClick={() => setIsCartOpen(true)}
          onInfoClick={(type) => setActivePopup(type)}
          onRandomChatClick={() => setIsRandomChatOpen(true)}
        />
        
        <main className="relative z-10">
          <HeroSection />
          <ProductShowcase
            initialProducts={initialProducts}
            usingFallbackCatalog={usingFallbackProducts}
            onProductClick={setSelectedProduct}
          />
          <CollectionSection
            initialCollections={initialCollections}
            usingFallbackCatalog={usingFallbackCollections}
            onCollectionClick={setSelectedCollection}
          />
        </main>

        <SubcultureFooter />
        
        {isCartOpen ? (
          <CartOverlay isOpen={isCartOpen} onClose={() => setIsCartOpen(false)} />
        ) : null}
        
        {shownPopup && (
          <InfoPopup 
            type={shownPopup}
            initialMyPageTab={initialMyPageTab}
            onClose={() => {
              setActivePopup(null);
              if (deepLinkPopup) {
                setIgnoreInitialPopup(true);
                router.replace(pathname || '/', { scroll: false });
              }
            }} 
          />
        )}
        
        {selectedProduct && (
          <ProductDetailPopup 
            product={selectedProduct} 
            onClose={() => setSelectedProduct(null)} 
          />
        )}
        
        {selectedCollection && (
          <CollectionDetailPopup 
            collection={selectedCollection} 
            onClose={() => setSelectedCollection(null)} 
          />
        )}

        {isRandomChatOpen ? (
          <RandomChatModal
            open={isRandomChatOpen}
            onClose={() => setIsRandomChatOpen(false)}
          />
        ) : null}
      </div>
    </FashionCartProvider>
  );
}
