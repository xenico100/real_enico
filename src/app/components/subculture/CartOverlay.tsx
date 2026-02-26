'use client';

import { useState } from 'react';
import { X, Minus, Plus, Trash2 } from 'lucide-react';
import { useFashionCart } from '@/app/context/FashionCartContext';
import { motion, AnimatePresence } from 'motion/react';

interface CartOverlayProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CartOverlay({ isOpen, onClose }: CartOverlayProps) {
  const { cart, removeFromCart, updateQuantity } = useFashionCart();
  const [showCheckout, setShowCheckout] = useState(false);

  const subtotal = cart.reduce((sum, item) => sum + item.price * (item.quantity || 1), 0);
  const shipping = subtotal > 500 ? 0 : 25;
  const total = subtotal + shipping;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[80]"
            onClick={onClose}
          />

          {/* Panel */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: "tween", ease: "circOut", duration: 0.5 }}
            className="fixed top-0 right-0 h-full w-full md:w-[500px] bg-[#0a0a0a] border-l border-[#333] z-[90] flex flex-col font-mono text-[#e5e5e5]"
          >
            {/* Header */}
            <div className="p-8 border-b border-[#333] flex justify-between items-start bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-90">
              <div>
                <h2 className="text-4xl font-heading font-black uppercase text-[#e5e5e5] tracking-tighter leading-none mb-1">
                  {showCheckout ? 'FINAL_STEP' : 'YOUR_HAUL'}
                </h2>
                <p className="text-[10px] text-[#00ffd1] uppercase tracking-widest">
                  /// TRANSACTION_ID: {Math.random().toString(36).substr(2, 9).toUpperCase()}
                </p>
              </div>
              <button onClick={onClose} className="hover:text-[#00ffd1] transition-colors">
                <X size={24} />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-8 relative">
              {/* Receipt Background Line */}
              <div className="absolute top-0 bottom-0 left-8 w-[1px] bg-dashed border-l border-[#333] border-dashed opacity-50 pointer-events-none" />

              {!showCheckout ? (
                <>
                  {cart.length === 0 ? (
                     <div className="h-full flex flex-col items-center justify-center text-center opacity-50">
                       <p className="font-heading text-2xl uppercase mb-2">VOID</p>
                       <p className="text-xs">No assets selected.</p>
                     </div>
                  ) : (
                    <div className="space-y-8 pl-8">
                      {cart.map((item) => (
                        <div key={item.id} className="relative group">
                          <button
                            onClick={() => removeFromCart(item.id)}
                            className="absolute -left-12 top-0 p-2 text-[#666] hover:text-[#00ffd1] transition-colors"
                          >
                            <Trash2 size={16} />
                          </button>

                          <div className="flex gap-4">
                            <div className="w-20 h-24 bg-[#111] border border-[#333] flex-shrink-0 relative overflow-hidden">
                              <img src={item.image} alt="" className="w-full h-full object-cover grayscale contrast-125" />
                              <div className="absolute inset-0 bg-[#00ffd1] mix-blend-color opacity-0 group-hover:opacity-20 transition-opacity" />
                            </div>
                            
                            <div className="flex-1 min-w-0">
                              <div className="flex justify-between items-start mb-2">
                                <h3 className="font-bold text-sm uppercase truncate pr-4 text-white">{item.name}</h3>
                                <p className="font-mono text-sm">${item.price}</p>
                              </div>
                              <p className="text-[10px] text-[#888] mb-4 uppercase">{item.category} // {item.id}</p>
                              
                              <div className="flex items-center gap-4 bg-[#111] inline-flex border border-[#333]">
                                <button onClick={() => updateQuantity(item.id, Math.max(1, (item.quantity || 1) - 1))} className="w-8 h-8 flex items-center justify-center hover:bg-[#00ffd1] hover:text-black">-</button>
                                <span className="w-8 text-center text-xs">{item.quantity || 1}</span>
                                <button onClick={() => updateQuantity(item.id, (item.quantity || 1) + 1)} className="w-8 h-8 flex items-center justify-center hover:bg-[#00ffd1] hover:text-black">+</button>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div className="space-y-6 pl-8">
                  <div className="bg-[#111] border border-[#333] p-4">
                    <label className="block text-[10px] text-[#666] mb-2 uppercase">Identity Protocol (Email)</label>
                    <input type="email" placeholder="ENTER_ID" className="w-full bg-black border-b border-[#333] py-2 text-sm focus:outline-none focus:border-[#00ffd1] text-[#e5e5e5]" />
                  </div>
                  
                  <div className="bg-[#111] border border-[#333] p-4">
                    <label className="block text-[10px] text-[#666] mb-2 uppercase">Sector (Country)</label>
                    <select className="w-full bg-black border-b border-[#333] py-2 text-sm focus:outline-none focus:border-[#00ffd1] text-[#e5e5e5]">
                      <option>SECTOR_1 (USA)</option>
                      <option>SECTOR_2 (UK)</option>
                      <option>SECTOR_3 (ASIA)</option>
                    </select>
                  </div>

                  <div className="mt-8 border-t border-dashed border-[#333] pt-4">
                    <p className="text-xs text-[#666] mb-4">CONFIRMATION_REQUIRED</p>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            {cart.length > 0 && (
              <div className="p-8 border-t border-[#333] bg-[#050505]">
                <div className="space-y-2 text-sm font-mono mb-6 text-[#888]">
                  <div className="flex justify-between"><span>SUBTOTAL</span><span>${subtotal}</span></div>
                  <div className="flex justify-between"><span>LOGISTICS</span><span>{shipping === 0 ? 'GRANTED' : `$${shipping}`}</span></div>
                  <div className="border-b border-[#333] my-2" />
                  <div className="flex justify-between text-[#e5e5e5] text-lg font-bold"><span>TOTAL_DUE</span><span>${total}</span></div>
                </div>

                {!showCheckout ? (
                  <button 
                    onClick={() => setShowCheckout(true)}
                    className="w-full py-4 bg-[#e5e5e5] text-black font-heading uppercase text-xl hover:bg-[#00ffd1] transition-colors tracking-widest"
                  >
                    PROCEED
                  </button>
                ) : (
                  <div className="flex gap-4">
                    <button 
                      onClick={() => setShowCheckout(false)}
                      className="flex-1 py-4 border border-[#333] text-[#666] hover:text-[#e5e5e5] hover:border-[#e5e5e5] uppercase text-xs tracking-widest"
                    >
                      ABORT
                    </button>
                    <button className="flex-[2] py-4 bg-[#00ffd1] text-black font-heading uppercase text-xl hover:bg-white transition-colors tracking-widest">
                      AUTHORIZE
                    </button>
                  </div>
                )}
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
