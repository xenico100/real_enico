'use client';

import { SubcultureHeader } from '@/app/components/subculture/SubcultureHeader';
import { HeroSection } from '@/app/components/subculture/HeroSection';
import { ProductShowcase } from '@/app/components/subculture/ProductShowcase';
import { CollectionSection } from '@/app/components/subculture/CollectionSection';
import { SubcultureFooter } from '@/app/components/subculture/SubcultureFooter';
import { FashionCartProvider } from '@/app/context/FashionCartContext';

const noop = () => {};

export default function StorefrontLoading() {
  return (
    <FashionCartProvider>
      <div className="relative min-h-screen w-full overflow-x-hidden bg-[#f8f9fa] font-mono text-[#111827]">
        <SubcultureHeader
          onCartClick={noop}
          onInfoClick={noop}
          onRandomChatClick={noop}
        />
        <main className="relative z-10" aria-busy="true">
          <HeroSection />
          <ProductShowcase loading onProductClick={noop} />
          <CollectionSection loading onCollectionClick={noop} />
        </main>
        <SubcultureFooter />
      </div>
    </FashionCartProvider>
  );
}
