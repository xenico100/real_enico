'use client';

import { useState, useEffect } from 'react';
import { ReactLenis } from 'lenis/react';
import { SubcultureHeader } from '@/app/components/subculture/SubcultureHeader';
import { HeroSection } from '@/app/components/subculture/HeroSection';
import { ProductShowcase } from '@/app/components/subculture/ProductShowcase';
import { CollectionSection } from '@/app/components/subculture/CollectionSection';
import { CartOverlay } from '@/app/components/subculture/CartOverlay';
import { InfoPopup } from '@/app/components/subculture/InfoPopup';
import { ProductDetailPopup } from '@/app/components/subculture/ProductDetailPopup';
import { CollectionDetailPopup } from '@/app/components/subculture/CollectionDetailPopup';
import { FashionCartProvider } from '@/app/context/FashionCartContext';
import { AuthProvider } from '@/app/context/AuthContext';
import type { Collection } from '@/app/components/subculture/CollectionSection';

export default function App() {
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [activePopup, setActivePopup] = useState<'about' | 'contact' | 'account' | 'mypage' | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [selectedCollection, setSelectedCollection] = useState<Collection | null>(null);
  const [isGlitching, setIsGlitching] = useState(false);
  const [isBootFxActive, setIsBootFxActive] = useState(true);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setIsBootFxActive(false);
      setIsGlitching(false);
    }, 7000);

    return () => clearTimeout(timeout);
  }, []);

  // Random glitch trigger
  useEffect(() => {
    if (!isBootFxActive) return;

    const interval = setInterval(() => {
      if (Math.random() > 0.95) {
        setIsGlitching(true);
        setTimeout(() => setIsGlitching(false), 150);
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [isBootFxActive]);

  return (
    <AuthProvider>
      <FashionCartProvider>
        <ReactLenis root options={{
          duration: 1.2,
          easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
          orientation: 'vertical',
          gestureOrientation: 'vertical',
          smoothWheel: true,
          wheelMultiplier: 1,
          touchMultiplier: 2,
        }}>
        <div className={`w-full min-h-screen bg-[#050505] text-[#e5e5e5] overflow-x-hidden relative font-mono selection:bg-[#00ffd1] selection:text-black ${isBootFxActive && isGlitching ? 'invert hue-rotate-90' : ''}`}>
          
          {/* NOISE OVERLAY */}
          <div className="fixed inset-0 pointer-events-none z-[100] opacity-[0.15] mix-blend-overlay">
            <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] brightness-150 contrast-150" />
          </div>

          {/* SCANLINES */}
          <div className="fixed inset-0 pointer-events-none z-[90] bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[length:100%_2px,3px_100%] pointer-events-none opacity-20" />

          {/* VIGNETTE */}
          <div className="fixed inset-0 pointer-events-none z-[80] bg-[radial-gradient(circle_at_center,transparent_50%,rgba(0,0,0,0.8)_100%)]" />

          {/* FLICKER EFFECT (intro only) */}
          {isBootFxActive && (
            <div className="fixed inset-0 pointer-events-none z-[110] bg-black opacity-[0.02] animate-pulse" />
          )}

          <SubcultureHeader 
            onCartClick={() => setIsCartOpen(true)}
            onInfoClick={(type) => setActivePopup(type)}
          />
          
          <main className="relative z-10">
            <HeroSection />
            <ProductShowcase onProductClick={setSelectedProduct} />
            <CollectionSection onCollectionClick={setSelectedCollection} />
          </main>
          
          <CartOverlay 
            isOpen={isCartOpen} 
            onClose={() => setIsCartOpen(false)} 
          />
          
          {activePopup && (
            <InfoPopup 
              type={activePopup}
              onClose={() => setActivePopup(null)} 
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
        </div>
        </ReactLenis>
      </FashionCartProvider>
    </AuthProvider>
  );
}
