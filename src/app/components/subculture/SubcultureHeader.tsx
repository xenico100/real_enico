'use client';

import { ShoppingBag, Menu, X } from 'lucide-react';
import { useFashionCart } from '@/app/context/FashionCartContext';
import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from '@/app/context/AuthContext';

interface SubcultureHeaderProps {
  onCartClick: () => void;
  onInfoClick: (type: 'about' | 'contact' | 'mypage') => void;
  onRandomChatClick: () => void;
}

type InfoNavKey = 'about' | 'contact' | 'mypage';

type NavItem =
  | { key: InfoNavKey; label: string; action: 'info' }
  | { key: 'randomChat'; label: string; action: 'randomChat' };

export function SubcultureHeader({ onCartClick, onInfoClick, onRandomChatClick }: SubcultureHeaderProps) {
  const { cart } = useFashionCart();
  const { isAuthenticated, isAuthReady } = useAuth();
  const cartCount = cart.length;
  const [menuOpen, setMenuOpen] = useState(false);
  const myPageLabel = isAuthenticated
    ? '마이페이지'
    : isAuthReady
      ? '로그인 / 주문조회'
      : '마이페이지';
  const navItems: NavItem[] = [
    { key: 'about', label: '소개', action: 'info' },
    { key: 'contact', label: '연락', action: 'info' },
    { key: 'randomChat', label: '단체랜덤채팅', action: 'randomChat' },
    { key: 'mypage', label: myPageLabel, action: 'info' },
  ];

  return (
    <>
      <header className="fixed top-0 left-0 right-0 z-50 pointer-events-none">
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
          <nav className="pointer-events-auto relative z-[51] hidden md:flex flex-col items-end gap-2 font-mono text-sm">
            {navItems.map((item, i) => (
              (() => {
                const isFunctional = item.key === 'mypage' || item.key === 'randomChat';
                return (
              <button 
                key={item.key}
                onClick={() => {
                  if (item.action === 'randomChat') {
                    onRandomChatClick();
                    return;
                  }
                  onInfoClick(item.key);
                }}
                className={`group relative w-full overflow-hidden text-right px-2 py-1.5 uppercase tracking-widest border transition-[color,background-color,border-color,box-shadow,transform] duration-200 hover:-translate-x-0.5 hover:shadow-[0_0_26px_rgba(0,255,209,0.24)] ${
                  isFunctional
                    ? 'border-[#00ffd1]/40 bg-[#00ffd1]/5 hover:border-[#9affef] hover:bg-[#00ffd1] hover:text-black'
                    : 'border-transparent hover:border-[#00ffd1]/35 hover:bg-[#00ffd1] hover:text-black'
                }`}
              >
                <span className="pointer-events-none absolute inset-y-1 left-3 right-3 rounded-full bg-[#00ffd1]/0 blur-xl transition-all duration-200 group-hover:bg-[#00ffd1]/22" />
                <span className="relative z-[1] transition-[text-shadow] duration-200 group-hover:[text-shadow:0_0_14px_rgba(255,255,255,0.5)]">
                  {`0${i+1} /// ${item.label}`}
                </span>
              </button>
                );
              })()
            ))}
            
            <button
              onClick={onCartClick}
              className="mt-4 group relative w-full min-w-[220px] overflow-visible border border-[#333] bg-black/60 px-3 py-3 text-left transition-[border-color,box-shadow,transform] duration-200 hover:-translate-x-0.5 hover:border-[#00ffd1] hover:shadow-[0_0_30px_rgba(0,255,209,0.24)]"
            >
              <span className="pointer-events-none absolute inset-y-2 left-4 right-4 rounded-full bg-[#00ffd1]/0 blur-xl transition-all duration-200 group-hover:bg-[#00ffd1]/18" />
              <div className="flex items-center justify-between gap-3">
                <div className="relative z-[1]">
                  <p className="font-mono text-[10px] tracking-[0.18em] text-[#666] group-hover:text-[#00ffd1]/70 transition-colors">
                    장바구니
                  </p>
                  <p className="font-mono text-xs mt-1 text-white group-hover:text-[#00ffd1] transition-colors group-hover:[text-shadow:0_0_12px_rgba(0,255,209,0.38)]">
                    결제 창 열기
                  </p>
                </div>
                <div className="relative z-[1] shrink-0 border border-[#333] bg-[#111] p-2 group-hover:border-[#00ffd1] transition-colors">
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
                    if (item.action === 'randomChat') {
                      onRandomChatClick();
                    } else {
                      onInfoClick(item.key);
                    }
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
