'use client';

import { useEffect, useRef, useState } from 'react';
import { X, Trash2, CreditCard, Minus, Plus, ShieldCheck, Truck } from 'lucide-react';
import { useFashionCart } from '@/app/context/FashionCartContext';
import { useAuth } from '@/app/context/AuthContext';
import { motion, AnimatePresence } from 'motion/react';

interface CartOverlayProps {
  isOpen: boolean;
  onClose: () => void;
}

type CheckoutMode = 'cart' | 'checkout';
type OrderChannel = 'member' | 'guest';

const BANK_NAME = '카카오뱅크';
const BANK_ACCOUNT_NUMBER = '3333-09-2834967';
const PAYPAL_SDK_SCRIPT_ID = 'paypal-sdk-script';
const PAYPAL_CLIENT_ID = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID || '';
const PAYPAL_CURRENCY = (process.env.NEXT_PUBLIC_PAYPAL_CURRENCY || 'USD').toUpperCase();

type PayPalClickActions = {
  resolve: () => Promise<void>;
  reject: () => Promise<void>;
};

type PayPalOrderActions = {
  order: {
    create: (payload: {
      purchase_units: Array<{
        amount: {
          currency_code: string;
          value: string;
        };
        description: string;
      }>;
    }) => Promise<string>;
    capture: () => Promise<unknown>;
  };
};

type PayPalButtonsInstance = {
  render: (container: HTMLElement) => Promise<void>;
  close?: () => Promise<void> | void;
};

type PayPalNamespace = {
  Buttons: (options: {
    onClick?: (_data: unknown, actions: PayPalClickActions) => Promise<void>;
    createOrder: (_data: unknown, actions: PayPalOrderActions) => Promise<string>;
    onApprove: (data: { orderID: string }, actions: PayPalOrderActions) => Promise<void>;
    onError?: (_error: unknown) => void;
    style?: {
      layout?: 'vertical' | 'horizontal';
      shape?: 'rect' | 'pill';
      color?: 'gold' | 'blue' | 'silver' | 'white' | 'black';
      label?: 'paypal' | 'checkout' | 'buynow' | 'pay' | 'installment';
    };
  }) => PayPalButtonsInstance;
};

declare global {
  interface Window {
    paypal?: PayPalNamespace;
  }
}

function parsePayPalCapture(payload: unknown) {
  if (!payload || typeof payload !== 'object') {
    return {
      status: null as string | null,
      payerEmail: null as string | null,
      captureId: null as string | null,
      capturedAmount: {
        currency: null as string | null,
        value: null as string | null,
      },
    };
  }

  const target = payload as {
    status?: unknown;
    payer?: { email_address?: unknown };
    purchase_units?: Array<{
      amount?: { currency_code?: unknown; value?: unknown };
      payments?: {
        captures?: Array<{ id?: unknown }>;
      };
    }>;
  };

  const capture =
    Array.isArray(target.purchase_units) &&
    target.purchase_units[0] &&
    target.purchase_units[0].payments &&
    Array.isArray(target.purchase_units[0].payments?.captures)
      ? target.purchase_units[0].payments?.captures?.[0]
      : undefined;
  const amount =
    Array.isArray(target.purchase_units) && target.purchase_units[0]
      ? target.purchase_units[0].amount
      : undefined;

  return {
    status: typeof target.status === 'string' ? target.status : null,
    payerEmail: typeof target.payer?.email_address === 'string' ? target.payer.email_address : null,
    captureId: typeof capture?.id === 'string' ? capture.id : null,
    capturedAmount: {
      currency: typeof amount?.currency_code === 'string' ? amount.currency_code : null,
      value: typeof amount?.value === 'string' ? amount.value : null,
    },
  };
}

function formatKrw(value: number) {
  return `${Math.round(value).toLocaleString('ko-KR')}원`;
}

export function CartOverlay({ isOpen, onClose }: CartOverlayProps) {
  const { cart, removeFromCart, updateQuantity, clearCart } = useFashionCart();
  const { isAuthenticated, user } = useAuth();
  const paypalContainerRef = useRef<HTMLDivElement | null>(null);
  const paypalButtonsInstanceRef = useRef<PayPalButtonsInstance | null>(null);
  const [mode, setMode] = useState<CheckoutMode>('cart');
  const [transactionId, setTransactionId] = useState('');
  const [checkoutEmail, setCheckoutEmail] = useState('');
  const [checkoutCountry, setCheckoutCountry] = useState('구역_1 (미국)');
  const [checkoutName, setCheckoutName] = useState('');
  const [checkoutAddress, setCheckoutAddress] = useState('');
  const [checkoutPhone, setCheckoutPhone] = useState('');
  const [guestLookupPassword, setGuestLookupPassword] = useState('');
  const [isSubmittingOrder, setIsSubmittingOrder] = useState(false);
  const [paypalSdkReady, setPaypalSdkReady] = useState(false);
  const [paypalError, setPaypalError] = useState<string | null>(null);
  const [checkoutMessage, setCheckoutMessage] = useState<string | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    setTransactionId(Array.from({ length: 9 }, () => Math.floor(Math.random() * 10)).join(''));
    setMode('cart');
    setCheckoutMessage(null);
    setCheckoutError(null);
    setGuestLookupPassword('');
  }, [isOpen]);

  useEffect(() => {
    if (!isAuthenticated || !user?.email) return;
    setCheckoutEmail((previous) => previous || user.email || '');
  }, [isAuthenticated, user?.email]);

  useEffect(() => {
    if (!isOpen || mode !== 'checkout') return;
    if (!PAYPAL_CLIENT_ID) {
      setPaypalError('PayPal Client ID가 설정되지 않았습니다.');
      return;
    }
    if (typeof window === 'undefined') return;

    if (window.paypal) {
      setPaypalSdkReady(true);
      return;
    }

    const existingScript = document.getElementById(PAYPAL_SDK_SCRIPT_ID) as HTMLScriptElement | null;
    const handleLoad = () => {
      setPaypalSdkReady(true);
      setPaypalError(null);
    };
    const handleError = () => {
      setPaypalError('PayPal SDK 로드에 실패했습니다.');
    };

    if (existingScript) {
      existingScript.addEventListener('load', handleLoad);
      existingScript.addEventListener('error', handleError);
      return () => {
        existingScript.removeEventListener('load', handleLoad);
        existingScript.removeEventListener('error', handleError);
      };
    }

    const script = document.createElement('script');
    script.id = PAYPAL_SDK_SCRIPT_ID;
    script.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(
      PAYPAL_CLIENT_ID,
    )}&currency=${encodeURIComponent(PAYPAL_CURRENCY)}&intent=capture&components=buttons`;
    script.async = true;
    script.addEventListener('load', handleLoad);
    script.addEventListener('error', handleError);
    document.body.appendChild(script);

    return () => {
      script.removeEventListener('load', handleLoad);
      script.removeEventListener('error', handleError);
    };
  }, [isOpen, mode]);

  const subtotal = cart.reduce((sum, item) => sum + item.price * (item.quantity || 1), 0);
  const shipping = 0;
  const tax = 0;
  const total = subtotal;
  const canCheckout = cart.length > 0;
  const itemCount = cart.reduce((sum, item) => sum + (item.quantity || 1), 0);
  const paypalOrderAmount =
    PAYPAL_CURRENCY === 'KRW'
      ? Math.max(1, Math.round(total)).toString()
      : Math.max(1, Math.round((total / 1350) * 100) / 100).toFixed(2);

  const validateCheckoutFields = (emailOverride?: string) => {
    const normalizedName = checkoutName.trim();
    const normalizedAddress = checkoutAddress.trim();
    const normalizedPhone = checkoutPhone.trim();
    const normalizedEmail = (emailOverride ?? checkoutEmail).trim();

    if (!normalizedName || !normalizedAddress || !normalizedPhone || !normalizedEmail) {
      setCheckoutError('이름, 주소, 핸드폰 번호, 이메일을 모두 입력하세요.');
      return false;
    }

    if (!canCheckout) {
      setCheckoutError('장바구니가 비어 있습니다.');
      return false;
    }

    return true;
  };

  const submitBankTransferOrder = async (channel: OrderChannel) => {
    const normalizedName = checkoutName.trim();
    const normalizedAddress = checkoutAddress.trim();
    const normalizedPhone = checkoutPhone.trim();
    const normalizedEmail = (channel === 'member' ? user?.email || checkoutEmail : checkoutEmail).trim();

    setCheckoutMessage(null);
    setCheckoutError(null);

    if (!validateCheckoutFields(normalizedEmail)) return;

    if (channel === 'member' && !isAuthenticated) {
      setCheckoutError('회원 구매는 로그인 상태에서만 가능합니다.');
      return;
    }

    const normalizedGuestLookupPassword = guestLookupPassword.trim();
    if (channel === 'guest' && normalizedGuestLookupPassword.length < 4) {
      setCheckoutError('비회원 주문조회 비밀번호를 4자 이상 입력해 주세요.');
      return;
    }

    setIsSubmittingOrder(true);
    try {
      const response = await fetch('/api/orders/bank-transfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transactionId,
          channel,
          customer: {
            name: normalizedName,
            email: normalizedEmail,
            phone: normalizedPhone,
            country: checkoutCountry,
            address: normalizedAddress,
          },
          bankAccount: {
            bankName: BANK_NAME,
            accountNumber: BANK_ACCOUNT_NUMBER,
          },
          pricing: {
            subtotal,
            shipping,
            tax,
            total,
            currency: 'KRW',
          },
          guestLookupPassword:
            channel === 'guest' ? normalizedGuestLookupPassword : undefined,
          items: cart.map((item) => {
            const quantity = item.quantity || 1;
            return {
              id: item.id,
              name: item.name,
              category: item.category || '기타',
              selectedSize: item.selectedSize || null,
              quantity,
              unitPrice: item.price,
              lineTotal: item.price * quantity,
            };
          }),
        }),
      });

      const payload = (await response.json()) as {
        message?: string;
        guestOrderNumber?: string | null;
      };
      if (!response.ok) {
        throw new Error(payload.message || '주문 접수 중 오류가 발생했습니다.');
      }

      if (channel === 'guest' && payload.guestOrderNumber) {
        window.alert(
          `비회원 주문번호는 ${payload.guestOrderNumber} 입니다. 로그인 탭의 비회원 주문조회에서 사용하세요.`,
        );
        setCheckoutMessage(
          `비회원 주문이 접수되었습니다. 주문번호: ${payload.guestOrderNumber} (로그인 탭의 비회원 주문조회에서 사용)`,
        );
      } else {
        setCheckoutMessage('주문이 접수되었습니다. 입금 확인 후 순차 처리됩니다.');
      }
      clearCart();
      setMode('cart');
      setCheckoutName('');
      setCheckoutAddress('');
      setCheckoutPhone('');
      setGuestLookupPassword('');
      setTransactionId(Array.from({ length: 9 }, () => Math.floor(Math.random() * 10)).join(''));
    } catch (error) {
      setCheckoutError(error instanceof Error ? error.message : '주문 전송에 실패했습니다.');
    } finally {
      setIsSubmittingOrder(false);
    }
  };

  useEffect(() => {
    if (!isOpen || mode !== 'checkout') return;
    if (!paypalSdkReady || !window.paypal || !paypalContainerRef.current) return;
    if (!canCheckout) return;

    setPaypalError(null);
    paypalContainerRef.current.innerHTML = '';

    const paypalButtons = window.paypal.Buttons({
      style: {
        layout: 'vertical',
        shape: 'rect',
        color: 'gold',
        label: 'paypal',
      },
      onClick: async (_data, actions) => {
        setCheckoutError(null);
        setCheckoutMessage(null);

        if (!validateCheckoutFields()) {
          await actions.reject();
          return;
        }

        if (!isAuthenticated && guestLookupPassword.trim().length < 4) {
          setCheckoutError('비회원 주문조회 비밀번호를 4자 이상 입력해 주세요.');
          await actions.reject();
          return;
        }

        await actions.resolve();
      },
      createOrder: async (_data, actions) =>
        actions.order.create({
          purchase_units: [
            {
              amount: {
                currency_code: PAYPAL_CURRENCY,
                value: paypalOrderAmount,
              },
              description: `ENICO VECK ORDER ${transactionId}`,
            },
          ],
        }),
      onApprove: async (data, actions) => {
        setCheckoutError(null);
        setCheckoutMessage(null);
        setIsSubmittingOrder(true);
        try {
          const capturePayload = await actions.order.capture();
          const capture = parsePayPalCapture(capturePayload);
          const normalizedName = checkoutName.trim();
          const normalizedAddress = checkoutAddress.trim();
          const normalizedPhone = checkoutPhone.trim();
          const normalizedEmail =
            capture.payerEmail || checkoutEmail.trim() || user?.email || '';
          const channel: OrderChannel = isAuthenticated ? 'member' : 'guest';
          const normalizedGuestLookupPassword = guestLookupPassword.trim();

          const response = await fetch('/api/orders/paypal', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              transactionId,
              channel,
              customer: {
                name: normalizedName,
                email: normalizedEmail,
                phone: normalizedPhone,
                country: checkoutCountry,
                address: normalizedAddress,
              },
              pricing: {
                subtotal,
                shipping,
                tax,
                total,
                currency: 'KRW',
              },
              guestLookupPassword:
                channel === 'guest' ? normalizedGuestLookupPassword : undefined,
              paypal: {
                orderId: data.orderID,
                captureId: capture.captureId,
                status: capture.status,
                currency: capture.capturedAmount.currency || PAYPAL_CURRENCY,
                value: capture.capturedAmount.value || paypalOrderAmount,
              },
              items: cart.map((item) => {
                const quantity = item.quantity || 1;
                return {
                  id: item.id,
                  name: item.name,
                  category: item.category || '기타',
                  selectedSize: item.selectedSize || null,
                  quantity,
                  unitPrice: item.price,
                  lineTotal: item.price * quantity,
                };
              }),
            }),
          });

          const payload = (await response.json()) as {
            message?: string;
            guestOrderNumber?: string | null;
          };
          if (!response.ok) {
            throw new Error(payload.message || 'PayPal 주문 후처리에 실패했습니다.');
          }

          if (channel === 'guest' && payload.guestOrderNumber) {
            window.alert(
              `비회원 주문번호는 ${payload.guestOrderNumber} 입니다. 로그인 탭의 비회원 주문조회에서 사용하세요.`,
            );
            setCheckoutMessage(
              `PayPal 결제 완료. 비회원 주문번호: ${payload.guestOrderNumber} (로그인 탭의 비회원 주문조회에서 사용)`,
            );
          } else {
            setCheckoutMessage('PayPal 결제가 완료되었습니다. 주문이 접수되었습니다.');
          }
          clearCart();
          setMode('cart');
          setCheckoutName('');
          setCheckoutAddress('');
          setCheckoutPhone('');
          setGuestLookupPassword('');
          setTransactionId(Array.from({ length: 9 }, () => Math.floor(Math.random() * 10)).join(''));
        } catch (error) {
          setCheckoutError(error instanceof Error ? error.message : 'PayPal 결제 처리 중 오류가 발생했습니다.');
        } finally {
          setIsSubmittingOrder(false);
        }
      },
      onError: (error) => {
        const message =
          error instanceof Error ? error.message : 'PayPal 결제 처리 중 오류가 발생했습니다.';
        setPaypalError(message);
      },
    });

    paypalButtonsInstanceRef.current = paypalButtons;
    void paypalButtons
      .render(paypalContainerRef.current)
      .catch(() => setPaypalError('PayPal 버튼 렌더링에 실패했습니다.'));

    return () => {
      const instance = paypalButtonsInstanceRef.current;
      if (instance?.close) {
        void instance.close();
      }
      paypalButtonsInstanceRef.current = null;
    };
  }, [
    canCheckout,
    cart,
    checkoutAddress,
    checkoutCountry,
    checkoutEmail,
    guestLookupPassword,
    checkoutName,
    checkoutPhone,
    clearCart,
    isAuthenticated,
    isOpen,
    mode,
    paypalOrderAmount,
    paypalSdkReady,
    shipping,
    subtotal,
    tax,
    total,
    transactionId,
    user?.email,
  ]);

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
                  <p className="text-[10px] text-[#00ffd1] uppercase tracking-[0.2em]">결제 콘솔</p>
                  <h2 className="text-3xl md:text-4xl font-heading font-black uppercase tracking-tighter leading-none mt-2">
                    {mode === 'checkout' ? '결제' : '장바구니'}
                  </h2>
                  <p className="text-[10px] text-[#666] uppercase tracking-widest mt-2">
                    /// 거래번호: {transactionId || '생성중'}
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
                  <p className="text-[10px] uppercase tracking-widest text-[#666]">단계 01</p>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-xs uppercase tracking-widest">상품</span>
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
                  <p className="text-[10px] uppercase tracking-widest text-[#666]">단계 02</p>
                  <div className="mt-2">
                    <span className="text-xs uppercase tracking-widest">결제</span>
                  </div>
                </button>
              </div>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto p-6 md:p-7 space-y-5">
              <div className="sticky top-0 z-10 border border-[#333] bg-[#0b0b0b]/95 backdrop-blur-md p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.18em] text-[#666]">주문 요약</p>
                    <p className="text-xs text-[#9a9a9a] mt-2">
                      {itemCount}개 상품
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] uppercase text-[#666]">주문 합계</p>
                    <p className="text-xl font-bold text-[#00ffd1]">{formatKrw(subtotal)}</p>
                  </div>
                </div>

                <div className="mt-3 border border-[#222] bg-[#111] p-3 space-y-2">
                  {canCheckout ? (
                    cart.map((item) => {
                      const quantity = item.quantity || 1;
                      const lineTotal = item.price * quantity;
                      return (
                        <div
                          key={`summary-${item.id}-${item.selectedSize ?? 'na'}`}
                          className="flex items-center justify-between gap-3 text-[11px]"
                        >
                          <p className="text-[#d5d5d5] truncate">
                            {item.name}
                            {quantity > 1 ? ` x${quantity}` : ''}
                          </p>
                          <p className="text-[#e5e5e5] shrink-0">{formatKrw(lineTotal)}</p>
                        </div>
                      );
                    })
                  ) : (
                    <p className="text-[11px] text-[#777]">주문할 상품이 없습니다.</p>
                  )}
                </div>
              </div>

              {mode === 'cart' ? (
                <>
                  {!canCheckout ? (
                    <div className="border border-dashed border-[#333] bg-[#0a0a0a] p-8 text-center">
                      <p className="font-heading text-2xl uppercase mb-2">비어 있음</p>
                      <p className="text-xs text-[#888]">선택된 항목이 없습니다. 의류 섹션에서 담아주세요.</p>
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
                                    {item.category || '항목'} // {item.id}
                                    {item.selectedSize ? ` // 사이즈 ${item.selectedSize}` : ''}
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
                                  <p className="text-[10px] text-[#666] uppercase">단가</p>
                                  <p className="text-sm text-[#e5e5e5]">{formatKrw(item.price)}</p>
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
                    <p className="text-[10px] uppercase tracking-[0.18em] text-[#00ffd1] mb-3">연락처</p>
                    <div className="space-y-3">
                      <div>
                        <label className="block text-[10px] text-[#666] mb-2 uppercase">
                          이메일
                        </label>
                        <input
                          type="email"
                          value={checkoutEmail}
                          onChange={(e) => setCheckoutEmail(e.target.value)}
                          placeholder="이메일 입력"
                          className="w-full bg-black border border-[#333] py-3 px-3 text-sm focus:outline-none focus:border-[#00ffd1] text-[#e5e5e5]"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-[#666] mb-2 uppercase">
                          핸드폰 번호
                        </label>
                        <input
                          type="tel"
                          value={checkoutPhone}
                          onChange={(e) => setCheckoutPhone(e.target.value)}
                          placeholder="010-0000-0000"
                          className="w-full bg-black border border-[#333] py-3 px-3 text-sm focus:outline-none focus:border-[#00ffd1] text-[#e5e5e5]"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-[#666] mb-2 uppercase">
                          수령인 이름
                        </label>
                        <input
                          type="text"
                          value={checkoutName}
                          onChange={(e) => setCheckoutName(e.target.value)}
                          placeholder="수령인 이름 입력"
                          className="w-full bg-black border border-[#333] py-3 px-3 text-sm focus:outline-none focus:border-[#00ffd1] text-[#e5e5e5]"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="border border-[#333] bg-[#111] p-4">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-[#00ffd1] mb-3">배송 정보</p>
                    <div className="space-y-3">
                      <div>
                        <label className="block text-[10px] text-[#666] mb-2 uppercase">구역 (국가)</label>
                        <select
                          value={checkoutCountry}
                          onChange={(e) => setCheckoutCountry(e.target.value)}
                          className="w-full bg-black border border-[#333] py-3 px-3 text-sm focus:outline-none focus:border-[#00ffd1] text-[#e5e5e5]"
                        >
                          <option>구역_1 (미국)</option>
                          <option>구역_2 (영국)</option>
                          <option>구역_3 (아시아)</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] text-[#666] mb-2 uppercase">
                          주소
                        </label>
                        <textarea
                          value={checkoutAddress}
                          onChange={(e) => setCheckoutAddress(e.target.value)}
                          rows={3}
                          placeholder="수령지 / 도로명 / 도시"
                          className="w-full bg-black border border-[#333] py-3 px-3 text-sm focus:outline-none focus:border-[#00ffd1] text-[#e5e5e5] resize-none"
                        />
                      </div>
                      {!isAuthenticated && (
                        <div>
                          <label className="block text-[10px] text-[#666] mb-2 uppercase">
                            비회원 주문조회 비밀번호 (4자 이상)
                          </label>
                          <input
                            type="password"
                            value={guestLookupPassword}
                            onChange={(e) => setGuestLookupPassword(e.target.value)}
                            placeholder="비회원 주문조회용 비밀번호 입력"
                            className="w-full bg-black border border-[#333] py-3 px-3 text-sm focus:outline-none focus:border-[#00ffd1] text-[#e5e5e5]"
                          />
                          <p className="text-[10px] text-[#777] mt-2">
                            비회원 주문 완료 후 발급되는 주문번호 + 이 비밀번호로 배송조회가 가능합니다.
                          </p>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="border border-[#333] bg-[#111] p-4">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-[#00ffd1] mb-3">계좌이체 안내</p>
                    <div className="border border-[#00ffd1]/40 bg-[#00ffd1]/10 p-4">
                      <p className="text-[10px] uppercase tracking-widest text-[#88ffe8]">입금 계좌</p>
                      <p className="text-lg font-bold text-[#e5e5e5] mt-2">
                        {BANK_NAME} {BANK_ACCOUNT_NUMBER}
                      </p>
                      <p className="text-xs text-[#9adfd1] mt-3 leading-relaxed">
                        주문 접수 후 위 계좌로 입금해 주세요. 입금자명은 수령인 이름과 동일하게 입력해 주세요.
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                    <div className="border border-[#333] bg-[#0d0d0d] p-3 flex items-start gap-2">
                      <ShieldCheck size={14} className="text-[#00ffd1] mt-0.5 shrink-0" />
                      <p className="text-[#999] leading-relaxed">
                        주문이 접수되면 관리자 메일로 주문자 정보와 주문 금액이 전달됩니다.
                      </p>
                    </div>
                    <div className="border border-[#333] bg-[#0d0d0d] p-3 flex items-start gap-2">
                      <Truck size={14} className="text-[#00ffd1] mt-0.5 shrink-0" />
                      <p className="text-[#999] leading-relaxed">
                        입금 확인 후 배송 절차가 시작되며, 확인 연락은 입력한 이메일로 안내됩니다.
                      </p>
                    </div>
                  </div>

                  {(checkoutMessage || checkoutError) && (
                    <div
                      className={`border p-3 text-xs ${
                        checkoutError
                          ? 'border-red-700 bg-red-950/20 text-red-300'
                          : 'border-[#00ffd1]/40 bg-[#00ffd1]/5 text-[#bafff0]'
                      }`}
                    >
                      {checkoutError || checkoutMessage}
                    </div>
                  )}
                </div>
              )}
            </div>

            {canCheckout && (
              <div className="border-t border-[#333] bg-[#050505] p-6 md:p-7">
                <div className="flex items-center justify-between gap-3 mb-4">
                  <div className="text-xs text-[#888]">
                    <p className="uppercase tracking-widest text-[#666]">주문 합계</p>
                    <p className="text-lg text-[#e5e5e5] mt-1">{formatKrw(subtotal)}</p>
                  </div>
                  <div className="inline-flex items-center gap-2 border border-[#333] bg-[#111] px-3 py-2 text-[10px] uppercase tracking-widest">
                    <CreditCard size={12} className="text-[#00ffd1]" />
                    <span className="text-[#aaa]">계좌이체 주문</span>
                  </div>
                </div>

                {mode === 'cart' ? (
                  <button
                    onClick={() => setMode('checkout')}
                    className="w-full py-4 bg-[#e5e5e5] text-black font-heading uppercase text-xl hover:bg-[#00ffd1] transition-colors tracking-widest"
                  >
                    결제로 이동
                  </button>
                ) : (
                  <div className="space-y-2">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => void submitBankTransferOrder('member')}
                        disabled={isSubmittingOrder || !isAuthenticated}
                        className="py-4 border border-[#00ffd1] text-[#00ffd1] hover:bg-[#00ffd1] hover:text-black transition-colors uppercase text-xs tracking-widest disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-[#00ffd1]"
                      >
                        {isSubmittingOrder ? '처리중...' : '회원 계좌이체 구매'}
                      </button>
                      <button
                        type="button"
                        onClick={() => void submitBankTransferOrder('guest')}
                        disabled={isSubmittingOrder}
                        className="py-4 bg-[#00ffd1] text-black font-heading uppercase text-lg hover:bg-white transition-colors tracking-widest disabled:opacity-50"
                      >
                        {isSubmittingOrder ? '처리중...' : '비회원 구매'}
                      </button>
                    </div>
                    <div className="border border-[#333] bg-[#0a0a0a] p-3">
                      <p className="text-[10px] uppercase tracking-widest text-[#00ffd1] mb-2">
                        PayPal 결제 (Sandbox)
                      </p>
                      <p className="text-[10px] text-[#777] mb-3">
                        테스트 결제용 버튼입니다. 결제 완료 후 주문 메일이 발송됩니다.
                      </p>
                      {paypalError && (
                        <p className="text-[10px] text-red-300 mb-2">{paypalError}</p>
                      )}
                      <div
                        ref={paypalContainerRef}
                        className="min-h-[44px]"
                        aria-label="paypal-sandbox-button"
                      />
                    </div>
                    {!isAuthenticated && (
                      <p className="text-[10px] text-[#888]">
                        회원 계좌이체 구매는 로그인 후 사용할 수 있습니다. 비회원은 결제 시 설정한 비밀번호와 주문번호로 배송조회가 가능합니다.
                      </p>
                    )}
                    <button
                      onClick={() => setMode('cart')}
                      className="w-full py-3 border border-[#333] text-[#888] hover:text-[#e5e5e5] hover:border-[#e5e5e5] uppercase text-xs tracking-widest transition-colors"
                    >
                      장바구니로
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
