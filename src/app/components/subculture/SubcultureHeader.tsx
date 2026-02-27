'use client';

import { ShoppingBag, Menu, X } from 'lucide-react';
import { useFashionCart } from '@/app/context/FashionCartContext';
import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from '@/app/context/AuthContext';

interface SubcultureHeaderProps {
  onCartClick: () => void;
  onInfoClick: (type: 'about' | 'contact' | 'mypage') => void;
}

export function SubcultureHeader({ onCartClick, onInfoClick }: SubcultureHeaderProps) {
  const { cart } = useFashionCart();
  const { isAuthenticated, isAuthReady } = useAuth();
  const cartCount = cart.length;
  const [menuOpen, setMenuOpen] = useState(false);
  const myPageLabel = isAuthenticated
    ? '마이페이지'
    : isAuthReady
      ? '로그인 / 회원가입'
      : '마이페이지';
  const navItems = [
    { key: 'about' as const, label: '소개' },
    { key: 'contact' as const, label: '연락' },
    { key: 'mypage' as const, label: myPageLabel },
  ];

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
          </motion.div>

          {/* Desktop Nav */}
          <nav className="hidden md:flex flex-col items-end gap-2 font-mono text-sm mr-4 lg:mr-8">
            {navItems.map((item, i) => (
              (() => {
                const isFunctional = item.key === 'mypage';
                return (
              <button 
                key={item.key}
                onClick={() => onInfoClick(item.key)}
                className={`w-full text-right px-2 py-1.5 transition-colors duration-0 uppercase tracking-widest border ${
                  isFunctional
                    ? 'border-[#00ffd1]/40 bg-[#00ffd1]/5 hover:bg-[#00ffd1] hover:text-black'
                    : 'border-transparent hover:bg-[#00ffd1] hover:text-black'
                }`}
              >
                {`0${i+1} /// ${item.label}`}
              </button>
                );
              })()
            ))}
            
            <button
              onClick={onCartClick}
              className="mt-4 group w-full min-w-[220px] border border-[#333] bg-black/60 px-3 py-3 text-left hover:border-[#00ffd1] transition-colors"
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-mono text-[10px] tracking-[0.18em] text-[#666] group-hover:text-[#00ffd1]/70 transition-colors">
                    장바구니
                  </p>
                  <p className="font-mono text-xs mt-1 text-white group-hover:text-[#00ffd1] transition-colors">
                    결제 창 열기
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
                  key={item.key}
                  onClick={() => {
                    onInfoClick(item.key);
                    setMenuOpen(false);
                  }}
                  className="hover:line-through decoration-4 decoration-white"
                >
                  {item.label}
                </button>
              ))}
              <button 
                onClick={() => {
                  onCartClick();
                  setMenuOpen(false);
                }}
                className="flex items-center gap-4 hover:line-through decoration-4 decoration-white"
              >
                장바구니 ({cartCount})
              </button>
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
