'use client';

import { ShoppingBag, Menu, X } from 'lucide-react';
import { useFashionCart } from '@/app/context/FashionCartContext';
import { useEffect, useState } from 'react';
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
  const { cart, lastAddedItem } = useFashionCart();
  const { isAuthenticated, isAuthReady } = useAuth();
  const cartCount = cart.length;
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeCartFeedbackSequence, setActiveCartFeedbackSequence] = useState<number | null>(null);
  const myPageLabel = isAuthenticated
    ? '마이페이지'
    : isAuthReady
      ? '로그인 / 주문조회'
      : '마이페이지';
  const navItems: NavItem[] = [
    { key: 'about', label: '소개', action: 'info' },
    { key: 'contact', label: '의뢰', action: 'info' },
    { key: 'randomChat', label: '커뮤니티', action: 'randomChat' },
    { key: 'mypage', label: myPageLabel, action: 'info' },
  ];
  const isCartCelebrating = activeCartFeedbackSequence === lastAddedItem?.sequence;

  useEffect(() => {
    if (!lastAddedItem) return;

    setActiveCartFeedbackSequence(lastAddedItem.sequence);

    const timeoutId = window.setTimeout(() => {
      setActiveCartFeedbackSequence((current) =>
        current === lastAddedItem.sequence ? null : current,
      );
    }, 1150);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [lastAddedItem]);

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
            <h1 className="text-4xl md:text-6xl font-[900] tracking-tighter uppercase font-heading leading-[0.8] text-[#111827]">
              ENICO VECK
              <span className="text-[#b8001f] text-base md:text-xl align-top ml-1">®</span>
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
                className={`group relative w-full overflow-hidden text-right px-2 py-1.5 uppercase tracking-widest border transition-[color,background-color,border-color,box-shadow,transform] duration-200 hover:-translate-x-0.5 hover:shadow-[0_0_26px_rgba(184,0,31,0.24)] ${
                  isFunctional
                    ? 'border-[#b8001f]/40 bg-[#b8001f]/5 hover:border-[#d93853] hover:bg-[#b8001f] hover:text-white text-[#111827]'
                    : 'border-transparent hover:border-[#b8001f]/35 hover:bg-[#b8001f] hover:text-white text-[#111827]'
                }`}
              >
                <span className="pointer-events-none absolute inset-y-1 left-3 right-3 rounded-full bg-[#b8001f]/0 blur-xl transition-all duration-200 group-hover:bg-[#b8001f]/22" />
                <span className="relative z-[1] transition-[text-shadow] duration-200 group-hover:[text-shadow:0_0_14px_rgba(255,255,255,0.5)]">
                  {`0${i+1} /// ${item.label}`}
                </span>
              </button>
                );
              })()
            ))}
            
            <button
              onClick={onCartClick}
              className={`mt-4 group relative w-full min-w-[220px] overflow-visible border bg-white/80 shadow-sm px-3 py-3 text-left transition-[border-color,box-shadow,transform] duration-200 hover:-translate-x-0.5 hover:border-[#b8001f] hover:shadow-[0_0_30px_rgba(184,0,31,0.24)] ${
                isCartCelebrating
                  ? 'border-[#d93853] shadow-[0_0_34px_rgba(184,0,31,0.28)]'
                  : 'border-[#d1d5db]'
              }`}
            >
              <span className="pointer-events-none absolute inset-y-2 left-4 right-4 rounded-full bg-[#b8001f]/0 blur-xl transition-all duration-200 group-hover:bg-[#b8001f]/18" />
              <div className="flex items-center justify-between gap-3">
                <div className="relative z-[1]">
                  <p className="font-mono text-[10px] tracking-[0.18em] text-[#4b5563] group-hover:text-[#b8001f]/70 transition-colors">
                    장바구니
                  </p>
                  <p className="font-mono text-xs mt-1 text-[#111827] group-hover:text-[#b8001f] transition-colors group-hover:[text-shadow:0_0_12px_rgba(184,0,31,0.38)]">
                    결제 창 열기
                  </p>
                </div>
                <motion.div
                  animate={
                    isCartCelebrating
                      ? { scale: [1, 0.92, 1.18, 1], rotate: [0, -5, 4, 0] }
                      : { scale: 1, rotate: 0 }
                  }
                  transition={{ duration: 0.72, ease: 'easeOut' }}
                  className="relative z-[1] shrink-0 border border-[#d1d5db] bg-[#f3f4f6] text-[#111827] p-2 transition-colors group-hover:border-[#b8001f] group-hover:text-[#b8001f]"
                >
                  <ShoppingBag size={18} strokeWidth={1.5} />
                  <motion.span
                    animate={isCartCelebrating ? { scale: [1, 1.22, 1] } : { scale: 1 }}
                    transition={{ duration: 0.5, ease: 'easeOut' }}
                    className="absolute -right-2 -top-2 flex h-4 min-w-4 items-center justify-center bg-[#b8001f] px-1 text-[10px] font-bold text-white"
                  >
                    {cartCount}
                  </motion.span>
                  <AnimatePresence>
                    {isCartCelebrating ? (
                      <motion.span
                        key={`desktop-cart-feedback-${lastAddedItem?.sequence}`}
                        initial={{ opacity: 0, y: 8, scale: 0.7 }}
                        animate={{ opacity: 1, y: -18, scale: 1 }}
                        exit={{ opacity: 0, y: -28, scale: 0.9 }}
                        transition={{ duration: 0.58, ease: 'easeOut' }}
                        className="pointer-events-none absolute -right-5 -top-3 rounded-full border border-[#d93853] bg-[#ffe6eb] px-2 py-1 font-mono text-[9px] font-black tracking-[0.2em] text-[#6e0013] shadow-[0_10px_24px_rgba(184,0,31,0.3)]"
                      >
                        +1
                      </motion.span>
                    ) : null}
                  </AnimatePresence>
                </motion.div>
              </div>
            </button>
          </nav>

          {/* Mobile Menu Toggle */}
          <motion.button
            type="button"
            aria-label={menuOpen ? '메뉴 닫기' : '메뉴 열기'}
            animate={
              isCartCelebrating
                ? { scale: [1, 0.94, 1.08, 1], rotate: [0, -4, 0] }
                : { scale: 1, rotate: 0 }
            }
            transition={{ duration: 0.7, ease: 'easeOut' }}
            className={`md:hidden pointer-events-auto relative z-50 flex h-12 w-12 items-center justify-center border bg-white/90 text-black transition-[border-color,box-shadow,color] ${
              isCartCelebrating
                ? 'border-[#d93853] text-[#b8001f] shadow-[0_0_28px_rgba(184,0,31,0.28)]'
                : 'border-[#d1d5db]'
            }`}
            onClick={() => setMenuOpen(!menuOpen)}
          >
            {cartCount > 0 ? (
              <motion.span
                animate={isCartCelebrating ? { scale: [1, 1.2, 1] } : { scale: 1 }}
                transition={{ duration: 0.48, ease: 'easeOut' }}
                className="absolute -right-2 -top-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#b8001f] px-1.5 font-mono text-[10px] font-black text-white"
              >
                {cartCount}
              </motion.span>
            ) : null}
            <AnimatePresence>
              {isCartCelebrating ? (
                <motion.span
                  key={`mobile-cart-feedback-${lastAddedItem?.sequence}`}
                  initial={{ opacity: 0, y: 6, scale: 0.76 }}
                  animate={{ opacity: 1, y: -16, scale: 1 }}
                  exit={{ opacity: 0, y: -26, scale: 0.9 }}
                  transition={{ duration: 0.56, ease: 'easeOut' }}
                  className="pointer-events-none absolute -right-4 -top-4 rounded-full border border-[#d93853] bg-[#ffe6eb] px-2 py-1 font-mono text-[9px] font-black tracking-[0.18em] text-[#6e0013] shadow-[0_10px_24px_rgba(184,0,31,0.3)]"
                >
                  +1
                </motion.span>
              ) : null}
            </AnimatePresence>
            {menuOpen ? <X size={32} /> : <Menu size={32} />}
          </motion.button>
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
            className="fixed inset-0 bg-[#b8001f] z-40 flex flex-col justify-center items-center p-10 md:hidden"
          >
            <nav className="flex flex-col gap-8 text-white font-heading text-6xl font-black uppercase tracking-tighter">
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
                  className="hover:line-through decoration-4 decoration-black text-white"
                >
                  {item.label}
                </button>
              ))}
              <button 
                onClick={() => {
                  onCartClick();
                  setMenuOpen(false);
                }}
                className={`relative flex items-center gap-4 hover:line-through decoration-4 decoration-black text-white ${
                  isCartCelebrating ? 'text-black [text-shadow:0_0_18px_rgba(0,0,0,0.45)]' : ''
                }`}
              >
                장바구니 ({cartCount})
                <AnimatePresence>
                  {isCartCelebrating ? (
                    <motion.span
                      key={`menu-cart-feedback-${lastAddedItem?.sequence}`}
                      initial={{ opacity: 0, x: -10, y: 4, scale: 0.84 }}
                      animate={{ opacity: 1, x: 0, y: -10, scale: 1 }}
                      exit={{ opacity: 0, x: 6, y: -18, scale: 0.9 }}
                      transition={{ duration: 0.5, ease: 'easeOut' }}
                      className="rounded-full border border-white/30 bg-black px-3 py-1 text-base font-mono font-black tracking-[0.18em] text-white shadow-[0_12px_24px_rgba(0,0,0,0.12)]"
                    >
                      +1
                    </motion.span>
                  ) : null}
                </AnimatePresence>
              </button>
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
