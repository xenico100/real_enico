'use client';

import Image from 'next/image';
import { useCallback, useEffect, useRef, useState } from 'react';
import { X, Trash2, CreditCard, ShieldCheck, Truck } from 'lucide-react';
import { useFashionCart } from '@/app/context/FashionCartContext';
import { useAuth } from '@/app/context/AuthContext';
import { shouldBypassImageOptimization } from '@/lib/images';
import { motion, AnimatePresence } from 'motion/react';

interface CartOverlayProps {
  isOpen: boolean;
  onClose: () => void;
}

type CheckoutMode = 'cart' | 'checkout';
type OrderChannel = 'member' | 'guest';

const BANK_NAME = '카카오뱅크';
const BANK_ACCOUNT_NUMBER = '3333-09-2834969';
const BANK_ACCOUNT_HOLDER = '백형석';
const PAYPAL_SDK_SCRIPT_ID = 'paypal-sdk-script';
const PAYPAL_CLIENT_ID = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID || '';
const PAYPAL_CURRENCY = (process.env.NEXT_PUBLIC_PAYPAL_CURRENCY || 'USD').toUpperCase();
const CHECKOUT_REGIONS = ['서울', '구역_1 (미국)', '구역_2 (영국)', '구역_3 (아시아)'] as const;

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
  const { cart, removeFromCart, clearCart } = useFashionCart();
  const { isAuthenticated, user, profile } = useAuth();
  const checkoutScrollRef = useRef<HTMLDivElement | null>(null);
  const paypalContainerRef = useRef<HTMLDivElement | null>(null);
  const paypalButtonsInstanceRef = useRef<PayPalButtonsInstance | null>(null);
  const checkoutEmailInputRef = useRef<HTMLInputElement | null>(null);
  const checkoutPhoneInputRef = useRef<HTMLInputElement | null>(null);
  const checkoutNameInputRef = useRef<HTMLInputElement | null>(null);
  const checkoutRegionSelectRef = useRef<HTMLSelectElement | null>(null);
  const checkoutAddressInputRef = useRef<HTMLTextAreaElement | null>(null);
  const guestPasswordInputRef = useRef<HTMLInputElement | null>(null);
  const [mode, setMode] = useState<CheckoutMode>('cart');
  const [transactionId, setTransactionId] = useState('');
  const [checkoutEmail, setCheckoutEmail] = useState('');
  const [checkoutCountry, setCheckoutCountry] = useState<string>(CHECKOUT_REGIONS[0]);
  const [checkoutName, setCheckoutName] = useState('');
  const [checkoutAddress, setCheckoutAddress] = useState('');
  const [checkoutPhone, setCheckoutPhone] = useState('');
  const [guestLookupPassword, setGuestLookupPassword] = useState('');
  const [isSubmittingOrder, setIsSubmittingOrder] = useState(false);
  const [paypalSdkReady, setPaypalSdkReady] = useState(false);
  const [paypalError, setPaypalError] = useState<string | null>(null);
  const [paypalRetryNonce, setPaypalRetryNonce] = useState(0);
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
    if (!isOpen || !isAuthenticated) return;

    const metadata =
      user && user.user_metadata && typeof user.user_metadata === 'object'
        ? (user.user_metadata as Record<string, unknown>)
        : null;

    const profileName = profile?.full_name?.trim() || '';
    const metadataName =
      (typeof metadata?.full_name === 'string' && metadata.full_name.trim()) ||
      (typeof metadata?.name === 'string' && metadata.name.trim()) ||
      '';
    const metadataPhone =
      (typeof metadata?.phone === 'string' && metadata.phone.trim()) ||
      (typeof metadata?.phone_number === 'string' && metadata.phone_number.trim()) ||
      '';
    const metadataAddress =
      (typeof metadata?.address === 'string' && metadata.address.trim()) ||
      (typeof metadata?.shipping_address === 'string' && metadata.shipping_address.trim()) ||
      '';

    const nextName = profileName || metadataName;
    if (nextName) {
      setCheckoutName((previous) => (previous.trim() ? previous : nextName));
    }

    if (metadataPhone) {
      setCheckoutPhone((previous) => (previous.trim() ? previous : metadataPhone));
    }

    if (metadataAddress) {
      setCheckoutAddress((previous) => (previous.trim() ? previous : metadataAddress));
    }
  }, [isOpen, isAuthenticated, user, profile?.full_name]);

  useEffect(() => {
    if (!isOpen || mode !== 'checkout') return;
    if (!PAYPAL_CLIENT_ID) {
      setPaypalError('PayPal Client ID가 설정되지 않았습니다.');
      return;
    }
    if (typeof window === 'undefined') return;

    if (window.paypal) {
      setPaypalSdkReady(true);
      setPaypalError(null);
      return;
    }

    setPaypalSdkReady(false);

    const existingScript = document.getElementById(PAYPAL_SDK_SCRIPT_ID) as HTMLScriptElement | null;
    const scriptUrl = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(
      PAYPAL_CLIENT_ID,
    )}&currency=${encodeURIComponent(PAYPAL_CURRENCY)}&intent=capture&components=buttons`;
    const handleLoad = () => {
      if (!window.paypal) {
        setPaypalError('PayPal SDK를 불러왔지만 버튼 초기화에 실패했습니다. 다시 시도해 주세요.');
        return;
      }
      setPaypalSdkReady(true);
      setPaypalError(null);
    };
    const handleError = () => {
      setPaypalSdkReady(false);
      setPaypalError('PayPal SDK 로드에 실패했습니다. 광고 차단기나 브라우저 차단 설정을 확인해 주세요.');
    };
    const timeoutId = window.setTimeout(() => {
      if (!window.paypal) {
        setPaypalError('PayPal 버튼 로딩이 평소보다 느립니다. 잠시 후 다시 시도해 주세요.');
      }
    }, 15000);

    if (existingScript) {
      if (existingScript.src !== scriptUrl) {
        existingScript.remove();
      } else {
        existingScript.addEventListener('load', handleLoad);
        existingScript.addEventListener('error', handleError);

        if (window.paypal) {
          handleLoad();
        }

        return () => {
          window.clearTimeout(timeoutId);
          existingScript.removeEventListener('load', handleLoad);
          existingScript.removeEventListener('error', handleError);
        };
      }
    }

    const script = document.createElement('script');
    script.id = PAYPAL_SDK_SCRIPT_ID;
    script.src = scriptUrl;
    script.async = true;
    script.addEventListener('load', handleLoad);
    script.addEventListener('error', handleError);
    document.body.appendChild(script);

    return () => {
      window.clearTimeout(timeoutId);
      script.removeEventListener('load', handleLoad);
      script.removeEventListener('error', handleError);
    };
  }, [isOpen, mode, paypalRetryNonce]);

  const subtotal = cart.reduce((sum, item) => sum + item.price * (item.quantity || 1), 0);
  const canCheckout = cart.length > 0;
  const shipping = canCheckout ? 3000 : 0;
  const tax = 0;
  const total = subtotal + shipping;
  const itemCount = cart.reduce((sum, item) => sum + (item.quantity || 1), 0);
  const paypalOrderAmount =
    PAYPAL_CURRENCY === 'KRW'
      ? Math.max(1, Math.round(total)).toString()
      : Math.max(1, Math.round((total / 1350) * 100) / 100).toFixed(2);

  const announceCheckoutError = useCallback(
    (
      message: string,
      target?:
        | HTMLInputElement
        | HTMLTextAreaElement
        | HTMLSelectElement
        | null,
    ) => {
      setCheckoutError(message);
      if (typeof window !== 'undefined') {
        window.alert(message);
      }
      if (target) {
        requestAnimationFrame(() => {
          target.focus();
          target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        });
      }
    },
    [],
  );

  const validateCheckoutFields = useCallback((emailOverride?: string) => {
    const normalizedName = checkoutName.trim();
    const normalizedAddress = checkoutAddress.trim();
    const normalizedPhone = checkoutPhone.trim();
    const normalizedEmail = (emailOverride ?? checkoutEmail).trim();

    if (!normalizedEmail) {
      announceCheckoutError('주문정보를 입력하세요. 이메일이 비어 있습니다.', checkoutEmailInputRef.current);
      return false;
    }

    if (!normalizedPhone) {
      announceCheckoutError(
        '주문정보를 입력하세요. 핸드폰 번호가 비어 있습니다.',
        checkoutPhoneInputRef.current,
      );
      return false;
    }

    if (!normalizedName) {
      announceCheckoutError('주문정보를 입력하세요. 수령인 이름이 비어 있습니다.', checkoutNameInputRef.current);
      return false;
    }

    if (!checkoutCountry.trim()) {
      announceCheckoutError('주문정보를 입력하세요. 구역을 선택해 주세요.', checkoutRegionSelectRef.current);
      return false;
    }

    if (!normalizedAddress) {
      announceCheckoutError('주문정보를 입력하세요. 주소가 비어 있습니다.', checkoutAddressInputRef.current);
      return false;
    }

    if (!canCheckout) {
      announceCheckoutError('장바구니가 비어 있습니다.');
      return false;
    }

    return true;
  }, [
    announceCheckoutError,
    canCheckout,
    checkoutAddress,
    checkoutCountry,
    checkoutEmail,
    checkoutName,
    checkoutPhone,
  ]);

  const submitBankTransferOrder = async (channel: OrderChannel) => {
    const normalizedName = checkoutName.trim();
    const normalizedAddress = checkoutAddress.trim();
    const normalizedPhone = checkoutPhone.trim();
    const normalizedEmail = (channel === 'member' ? user?.email || checkoutEmail : checkoutEmail).trim();

    setCheckoutMessage(null);
    setCheckoutError(null);

    if (!validateCheckoutFields(normalizedEmail)) return;

    if (channel === 'member' && !isAuthenticated) {
      announceCheckoutError('회원 구매는 로그인 상태에서만 가능합니다.');
      return;
    }

    const normalizedGuestLookupPassword = guestLookupPassword.trim();
    if (channel === 'guest' && normalizedGuestLookupPassword.length < 4) {
      announceCheckoutError(
        '비회원 주문조회 비밀번호를 4자 이상 입력해 주세요.',
        guestPasswordInputRef.current,
      );
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
            accountHolder: BANK_ACCOUNT_HOLDER,
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
      };
      if (!response.ok) {
        throw new Error(payload.message || '주문 접수 중 오류가 발생했습니다.');
      }

      if (channel === 'guest') {
        setCheckoutMessage(
          '비회원 주문이 접수되었습니다. 모바일에서 주문한 핸드폰 번호와 주문 비밀번호로 배송조회할 수 있습니다.',
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
          announceCheckoutError(
            '비회원 주문조회 비밀번호를 4자 이상 입력해 주세요.',
            guestPasswordInputRef.current,
          );
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
          };
          if (!response.ok) {
            throw new Error(payload.message || 'PayPal 주문 후처리에 실패했습니다.');
          }

          if (channel === 'guest') {
            setCheckoutMessage(
              'PayPal 결제가 완료되었습니다. 모바일에서 주문한 핸드폰 번호와 주문 비밀번호로 배송조회할 수 있습니다.',
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
    announceCheckoutError,
    validateCheckoutFields,
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
            className="fixed inset-x-2 top-3 bottom-5 z-[90] flex h-auto flex-col overflow-hidden rounded-2xl border border-[#333] bg-[#0a0a0a] font-mono text-[#e5e5e5] shadow-[0_24px_80px_rgba(0,0,0,0.45)] md:inset-x-auto md:top-0 md:right-0 md:bottom-0 md:w-[560px] md:rounded-none md:border-l md:border-t-0 md:border-r-0 md:border-b-0 md:shadow-none"
          >
            <div className="border-b border-[#333] bg-[radial-gradient(circle_at_1px_1px,rgba(255,255,255,0.14)_1px,transparent_0)] bg-[size:14px_14px] px-5 pb-4 pt-[calc(env(safe-area-inset-top)+14px)] md:p-7">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] text-[#00ffd1] uppercase tracking-[0.2em]">결제 콘솔</p>
                  <h2 className="mt-2 text-[1.85rem] font-heading font-black uppercase tracking-tighter leading-[0.94] md:text-4xl">
                    {mode === 'checkout' ? '결제' : '장바구니'}
                  </h2>
                </div>
                <button
                  onClick={onClose}
                  className="p-2 border border-[#333] bg-black/60 hover:border-[#00ffd1] hover:text-[#00ffd1] transition-colors"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            <div
              ref={checkoutScrollRef}
              className="flex-1 min-h-0 overflow-y-auto px-5 py-5 pb-32 md:p-7 md:pb-7 space-y-5"
            >
              <div className="sticky top-0 z-10 border border-[#333] bg-[#0b0b0b]/95 px-4 py-4 backdrop-blur-md">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.18em] text-[#666]">주문 요약</p>
                  <p className="mt-2 text-xs text-[#9a9a9a]">{itemCount}개 상품</p>
                </div>

                <div className="mt-3 border border-[#222] bg-[#111] px-4 py-3 space-y-2">
                  {canCheckout ? (
                    cart.map((item) => {
                      const quantity = item.quantity || 1;
                      return (
                        <div
                          key={`summary-${item.id}-${item.selectedSize ?? 'na'}`}
                          className="text-[11px]"
                        >
                          <p className="line-clamp-2 leading-snug text-[#d5d5d5]">
                            {item.name}
                            {quantity > 1 ? ` x${quantity}` : ''}
                          </p>
                        </div>
                      );
                    })
                  ) : (
                    <p className="text-[11px] text-[#777]">주문할 상품이 없습니다.</p>
                  )}
                </div>
              </div>

              {(checkoutMessage || checkoutError) && (
                <div
                  className={`border px-4 py-3 text-xs leading-relaxed ${
                    checkoutError
                      ? 'border-red-700 bg-red-950/20 text-red-300'
                      : 'border-[#00ffd1]/40 bg-[#00ffd1]/5 text-[#bafff0]'
                  }`}
                >
                  {checkoutError || checkoutMessage}
                </div>
              )}

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
                            <div className="w-20 aspect-[4/5] bg-[#111] border border-[#333] shrink-0 relative overflow-hidden">
                              <Image
                                src={item.image}
                                alt=""
                                fill
                                unoptimized={shouldBypassImageOptimization(item.image)}
                                sizes="80px"
                                className="object-contain bg-black grayscale contrast-125"
                              />
                              <div className="absolute inset-0 bg-[#00ffd1] mix-blend-color opacity-0 hover:opacity-20 transition-opacity" />
                            </div>

                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <h3 className="line-clamp-2 break-words text-sm font-bold uppercase leading-snug text-white">
                                    {item.name}
                                  </h3>
                                  <p className="text-[10px] text-[#888] mt-2 uppercase">
                                    {[item.category || '항목', item.id, item.selectedSize ? `사이즈 ${item.selectedSize}` : null]
                                      .filter(Boolean)
                                      .join(' | ')}
                                  </p>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => removeFromCart(item.id, item.selectedSize)}
                                  className="p-2 border border-[#333] bg-[#111] text-[#666] hover:text-[#00ffd1] hover:border-[#00ffd1] transition-colors shrink-0"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>

                              <div className="mt-4 flex items-center justify-between gap-3">
                                <div className="flex items-center bg-[#111] border border-[#333] px-3 py-2">
                                  <span className="text-[10px] uppercase tracking-widest text-[#8fd6c8]">
                                    수량 1 (재고 1개)
                                  </span>
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
                  <div className="border border-[#333] bg-[#111] px-5 py-4">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-[#00ffd1] mb-3">계좌이체 안내</p>
                    <div className="border border-[#00ffd1]/40 bg-[#00ffd1]/10 px-5 py-4">
                      <p className="text-[10px] uppercase tracking-widest text-[#88ffe8]">입금 계좌</p>
                      <p className="text-lg font-bold text-[#e5e5e5] mt-2">
                        {BANK_NAME} {BANK_ACCOUNT_NUMBER}
                      </p>
                      <p className="text-xs text-[#9adfd1] mt-1">예금주: {BANK_ACCOUNT_HOLDER}</p>
                      <p className="text-xs text-[#9adfd1] mt-3 leading-relaxed">
                        주문 접수 후 위 계좌로 입금해 주세요. 입금자명은 수령인 이름과 동일하게 입력해 주세요.
                      </p>
                    </div>
                  </div>

                  <div className="border border-[#333] bg-[#111] px-5 py-4">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-[#00ffd1] mb-3">연락처</p>
                    <div className="space-y-3">
                      <div>
                        <label className="block text-[10px] text-[#666] mb-2 uppercase">
                          이메일
                        </label>
                        <input
                          ref={checkoutEmailInputRef}
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
                          ref={checkoutPhoneInputRef}
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
                          ref={checkoutNameInputRef}
                          type="text"
                          value={checkoutName}
                          onChange={(e) => setCheckoutName(e.target.value)}
                          placeholder="수령인 이름 입력"
                          className="w-full bg-black border border-[#333] py-3 px-3 text-sm focus:outline-none focus:border-[#00ffd1] text-[#e5e5e5]"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="border border-[#333] bg-[#111] px-5 py-4">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-[#00ffd1] mb-3">배송 정보</p>
                    <div className="space-y-3">
                      <div>
                        <label className="block text-[10px] text-[#666] mb-2 uppercase">구역 (국가)</label>
                        <select
                          ref={checkoutRegionSelectRef}
                          value={checkoutCountry}
                          onChange={(e) => setCheckoutCountry(e.target.value)}
                          className="w-full bg-black border border-[#333] py-3 px-3 text-sm focus:outline-none focus:border-[#00ffd1] text-[#e5e5e5]"
                        >
                          {CHECKOUT_REGIONS.map((region) => (
                            <option key={region} value={region}>
                              {region}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] text-[#666] mb-2 uppercase">
                          주소
                        </label>
                        <textarea
                          ref={checkoutAddressInputRef}
                          value={checkoutAddress}
                          onChange={(e) => setCheckoutAddress(e.target.value)}
                          rows={3}
                          placeholder="수령지 / 도로명 / 도시"
                          className="w-full bg-black border border-[#333] py-3 px-3 text-sm focus:outline-none focus:border-[#00ffd1] text-[#e5e5e5] resize-none"
                        />
                      </div>
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
                </div>
              )}
            </div>

            {canCheckout && (
              <div className="sticky bottom-0 z-20 border-t border-[#333] bg-[#050505]/96 px-5 pt-4 pb-[calc(env(safe-area-inset-bottom)+12px)] backdrop-blur-md md:static md:bg-[#050505] md:p-7 md:pb-7">
                <div className="mb-3 border border-[#333] bg-[#0d0d0d] px-4 py-3 md:mb-4">
                  <div className="flex items-center justify-between gap-3 text-xs text-[#888]">
                    <p className="uppercase tracking-widest text-[#666]">상품 금액</p>
                    <p className="text-[#e5e5e5]">{formatKrw(subtotal)}</p>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-3 text-xs text-[#888]">
                    <p className="uppercase tracking-widest text-[#666]">배송비</p>
                    <p className="text-[#e5e5e5]">{formatKrw(shipping)}</p>
                  </div>
                  <div className="mt-2 pt-2 border-t border-[#333] flex items-center justify-between gap-3">
                    <p className="uppercase tracking-widest text-[#00ffd1] text-xs">주문 합계</p>
                    <p className="text-lg text-[#00ffd1] mt-1 font-bold">{formatKrw(total)}</p>
                  </div>
                </div>
                <div className="mb-3 inline-flex items-center gap-2 border border-[#333] bg-[#111] px-3 py-2 text-[10px] uppercase tracking-[0.18em] md:mb-4">
                    <CreditCard size={12} className="text-[#00ffd1]" />
                    <span className="text-[#aaa]">계좌이체 주문</span>
                </div>

                {mode === 'cart' ? (
                  <button
                    onClick={() => setMode('checkout')}
                    className="w-full py-4 bg-[#e5e5e5] text-black font-heading uppercase text-lg tracking-[0.16em] md:text-xl md:tracking-widest hover:bg-[#00ffd1] transition-colors"
                  >
                    결제로 이동
                  </button>
                ) : (
                  <div className="space-y-2">
                    {!isAuthenticated && (
                      <div className="mb-3 border border-[#333] bg-[#101010] px-4 py-3">
                        <label className="mb-2 block text-[10px] uppercase tracking-[0.18em] text-[#00ffd1]">
                          비회원 주문조회 비밀번호
                        </label>
                        <input
                          ref={guestPasswordInputRef}
                          type="password"
                          value={guestLookupPassword}
                          onChange={(e) => setGuestLookupPassword(e.target.value)}
                          placeholder="4자 이상 입력"
                          className="w-full bg-black border border-[#333] py-3 px-3 text-sm focus:outline-none focus:border-[#00ffd1] text-[#e5e5e5]"
                        />
                        <p className="mt-2 text-[10px] text-[#8a8a8a]">
                          비회원 구매 후 주문번호와 이 비밀번호로 배송조회합니다.
                        </p>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-2 md:gap-3">
                      <button
                        type="button"
                        onClick={() => void submitBankTransferOrder('member')}
                        disabled={isSubmittingOrder || !isAuthenticated}
                        className="group relative overflow-hidden border border-[#00ffd1] bg-[#00ffd1] px-3 py-3 text-left uppercase tracking-[0.1em] text-black shadow-[0_0_0_1px_rgba(0,255,209,0.12)] transition-all duration-200 hover:bg-[#b7fff2] disabled:border-[#2f6f64] disabled:bg-[#0c2a25] disabled:text-[#6bcfbe] md:px-4 md:py-4"
                      >
                        {isAuthenticated && !isSubmittingOrder ? (
                          <span className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.22),transparent_55%)] opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
                        ) : null}
                        <span className="relative z-10 flex items-center justify-between gap-2">
                          <span className="flex flex-col gap-1">
                            <span className="font-mono text-[9px] tracking-[0.18em] text-black/55 md:text-[10px] md:tracking-[0.24em]">
                              MEMBER
                            </span>
                            <span className="text-[11px] font-bold leading-snug text-black md:text-base">
                              {isSubmittingOrder ? '처리중...' : '회원 계좌이체'}
                            </span>
                          </span>
                          <span className="text-sm font-bold text-black md:text-base">
                            →
                          </span>
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => void submitBankTransferOrder('guest')}
                        disabled={isSubmittingOrder}
                        className="min-h-[68px] bg-[#00ffd1] px-3 py-3 text-center font-heading text-[0.95rem] uppercase tracking-[0.08em] text-black transition-colors hover:bg-white disabled:opacity-50 md:px-4 md:py-4 md:text-lg md:tracking-[0.16em]"
                      >
                        {isSubmittingOrder ? '처리중...' : '비회원 구매'}
                      </button>
                    </div>
                    <div className="border border-[#333] bg-[#0a0a0a] px-4 py-3">
                      <p className="text-[10px] uppercase tracking-widest text-[#00ffd1] mb-2">
                        PayPal 결제 (Sandbox)
                      </p>
                      <p className="text-[10px] text-[#777] mb-3">
                        테스트 결제용 버튼입니다. 결제 완료 후 주문 메일이 발송됩니다.
                      </p>
                      {paypalError && (
                        <p className="text-[10px] text-red-300 mb-2">{paypalError}</p>
                      )}
                      {!paypalSdkReady && !paypalError && (
                        <p className="text-[10px] text-[#9a9a9a] mb-2">PayPal 버튼 불러오는 중...</p>
                      )}
                      <div
                        ref={paypalContainerRef}
                        className="min-h-[44px]"
                        aria-label="paypal-sandbox-button"
                      />
                      {paypalError && (
                        <button
                          type="button"
                          onClick={() => {
                            setPaypalError(null);
                            setPaypalSdkReady(false);
                            setPaypalRetryNonce((value) => value + 1);
                          }}
                          className="mt-3 w-full border border-[#666] px-3 py-2 text-[10px] uppercase tracking-widest text-[#d8d8d8] transition-colors hover:border-[#00ffd1] hover:text-[#00ffd1]"
                        >
                          PayPal 다시 시도
                        </button>
                      )}
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
