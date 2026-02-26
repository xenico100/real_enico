'use client';

import { useEffect, useState } from 'react';
import { X, Trash2, CreditCard, Minus, Plus, ShieldCheck, Truck } from 'lucide-react';
import { useFashionCart } from '@/app/context/FashionCartContext';
import { motion, AnimatePresence } from 'motion/react';

interface CartOverlayProps {
  isOpen: boolean;
  onClose: () => void;
}

type CheckoutMode = 'cart' | 'checkout';
type PaymentMethod = 'card' | 'bank' | 'cod';

export function CartOverlay({ isOpen, onClose }: CartOverlayProps) {
  const { cart, removeFromCart, updateQuantity } = useFashionCart();
  const [mode, setMode] = useState<CheckoutMode>('cart');
  const [transactionId, setTransactionId] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('card');
  const [checkoutEmail, setCheckoutEmail] = useState('');
  const [checkoutCountry, setCheckoutCountry] = useState('SECTOR_1 (USA)');
  const [checkoutName, setCheckoutName] = useState('');
  const [checkoutAddress, setCheckoutAddress] = useState('');

  useEffect(() => {
    if (!isOpen) return;

    setTransactionId(Math.random().toString(36).slice(2, 11).toUpperCase());
    setMode('cart');
  }, [isOpen]);

  const subtotal = cart.reduce((sum, item) => sum + item.price * (item.quantity || 1), 0);
  const shipping = subtotal > 500 ? 0 : 25;
  const tax = Math.round(subtotal * 0.08);
  const total = subtotal + shipping + tax;
  const canCheckout = cart.length > 0;
  const itemCount = cart.reduce((sum, item) => sum + (item.quantity || 1), 0);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/85 backdrop-blur-md z-[80]"
            onClick={onClose}
          />

          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'tween', ease: 'circOut', duration: 0.45 }}
            className="fixed top-0 right-0 h-full w-full md:w-[560px] bg-[#0a0a0a] border-l border-[#333] z-[90] flex flex-col font-mono text-[#e5e5e5]"
          >
            <div className="p-6 md:p-7 border-b border-[#333] bg-[url('https://grainy-gradients.vercel.app/noise.svg')]">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] text-[#00ffd1] uppercase tracking-[0.2em]">
                    Cart / Checkout Console
                  </p>
                  <h2 className="text-3xl md:text-4xl font-heading font-black uppercase tracking-tighter leading-none mt-2">
                    {mode === 'checkout' ? 'CHECKOUT' : 'CART'}
                  </h2>
                  <p className="text-[10px] text-[#666] uppercase tracking-widest mt-2">
                    /// TXN: {transactionId || 'GENERATING'}
                  </p>
                </div>
                <button
                  onClick={onClose}
                  className="p-2 border border-[#333] bg-black/60 hover:border-[#00ffd1] hover:text-[#00ffd1] transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setMode('cart')}
                  className={`border px-3 py-3 text-left transition-colors ${
                    mode === 'cart'
                      ? 'border-[#00ffd1] bg-[#00ffd1]/10 text-[#e5e5e5]'
                      : 'border-[#333] bg-[#111] text-[#888] hover:border-[#00ffd1]'
                  }`}
                >
                  <p className="text-[10px] uppercase tracking-widest text-[#666]">Stage 01</p>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-xs uppercase tracking-widest">Cart</span>
                    <span className="text-[10px] text-[#00ffd1]">{itemCount}</span>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => canCheckout && setMode('checkout')}
                  disabled={!canCheckout}
                  className={`border px-3 py-3 text-left transition-colors ${
                    mode === 'checkout'
                      ? 'border-[#00ffd1] bg-[#00ffd1]/10 text-[#e5e5e5]'
                      : 'border-[#333] bg-[#111] text-[#888] hover:border-[#00ffd1]'
                  } disabled:opacity-50 disabled:hover:border-[#333]`}
                >
                  <p className="text-[10px] uppercase tracking-widest text-[#666]">Stage 02</p>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-xs uppercase tracking-widest">Checkout</span>
                    <span className="text-[10px] text-[#00ffd1]">{canCheckout ? 'READY' : 'LOCKED'}</span>
                  </div>
                </button>
              </div>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto p-6 md:p-7 space-y-5">
              <div className="sticky top-0 z-10 border border-[#333] bg-[#0b0b0b]/95 backdrop-blur-md p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.18em] text-[#666]">Order Summary</p>
                    <p className="text-xs text-[#9a9a9a] mt-2">
                      {itemCount} items / {canCheckout ? 'checkout available' : 'cart empty'}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] uppercase text-[#666]">Total Due</p>
                    <p className="text-xl font-bold text-[#00ffd1]">${total}</p>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-3 gap-2 text-[10px]">
                  <div className="border border-[#222] bg-[#111] p-2">
                    <p className="text-[#666]">SUBTOTAL</p>
                    <p className="text-[#e5e5e5] mt-1">${subtotal}</p>
                  </div>
                  <div className="border border-[#222] bg-[#111] p-2">
                    <p className="text-[#666]">LOGISTICS</p>
                    <p className="text-[#e5e5e5] mt-1">{shipping === 0 ? 'FREE' : `$${shipping}`}</p>
                  </div>
                  <div className="border border-[#222] bg-[#111] p-2">
                    <p className="text-[#666]">TAX</p>
                    <p className="text-[#e5e5e5] mt-1">${tax}</p>
                  </div>
                </div>
              </div>

              {mode === 'cart' ? (
                <>
                  {!canCheckout ? (
                    <div className="border border-dashed border-[#333] bg-[#0a0a0a] p-8 text-center">
                      <p className="font-heading text-2xl uppercase mb-2">VOID</p>
                      <p className="text-xs text-[#888]">No assets selected. Add items from the clothes section.</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {cart.map((item) => (
                        <div key={`${item.id}-${item.selectedSize ?? 'na'}`} className="border border-[#333] bg-[#0f0f0f] p-4">
                          <div className="flex gap-4">
                            <div className="w-20 h-24 bg-[#111] border border-[#333] shrink-0 relative overflow-hidden">
                              <img src={item.image} alt="" className="w-full h-full object-cover grayscale contrast-125" />
                              <div className="absolute inset-0 bg-[#00ffd1] mix-blend-color opacity-0 hover:opacity-20 transition-opacity" />
                            </div>

                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <h3 className="font-bold text-sm uppercase truncate text-white">{item.name}</h3>
                                  <p className="text-[10px] text-[#888] mt-2 uppercase">
                                    {item.category || 'ITEM'} // {item.id}
                                    {item.selectedSize ? ` // SIZE ${item.selectedSize}` : ''}
                                  </p>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => removeFromCart(item.id)}
                                  className="p-2 border border-[#333] bg-[#111] text-[#666] hover:text-[#00ffd1] hover:border-[#00ffd1] transition-colors shrink-0"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>

                              <div className="mt-4 flex items-center justify-between gap-3">
                                <div className="flex items-center bg-[#111] border border-[#333]">
                                  <button
                                    onClick={() =>
                                      updateQuantity(item.id, Math.max(1, (item.quantity || 1) - 1))
                                    }
                                    className="w-9 h-9 flex items-center justify-center hover:bg-[#00ffd1] hover:text-black transition-colors"
                                  >
                                    <Minus size={14} />
                                  </button>
                                  <span className="w-10 text-center text-xs">{item.quantity || 1}</span>
                                  <button
                                    onClick={() => updateQuantity(item.id, (item.quantity || 1) + 1)}
                                    className="w-9 h-9 flex items-center justify-center hover:bg-[#00ffd1] hover:text-black transition-colors"
                                  >
                                    <Plus size={14} />
                                  </button>
                                </div>
                                <div className="text-right">
                                  <p className="text-[10px] text-[#666] uppercase">Unit</p>
                                  <p className="text-sm text-[#e5e5e5]">${item.price}</p>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div className="space-y-4">
                  <div className="border border-[#333] bg-[#111] p-4">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-[#00ffd1] mb-3">Contact</p>
                    <div className="space-y-3">
                      <div>
                        <label className="block text-[10px] text-[#666] mb-2 uppercase">
                          Email
                        </label>
                        <input
                          type="email"
                          value={checkoutEmail}
                          onChange={(e) => setCheckoutEmail(e.target.value)}
                          placeholder="ENTER_ID"
                          className="w-full bg-black border border-[#333] py-3 px-3 text-sm focus:outline-none focus:border-[#00ffd1] text-[#e5e5e5]"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-[#666] mb-2 uppercase">
                          Recipient Name
                        </label>
                        <input
                          type="text"
                          value={checkoutName}
                          onChange={(e) => setCheckoutName(e.target.value)}
                          placeholder="AUTHORIZED_NAME"
                          className="w-full bg-black border border-[#333] py-3 px-3 text-sm focus:outline-none focus:border-[#00ffd1] text-[#e5e5e5]"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="border border-[#333] bg-[#111] p-4">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-[#00ffd1] mb-3">Shipping</p>
                    <div className="space-y-3">
                      <div>
                        <label className="block text-[10px] text-[#666] mb-2 uppercase">Sector (Country)</label>
                        <select
                          value={checkoutCountry}
                          onChange={(e) => setCheckoutCountry(e.target.value)}
                          className="w-full bg-black border border-[#333] py-3 px-3 text-sm focus:outline-none focus:border-[#00ffd1] text-[#e5e5e5]"
                        >
                          <option>SECTOR_1 (USA)</option>
                          <option>SECTOR_2 (UK)</option>
                          <option>SECTOR_3 (ASIA)</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] text-[#666] mb-2 uppercase">
                          Address
                        </label>
                        <textarea
                          value={checkoutAddress}
                          onChange={(e) => setCheckoutAddress(e.target.value)}
                          rows={3}
                          placeholder="DROP_POINT / STREET / CITY"
                          className="w-full bg-black border border-[#333] py-3 px-3 text-sm focus:outline-none focus:border-[#00ffd1] text-[#e5e5e5] resize-none"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="border border-[#333] bg-[#111] p-4">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-[#00ffd1] mb-3">Payment Method</p>
                    <div className="grid grid-cols-3 gap-2 mb-4">
                      {([
                        { id: 'card', label: 'CARD' },
                        { id: 'bank', label: 'BANK' },
                        { id: 'cod', label: 'COD' },
                      ] as const).map((option) => (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() => setPaymentMethod(option.id)}
                          className={`border px-2 py-3 text-xs uppercase tracking-widest transition-colors ${
                            paymentMethod === option.id
                              ? 'border-[#00ffd1] bg-[#00ffd1]/10 text-[#e5e5e5]'
                              : 'border-[#333] bg-black text-[#888] hover:border-[#00ffd1] hover:text-[#00ffd1]'
                          }`}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>

                    {paymentMethod === 'card' && (
                      <div className="space-y-3">
                        <input
                          type="text"
                          placeholder="CARD_NUMBER"
                          className="w-full bg-black border border-[#333] py-3 px-3 text-sm focus:outline-none focus:border-[#00ffd1]"
                        />
                        <div className="grid grid-cols-2 gap-3">
                          <input
                            type="text"
                            placeholder="MM / YY"
                            className="w-full bg-black border border-[#333] py-3 px-3 text-sm focus:outline-none focus:border-[#00ffd1]"
                          />
                          <input
                            type="text"
                            placeholder="CVC"
                            className="w-full bg-black border border-[#333] py-3 px-3 text-sm focus:outline-none focus:border-[#00ffd1]"
                          />
                        </div>
                      </div>
                    )}

                    {paymentMethod === 'bank' && (
                      <div className="border border-dashed border-[#333] bg-[#0a0a0a] p-3 text-xs text-[#888]">
                        Bank transfer instructions will be shown after authorization.
                      </div>
                    )}

                    {paymentMethod === 'cod' && (
                      <div className="border border-dashed border-[#333] bg-[#0a0a0a] p-3 text-xs text-[#888]">
                        Cash on delivery selected. Additional verification may be required.
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                    <div className="border border-[#333] bg-[#0d0d0d] p-3 flex items-start gap-2">
                      <ShieldCheck size={14} className="text-[#00ffd1] mt-0.5 shrink-0" />
                      <p className="text-[#999] leading-relaxed">
                        Secure checkout placeholder UI. Connect actual payment gateway next.
                      </p>
                    </div>
                    <div className="border border-[#333] bg-[#0d0d0d] p-3 flex items-start gap-2">
                      <Truck size={14} className="text-[#00ffd1] mt-0.5 shrink-0" />
                      <p className="text-[#999] leading-relaxed">
                        Logistics estimate updates after real shipping integration.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {canCheckout && (
              <div className="border-t border-[#333] bg-[#050505] p-6 md:p-7">
                <div className="flex items-center justify-between gap-3 mb-4">
                  <div className="text-xs text-[#888]">
                    <p className="uppercase tracking-widest text-[#666]">Final Total</p>
                    <p className="text-lg text-[#e5e5e5] mt-1">${total}</p>
                  </div>
                  <div className="inline-flex items-center gap-2 border border-[#333] bg-[#111] px-3 py-2 text-[10px] uppercase tracking-widest">
                    <CreditCard size={12} className="text-[#00ffd1]" />
                    <span className="text-[#aaa]">Checkout Ready</span>
                  </div>
                </div>

                {mode === 'cart' ? (
                  <button
                    onClick={() => setMode('checkout')}
                    className="w-full py-4 bg-[#e5e5e5] text-black font-heading uppercase text-xl hover:bg-[#00ffd1] transition-colors tracking-widest"
                  >
                    GO CHECKOUT
                  </button>
                ) : (
                  <div className="flex gap-3">
                    <button
                      onClick={() => setMode('cart')}
                      className="flex-1 py-4 border border-[#333] text-[#888] hover:text-[#e5e5e5] hover:border-[#e5e5e5] uppercase text-xs tracking-widest transition-colors"
                    >
                      BACK TO CART
                    </button>
                    <button className="flex-[2] py-4 bg-[#00ffd1] text-black font-heading uppercase text-xl hover:bg-white transition-colors tracking-widest">
                      AUTHORIZE PAYMENT
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
