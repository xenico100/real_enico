'use client';

import { ShoppingBag, Menu, X } from 'lucide-react';
import { useFashionCart } from '@/app/context/FashionCartContext';
import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';

interface SubcultureHeaderProps {
  onCartClick: () => void;
  onInfoClick: (type: 'about' | 'contact' | 'account' | 'mypage') => void;
}

export function SubcultureHeader({ onCartClick, onInfoClick }: SubcultureHeaderProps) {
  const { cart } = useFashionCart();
  const cartCount = cart.length;
  const [menuOpen, setMenuOpen] = useState(false);
  const navItems = ['ABOUT', 'CONTACT', 'ACCOUNT', 'MYPAGE'] as const;

  const glitchText = (text: string) => (
    <span className="relative inline-block group cursor-pointer overflow-hidden">
      <span className="relative z-10 group-hover:text-[#00ffd1] transition-colors duration-0">{text}</span>
      <span className="absolute top-0 left-0 -ml-0.5 translate-x-[100%] group-hover:translate-x-0 transition-transform duration-75 text-[#00ffd1] opacity-50 mix-blend-screen">{text}</span>
      <span className="absolute top-0 left-0 ml-0.5 translate-x-[-100%] group-hover:translate-x-0 transition-transform duration-100 text-[#00ffff] opacity-50 mix-blend-screen">{text}</span>
      <span className="absolute inset-x-0 bottom-0 h-[2px] bg-[#00ffd1] translate-x-[-100%] group-hover:translate-x-0 transition-transform duration-300 ease-out"></span>
    </span>
  );

  return (
    <>
      <header className="fixed top-0 left-0 right-0 z-50 mix-blend-difference pointer-events-none">
        <div className="w-full h-full p-6 md:p-10 flex justify-between items-start pointer-events-auto">
          
          {/* Logo */}
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="relative z-50"
          >
            <h1 className="text-4xl md:text-6xl font-[900] tracking-tighter uppercase font-heading leading-[0.8]">
              ENICO VECK
              <span className="text-[#00ffd1] text-base md:text-xl align-top ml-1">®</span>
            </h1>
            <p className="font-mono text-[10px] md:text-xs tracking-widest mt-1 opacity-60">
              PROJECT_MAYHEM_V2.0
            </p>
          </motion.div>

          {/* Desktop Nav */}
          <nav className="hidden md:flex flex-col items-end gap-2 font-mono text-sm">
            {navItems.map((item, i) => (
              <button 
                key={item}
                onClick={() => onInfoClick(item.toLowerCase() as any)}
                className="hover:bg-[#00ffd1] hover:text-black px-2 py-1 transition-colors duration-0 uppercase tracking-widest text-right"
              >
                {`0${i+1} /// ${item}`}
              </button>
            ))}
            
            <button
              onClick={onCartClick}
              className="mt-4 group w-full min-w-[220px] border border-[#333] bg-black/60 px-3 py-3 text-left hover:border-[#00ffd1] transition-colors"
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-mono text-[10px] tracking-[0.18em] text-[#666] group-hover:text-[#00ffd1]/70 transition-colors">
                    05 /// CART_PANEL
                  </p>
                  <p className="font-mono text-xs mt-1 text-white group-hover:text-[#00ffd1] transition-colors">
                    OPEN CHECKOUT WINDOW
                  </p>
                </div>
                <div className="relative shrink-0 border border-[#333] bg-[#111] p-2 group-hover:border-[#00ffd1] transition-colors">
                  <ShoppingBag size={18} strokeWidth={1.5} />
                  <span className="absolute -top-2 -right-2 bg-[#00ffd1] text-black text-[10px] font-bold min-w-4 h-4 px-1 flex items-center justify-center">
                    {cartCount}
                  </span>
                </div>
              </div>
            </button>
          </nav>

          {/* Mobile Menu Toggle */}
          <button 
            className="md:hidden pointer-events-auto text-white z-50"
            onClick={() => setMenuOpen(!menuOpen)}
          >
            {menuOpen ? <X size={32} /> : <Menu size={32} />}
          </button>
        </div>
      </header>

      {/* Mobile Menu Overlay */}
      <AnimatePresence>
        {menuOpen && (
          <motion.div 
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: "tween", duration: 0.3, ease: "circOut" }}
            className="fixed inset-0 bg-[#00ffd1] z-40 flex flex-col justify-center items-center p-10 md:hidden"
          >
            <nav className="flex flex-col gap-8 text-black font-heading text-6xl font-black uppercase tracking-tighter">
              {navItems.map((item) => (
                <button 
                  key={item}
                  onClick={() => {
                    onInfoClick(item.toLowerCase() as any);
                    setMenuOpen(false);
                  }}
                  className="hover:line-through decoration-4 decoration-white"
                >
                  {item}
                </button>
              ))}
              <button 
                onClick={() => {
                  onCartClick();
                  setMenuOpen(false);
                }}
                className="flex items-center gap-4 hover:line-through decoration-4 decoration-white"
              >
                CART ({cartCount})
              </button>
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
