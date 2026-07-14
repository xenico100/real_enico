'use client';

import Image from 'next/image';
import { useCallback, useEffect, useRef, useState } from 'react';
import { X, Trash2 } from 'lucide-react';
import { useFashionCart } from '@/app/context/FashionCartContext';
import { useAuth } from '@/app/context/AuthContext';
import { shouldBypassImageOptimization } from '@/lib/images';
import { NICEPAY_TEST_PRODUCT_ID } from '@/lib/storefront/productCatalog';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
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
const NICEPAY_SDK_SCRIPT_ID = 'nicepay-sdk-script';
const PAYPAL_SDK_SCRIPT_ID = 'paypal-sdk-script';
const PAYPAL_CLIENT_ID = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID || '';
const PAYPAL_CURRENCY = (process.env.NEXT_PUBLIC_PAYPAL_CURRENCY || 'USD').toUpperCase();
const DOMESTIC_REGION = '대한민국';
const DOMESTIC_SHIPPING_FEE = 3000;
const INTERNATIONAL_SHIPPING_FEE = 40000;
const PENDING_ACCOUNT_PROFILE_SYNC_STORAGE_KEY = 'enicoveck_pending_account_profile_sync';
const CHECKOUT_REGIONS = [DOMESTIC_REGION, '미국', '일본', '캐나다', '호주', '그 외'] as const;
const CHECKOUT_SECTION_CLASS =
  'overflow-hidden rounded-[18px] border border-[#d1d5db] bg-white px-4 py-4 shadow-sm md:px-6 md:py-6';
const CHECKOUT_FIELD_GROUP_CLASS =
  'rounded-[14px] border border-[#e5e7eb] bg-[#f8f9fa] px-3.5 py-3.5 shadow-sm md:px-5 md:py-5';
const CHECKOUT_FIELD_CLASS =
  'w-full rounded-[12px] border border-[#d1d5db] bg-white px-3.5 py-3 text-[15px] leading-[1.45] text-[#111827] placeholder:text-[#9ca3af] focus:border-[#b8001f] focus:outline-none focus:ring-2 focus:ring-[#b8001f]/15 font-medium';
const CHECKOUT_FIELD_HEADER_CLASS = 'mb-2.5';
const CHECKOUT_FIELD_BODY_CLASS = '';

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
      height?: number;
    };
  }) => PayPalButtonsInstance;
};

type NicepayErrorResult = {
  errorMsg?: string;
  errorCode?: string;
  msg?: string;
};

type NicepayNamespace = {
  requestPay: (payload: {
    clientId: string;
    method: 'card';
    orderId: string;
    amount: number;
    goodsName: string;
    returnUrl: string;
    buyerName?: string;
    buyerTel?: string;
    buyerEmail?: string;
    mallReserved?: string;
    fnError?: (result: NicepayErrorResult) => void;
  }) => void;
};

declare global {
  interface Window {
    paypal?: PayPalNamespace;
    AUTHNICE?: NicepayNamespace;
  }
}

function formatUnknownErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }
  return '알 수 없는 오류';
}

async function diagnosePaypalSdkLoad(scriptUrl: string) {
  try {
    const response = await fetch(scriptUrl, {
      method: 'GET',
      cache: 'no-store',
    });

    if (!response.ok) {
      return `PayPal SDK 응답 오류(${response.status}). Client ID와 PayPal 앱 상태를 확인해 주세요.`;
    }

    return 'PayPal SDK URL 응답은 정상인데 브라우저가 스크립트 실행을 차단했습니다. 광고 차단기, Brave/Safari 추적 차단, 회사/통신사 보안 필터를 확인해 주세요.';
  } catch (error) {
    return `PayPal SDK 네트워크 요청 실패: ${formatUnknownErrorMessage(error)}`;
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

function generateTransactionId() {
  return Array.from({ length: 9 }, () => Math.floor(Math.random() * 10)).join('');
}

function normalizeNicepayBuyerTel(phone: string) {
  return phone.replace(/\D+/g, '');
}

function getNicepayErrorMessage(result: NicepayErrorResult | unknown) {
  if (!result || typeof result !== 'object') {
    return 'NICE Payments 결제창 실행에 실패했습니다.';
  }

  const target = result as NicepayErrorResult;
  const message = target.errorMsg || target.msg || '';
  const code = target.errorCode?.trim() || '';

  if (message && code) {
    return `${message} (${code})`;
  }

  return message || (code ? `NICE Payments 결제창 실행에 실패했습니다. (${code})` : 'NICE Payments 결제창 실행에 실패했습니다.');
}

async function ensureNicepaySdkLoaded() {
  if (typeof window === 'undefined') {
    throw new Error('브라우저 환경에서만 NICE Payments를 실행할 수 있습니다.');
  }

  if (window.AUTHNICE) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const existingScript = document.getElementById(NICEPAY_SDK_SCRIPT_ID) as HTMLScriptElement | null;
    const handleLoad = () => {
      if (!window.AUTHNICE) {
        reject(new Error('NICE Payments SDK를 불러왔지만 초기화에 실패했습니다.'));
        return;
      }
      resolve();
    };
    const handleError = () => {
      reject(new Error('NICE Payments SDK 로딩에 실패했습니다.'));
    };

    if (existingScript) {
      existingScript.addEventListener('load', handleLoad, { once: true });
      existingScript.addEventListener('error', handleError, { once: true });
      if (window.AUTHNICE) {
        resolve();
      }
      return;
    }

    const script = document.createElement('script');
    script.id = NICEPAY_SDK_SCRIPT_ID;
    script.src = 'https://pay.nicepay.co.kr/v1/js/';
    script.async = true;
    script.addEventListener('load', handleLoad, { once: true });
    script.addEventListener('error', handleError, { once: true });
    document.body.appendChild(script);
  });
}

function formatKrw(value: number) {
  return `${Math.round(value).toLocaleString('ko-KR')}원`;
}

export function CartOverlay({ isOpen, onClose }: CartOverlayProps) {
  const { cart, removeFromCart, clearCart } = useFashionCart();
  const { isAuthenticated, user, profile, updateAccountProfile } = useAuth();
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
  const [isStartingNicepay, setIsStartingNicepay] = useState(false);
  const [nicepayError, setNicepayError] = useState<string | null>(null);
  const [paypalSdkReady, setPaypalSdkReady] = useState(false);
  const [paypalError, setPaypalError] = useState<string | null>(null);
  const [paypalRetryNonce, setPaypalRetryNonce] = useState(0);
  const [checkoutMessage, setCheckoutMessage] = useState<string | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const canUseNicepayCheckout = isAuthenticated;
  const shouldShowPaypal = true;

  useEffect(() => {
    if (!isOpen) return;

    setTransactionId(generateTransactionId());
    setMode('cart');
    setNicepayError(null);
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

    let isActive = true;

    const applyAutofill = (targetUser = user) => {
      const metadata =
        targetUser && targetUser.user_metadata && typeof targetUser.user_metadata === 'object'
          ? (targetUser.user_metadata as Record<string, unknown>)
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
      const nextEmail = targetUser?.email?.trim() || '';
      const nextName = profileName || metadataName;

      if (nextEmail) {
        setCheckoutEmail((previous) => (previous.trim() ? previous : nextEmail));
      }

      if (nextName) {
        setCheckoutName((previous) => (previous.trim() ? previous : nextName));
      }

      if (metadataPhone) {
        setCheckoutPhone((previous) => (previous.trim() ? previous : metadataPhone));
      }

      if (metadataAddress) {
        setCheckoutAddress((previous) => (previous.trim() ? previous : metadataAddress));
      }
    };

    const syncLatestAccountFields = async () => {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) {
        applyAutofill();
        return;
      }

      const { data, error } = await supabase.auth.getUser();
      if (!isActive) return;

      if (error || !data.user || data.user.id !== user?.id) {
        applyAutofill();
        return;
      }

      applyAutofill(data.user);
    };

    void syncLatestAccountFields();

    return () => {
      isActive = false;
    };
  }, [isOpen, isAuthenticated, user, profile?.full_name]);

  useEffect(() => {
    if (!isOpen || mode !== 'checkout' || !shouldShowPaypal) return;
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
    )}&currency=${encodeURIComponent(PAYPAL_CURRENCY)}&intent=capture&components=buttons&disable-funding=card`;
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
      void diagnosePaypalSdkLoad(scriptUrl).then((message) => {
        setPaypalError(message);
      });
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
  }, [isOpen, mode, paypalRetryNonce, shouldShowPaypal]);

  const subtotal = cart.reduce((sum, item) => sum + item.price * (item.quantity || 1), 0);
  const canCheckout = cart.length > 0;
  const isInternationalShipping = checkoutCountry !== DOMESTIC_REGION;
  const isNicepayTestOrder =
    canCheckout && cart.every((item) => item.id === NICEPAY_TEST_PRODUCT_ID);
  const shipping = canCheckout
    ? isNicepayTestOrder
      ? 0
      : isInternationalShipping
        ? INTERNATIONAL_SHIPPING_FEE
        : DOMESTIC_SHIPPING_FEE
    : 0;
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
        guestOrderNumber?: string;
      };
      if (!response.ok) {
        throw new Error(payload.message || '주문 접수 중 오류가 발생했습니다.');
      }

      if (channel === 'guest') {
        setCheckoutMessage(
          [
            '비회원 계좌이체 주문이 접수되었습니다.',
            payload.guestOrderNumber
              ? `비회원 조회번호: ${payload.guestOrderNumber}`
              : null,
            `${BANK_NAME} ${BANK_ACCOUNT_NUMBER}`,
            `예금주: ${BANK_ACCOUNT_HOLDER}`,
            '입금자명은 수령인 이름과 동일하게 입력해 주세요.',
            '모바일에서 주문한 핸드폰 번호와 비밀번호로 배송조회할 수 있습니다.',
          ]
            .filter(Boolean)
            .join('\n'),
        );
      } else {
        syncCheckoutDetailsToAccount(normalizedPhone, normalizedAddress);
        setCheckoutMessage(
          [
            '계좌이체 주문이 접수되었습니다.',
            `${BANK_NAME} ${BANK_ACCOUNT_NUMBER}`,
            `예금주: ${BANK_ACCOUNT_HOLDER}`,
            '입금자명은 수령인 이름과 동일하게 입력해 주세요.',
            '입금 확인 후 순차 처리됩니다.',
          ].join('\n'),
        );
      }
      clearCart();
      setMode('cart');
      setCheckoutName('');
      setCheckoutAddress('');
      setCheckoutPhone('');
      setGuestLookupPassword('');
      setTransactionId(generateTransactionId());
    } catch (error) {
      setCheckoutError(error instanceof Error ? error.message : '주문 전송에 실패했습니다.');
    } finally {
      setIsSubmittingOrder(false);
    }
  };

  const buildOrderItemsPayload = useCallback(
    () =>
      cart.map((item) => {
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
    [cart],
  );

  const syncCheckoutDetailsToAccount = useCallback(
    (phone: string, address: string) => {
      if (!isAuthenticated) return;

      void updateAccountProfile(
        {
          phone,
          address,
        },
        { silent: true },
      ).catch((error) => {
        console.error('Checkout account sync failed', error);
      });
    },
    [isAuthenticated, updateAccountProfile],
  );

  const queueCheckoutDetailsSync = useCallback(
    (phone: string, address: string) => {
      if (!isAuthenticated || typeof window === 'undefined') return;

      window.localStorage.setItem(
        PENDING_ACCOUNT_PROFILE_SYNC_STORAGE_KEY,
        JSON.stringify({ phone, address }),
      );
    },
    [isAuthenticated],
  );

  const handleNicepayCheckout = useCallback(async () => {
    const channel: OrderChannel = isAuthenticated ? 'member' : 'guest';
    const normalizedName = checkoutName.trim();
    const normalizedAddress = checkoutAddress.trim();
    const normalizedPhone = checkoutPhone.trim();
    const nicepayBuyerTel = normalizeNicepayBuyerTel(normalizedPhone);
    const normalizedEmail = (channel === 'member' ? user?.email || checkoutEmail : checkoutEmail).trim();
    const normalizedGuestLookupPassword = guestLookupPassword.trim();

    setCheckoutMessage(null);
    setCheckoutError(null);
    setNicepayError(null);

    if (!canUseNicepayCheckout) {
      const message = '로그인 후 카드결제를 사용할 수 있습니다.';
      setCheckoutMessage(message);
      if (typeof window !== 'undefined') {
        window.alert(message);
      }
      return;
    }

    if (!validateCheckoutFields(normalizedEmail)) return;
    queueCheckoutDetailsSync(normalizedPhone, normalizedAddress);

    if (channel === 'guest' && normalizedGuestLookupPassword.length < 4) {
      announceCheckoutError(
        '비회원 주문조회 비밀번호를 4자 이상 입력해 주세요.',
        guestPasswordInputRef.current,
      );
      return;
    }

    setIsStartingNicepay(true);

    try {
      const prepareResponse = await fetch('/api/orders/nicepay/prepare', {
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
          items: buildOrderItemsPayload(),
        }),
      });

      const preparePayload = (await prepareResponse.json()) as {
        message?: string;
        clientKey?: string;
        returnUrl?: string;
        orderId?: string;
        amount?: number;
        goodsName?: string;
        customer?: {
          name?: string;
          email?: string;
          phone?: string;
        };
      };

      if (
        !prepareResponse.ok ||
        !preparePayload.clientKey ||
        !preparePayload.returnUrl ||
        !preparePayload.orderId ||
        typeof preparePayload.amount !== 'number' ||
        !preparePayload.goodsName
      ) {
        throw new Error(preparePayload.message || 'NICE Payments 결제 준비에 실패했습니다.');
      }

      await ensureNicepaySdkLoaded();

      if (!window.AUTHNICE) {
        throw new Error('NICE Payments SDK 초기화에 실패했습니다.');
      }

      window.AUTHNICE.requestPay({
        clientId: preparePayload.clientKey,
        method: 'card',
        orderId: preparePayload.orderId,
        amount: preparePayload.amount,
        goodsName: preparePayload.goodsName,
        returnUrl: preparePayload.returnUrl,
        buyerName: preparePayload.customer?.name || normalizedName,
        buyerTel: normalizeNicepayBuyerTel(preparePayload.customer?.phone || nicepayBuyerTel),
        buyerEmail: preparePayload.customer?.email || normalizedEmail,
        fnError: (result) => {
          setNicepayError(getNicepayErrorMessage(result));
        },
      });
    } catch (error) {
      setNicepayError(
        error instanceof Error ? error.message : 'NICE Payments 결제 준비 중 오류가 발생했습니다.',
      );
    } finally {
      setIsStartingNicepay(false);
    }
  }, [
    announceCheckoutError,
    buildOrderItemsPayload,
    canUseNicepayCheckout,
    checkoutAddress,
    checkoutCountry,
    checkoutEmail,
    checkoutName,
    checkoutPhone,
    guestLookupPassword,
    isAuthenticated,
    shipping,
    queueCheckoutDetailsSync,
    subtotal,
    tax,
    total,
    transactionId,
    user?.email,
    validateCheckoutFields,
  ]);

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
        height: 52,
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
              items: buildOrderItemsPayload(),
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
            syncCheckoutDetailsToAccount(normalizedPhone, normalizedAddress);
            setCheckoutMessage('PayPal 결제가 완료되었습니다. 주문이 접수되었습니다.');
          }
          clearCart();
          setMode('cart');
          setCheckoutName('');
          setCheckoutAddress('');
          setCheckoutPhone('');
          setGuestLookupPassword('');
          setTransactionId(generateTransactionId());
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
    buildOrderItemsPayload,
    announceCheckoutError,
    syncCheckoutDetailsToAccount,
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
            className="fixed left-3 right-3 top-[calc(env(safe-area-inset-top)+18px)] bottom-[calc(env(safe-area-inset-bottom)+14px)] z-[90] flex h-auto flex-col overflow-hidden rounded-[18px] border border-[#d1d5db] bg-white font-mono text-[#111827] shadow-2xl md:left-auto md:right-0 md:top-0 md:bottom-0 md:w-[580px] md:rounded-none md:border-l md:border-t-0 md:border-r-0 md:border-b-0 md:shadow-none"
          >
            <div className="border-b border-[#d1d5db] bg-[#f8f9fa] px-5 pb-5 pt-5 md:px-7 md:pb-6 md:pt-7">
              <div className="flex items-start justify-between gap-3">
                <div className="max-w-[25rem]">
                  <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-[#b8001f]">
                    Secure Checkout
                  </p>
                  <h2 className="mt-3 text-[1.85rem] font-heading font-black uppercase tracking-[0.01em] leading-[1.08] text-[#111827] md:text-[2.45rem]">
                    {mode === 'checkout' ? '결제' : '장바구니'}
                  </h2>
                </div>
                <button
                  onClick={onClose}
                  className="rounded-full border border-[#d1d5db] bg-white p-2.5 text-[#111827] transition-colors hover:border-[#b8001f] hover:bg-[#b8001f] hover:text-white shadow-sm"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            <div
              ref={checkoutScrollRef}
              className="checkout-scroll-area flex-1 min-h-0 space-y-4 overflow-y-auto px-4 py-4 pr-2 pb-28 md:space-y-5 md:px-7 md:py-6 md:pr-4 md:pb-8"
            >
              <div className="sticky top-0 z-10 rounded-[16px] border border-[#d1d5db] bg-white/95 px-4 py-3 shadow-sm backdrop-blur-xl md:py-4">
                <div className="flex items-end justify-between gap-4">
                  <div>
                    <p className="text-lg font-bold text-[#111827]">{itemCount}개 상품</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#b8001f]">Total</p>
                    <p className="mt-2 text-xl font-black tracking-[-0.03em] text-[#111827]">{formatKrw(total)}</p>
                  </div>
                </div>

                <div className="mt-3 space-y-2 rounded-[12px] border border-[#e5e7eb] bg-[#f8f9fa] px-4 py-2.5 md:py-3">
                  {canCheckout ? (
                    cart.map((item) => {
                      const quantity = item.quantity || 1;
                      return (
                        <div
                          key={`summary-${item.id}-${item.selectedSize ?? 'na'}`}
                          className="text-[11px]"
                        >
                          <p className="line-clamp-2 leading-snug text-[#374151] font-medium">
                            {item.name}
                            {quantity > 1 ? ` x${quantity}` : ''}
                          </p>
                        </div>
                      );
                    })
                  ) : (
                    <p className="text-[11px] text-[#6b7280] font-medium">주문할 상품이 없습니다.</p>
                  )}
                </div>
              </div>

              {(checkoutMessage || checkoutError) && (
                <div
                  className={`rounded-[20px] border px-4 py-3 text-sm leading-relaxed font-semibold whitespace-pre-line ${
                    checkoutError
                      ? 'border-red-500 bg-red-50 text-red-800'
                      : 'border-[#b8001f]/40 bg-[#fff1f2] text-[#8f0018]'
                  }`}
                >
                  {checkoutError || checkoutMessage}
                </div>
              )}

              {mode === 'cart' ? (
                <>
                  {!canCheckout ? (
                    <div className="border border-dashed border-[#d1d5db] bg-[#f8f9fa] p-8 text-center rounded-2xl">
                      <p className="font-heading text-2xl uppercase mb-2 text-[#111827] font-black">비어 있음</p>
                      <p className="text-xs text-[#6b7280] font-medium">선택된 항목이 없습니다. 의류 섹션에서 담아주세요.</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {cart.map((item) => (
                        <div key={`${item.id}-${item.selectedSize ?? 'na'}`} className="border border-[#d1d5db] bg-[#f8f9fa] p-4 rounded-2xl shadow-sm">
                          <div className="flex gap-4">
                            <div className="w-20 aspect-[4/5] bg-white border border-[#d1d5db] rounded-lg shrink-0 relative overflow-hidden">
                              <Image
                                src={item.image}
                                alt=""
                                fill
                                unoptimized={shouldBypassImageOptimization(item.image)}
                                sizes="80px"
                                className="object-contain bg-white"
                              />
                              <div className="absolute inset-0 bg-[#b8001f] mix-blend-color opacity-0 hover:opacity-15 transition-opacity" />
                            </div>

                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <h3 className="line-clamp-2 break-words text-sm font-black uppercase leading-snug text-[#111827]">
                                    {item.name}
                                  </h3>
                                  <p className="text-[10px] text-[#4b5563] font-semibold mt-2 uppercase">
                                    {[item.category || '항목', item.id, item.selectedSize ? `사이즈 ${item.selectedSize}` : null]
                                      .filter(Boolean)
                                      .join(' | ')}
                                  </p>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => removeFromCart(item.id, item.selectedSize)}
                                  className="p-2 border border-[#d1d5db] bg-white text-[#6b7280] hover:text-[#b8001f] hover:border-[#b8001f] transition-colors shrink-0 rounded-lg shadow-sm"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>

                              <div className="mt-4 flex items-center justify-between gap-3">
                                <div className="flex items-center bg-white border border-[#d1d5db] rounded-md px-3 py-2 shadow-sm">
                                  <span className="text-[10px] font-bold uppercase tracking-widest text-[#b8001f]">
                                    수량 1 (재고 1개)
                                  </span>
                                </div>
                                <div className="text-right">
                                  <p className="text-[10px] font-bold text-[#6b7280] uppercase">단가</p>
                                  <p className="text-sm font-black text-[#111827]">{formatKrw(item.price)}</p>
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
                <div className="space-y-4 md:space-y-6">
                  <div className={CHECKOUT_SECTION_CLASS}>
                    <div className="mb-4 flex items-center justify-between gap-3 border-b border-[#d1d5db] pb-3">
                      <h3 className="text-lg font-bold tracking-[-0.03em] text-[#111827] md:text-xl">주문자 정보</h3>
                      <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#b8001f]">Customer</p>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className={`${CHECKOUT_FIELD_GROUP_CLASS} col-span-2`}>
                        <div className={CHECKOUT_FIELD_HEADER_CLASS}>
                          <label className="block text-[13px] font-semibold tracking-[0.01em] text-[#e8edf6]">
                            이메일
                          </label>
                        </div>
                        <div className={CHECKOUT_FIELD_BODY_CLASS}>
                          <input
                            ref={checkoutEmailInputRef}
                            type="email"
                            value={checkoutEmail}
                            onChange={(e) => setCheckoutEmail(e.target.value)}
                            placeholder="example@email.com"
                            className={CHECKOUT_FIELD_CLASS}
                          />
                        </div>
                      </div>
                      <div className={CHECKOUT_FIELD_GROUP_CLASS}>
                        <div className={CHECKOUT_FIELD_HEADER_CLASS}>
                          <label className="block text-[13px] font-semibold tracking-[0.01em] text-[#e8edf6]">
                            핸드폰 번호
                          </label>
                        </div>
                        <div className={CHECKOUT_FIELD_BODY_CLASS}>
                          <input
                            ref={checkoutPhoneInputRef}
                            type="tel"
                            value={checkoutPhone}
                            onChange={(e) => setCheckoutPhone(e.target.value)}
                            placeholder="010-0000-0000"
                            className={CHECKOUT_FIELD_CLASS}
                          />
                        </div>
                      </div>
                      <div className={CHECKOUT_FIELD_GROUP_CLASS}>
                        <div className={CHECKOUT_FIELD_HEADER_CLASS}>
                          <label className="block text-[13px] font-semibold tracking-[0.01em] text-[#e8edf6]">
                            수령인 이름
                          </label>
                        </div>
                        <div className={CHECKOUT_FIELD_BODY_CLASS}>
                          <input
                            ref={checkoutNameInputRef}
                            type="text"
                            value={checkoutName}
                            onChange={(e) => setCheckoutName(e.target.value)}
                            placeholder="수령인 이름 입력"
                            className={CHECKOUT_FIELD_CLASS}
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className={CHECKOUT_SECTION_CLASS}>
                    <div className="mb-4 flex items-center justify-between gap-3 border-b border-[#d1d5db] pb-3">
                      <h3 className="text-lg font-bold tracking-[-0.03em] text-[#111827] md:text-xl">배송 정보</h3>
                      <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#b8001f]">Shipping</p>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className={CHECKOUT_FIELD_GROUP_CLASS}>
                        <div className={CHECKOUT_FIELD_HEADER_CLASS}>
                          <label className="block text-[13px] font-bold tracking-[0.01em] text-[#111827]">
                            구역 (국가)
                          </label>
                          <p className="mt-2 text-[11px] font-medium leading-relaxed text-[#4b5563]">
                            {isNicepayTestOrder
                              ? 'NICE 1000원 테스트 상품은 배송비 없이 결제됩니다.'
                              : '대한민국 배송비 3,000원 / 해외 배송비 40,000원'}
                          </p>
                        </div>
                        <div className={CHECKOUT_FIELD_BODY_CLASS}>
                          <select
                            ref={checkoutRegionSelectRef}
                            value={checkoutCountry}
                            onChange={(e) => setCheckoutCountry(e.target.value)}
                            className={CHECKOUT_FIELD_CLASS}
                          >
                            {CHECKOUT_REGIONS.map((region) => (
                              <option key={region} value={region}>
                                {region}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <div className={`${CHECKOUT_FIELD_GROUP_CLASS} flex flex-col justify-between gap-3`}>
                        <div className={CHECKOUT_FIELD_HEADER_CLASS}>
                          <p className="block text-[13px] font-bold tracking-[0.01em] text-[#111827]">
                            배송비
                          </p>
                          <p className="mt-2 text-[11px] font-medium leading-relaxed text-[#4b5563]">
                            선택한 구역 기준
                          </p>
                        </div>
                        <p className="text-lg font-black tracking-[-0.03em] text-[#b8001f]">
                          {formatKrw(shipping)}
                        </p>
                      </div>
                      <div className={`${CHECKOUT_FIELD_GROUP_CLASS} col-span-2`}>
                        <div className={CHECKOUT_FIELD_HEADER_CLASS}>
                          <label className="block text-[13px] font-bold tracking-[0.01em] text-[#111827]">
                            상세 주소
                          </label>
                          <p className="mt-2 text-[11px] font-medium leading-relaxed text-[#4b5563]">
                            수령지 주소를 상세하게 입력하세요. 도로명, 건물명, 호수까지 적어야 합니다.
                          </p>
                        </div>
                        <div className={CHECKOUT_FIELD_BODY_CLASS}>
                          <textarea
                            ref={checkoutAddressInputRef}
                            value={checkoutAddress}
                            onChange={(e) => setCheckoutAddress(e.target.value)}
                            rows={3}
                            placeholder="수령지 / 도로명 / 건물명 / 도시 / 우편번호"
                            className={`${CHECKOUT_FIELD_CLASS} resize-none`}
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                </div>
              )}
            </div>

            {canCheckout && (
              <div className="relative z-20 border-t border-[#d1d5db] bg-white px-4 py-3 md:px-7 md:py-5 shadow-lg">
                <div className="mb-3 rounded-[14px] border border-[#e5e7eb] bg-[#f8f9fa] px-3 py-3 md:px-4 md:py-4 shadow-sm">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#b8001f]">Payment Summary</p>
                      <p className="mt-1 text-base font-bold tracking-[0.01em] leading-[1.15] text-[#111827] md:text-lg">
                        결제 예정 금액
                      </p>
                    </div>
                    <p className="text-right text-[1.35rem] font-black tracking-[0.01em] leading-[1.1] text-[#b8001f] md:text-[1.55rem]">
                      {formatKrw(total)}
                    </p>
                  </div>
                  <div className="mt-2 hidden grid-cols-2 gap-2 md:grid">
                    <div className="rounded-[10px] border border-[#d1d5db] bg-white px-3 py-2 text-xs text-[#4b5563] shadow-sm">
                      <p className="font-semibold">상품 금액</p>
                      <p className="mt-1 text-sm font-black text-[#111827]">{formatKrw(subtotal)}</p>
                    </div>
                    <div className="rounded-[10px] border border-[#d1d5db] bg-white px-3 py-2 text-xs text-[#4b5563] shadow-sm">
                      <p className="font-semibold">배송비</p>
                      <p className="mt-1 text-sm font-black text-[#111827]">{formatKrw(shipping)}</p>
                    </div>
                  </div>
                </div>
                {mode === 'cart' ? (
                  <button
                    type="button"
                    onClick={() => setMode('checkout')}
                    className="w-full rounded-[12px] bg-[#b8001f] px-4 py-3 text-center font-heading text-base font-black uppercase tracking-[0.08em] leading-[1.1] text-white transition-all hover:bg-[#9a0019] md:text-lg shadow-md"
                  >
                    결제로 이동
                  </button>
                ) : (
                  <div className="space-y-2.5 md:space-y-3">
                    {!isAuthenticated && (
                      <div className="rounded-[14px] border border-[#e5e7eb] bg-[#f8f9fa] px-3 py-3 shadow-sm">
                        <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.2em] text-[#b8001f]">
                          비회원 주문조회 비밀번호
                        </label>
                        <input
                          ref={guestPasswordInputRef}
                          type="password"
                          value={guestLookupPassword}
                          onChange={(e) => setGuestLookupPassword(e.target.value)}
                          placeholder="4자 이상 입력"
                          className={CHECKOUT_FIELD_CLASS}
                        />
                        <p className="mt-2 text-xs font-medium leading-relaxed text-[#4b5563]">
                          비회원 구매 후 주문번호와 이 비밀번호로 배송조회합니다.
                        </p>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-2 md:grid-cols-1 md:gap-3">
                      <button
                        type="button"
                        onClick={() => void submitBankTransferOrder('member')}
                        disabled={isSubmittingOrder}
                        className={`group relative min-h-[48px] overflow-hidden rounded-[12px] px-3 py-2 text-left transition-all duration-200 ${
                          isAuthenticated
                            ? 'border border-[#b8001f] bg-[#fff1f2] text-[#8f0018] shadow-sm hover:brightness-105'
                            : 'border border-[#d1d5db] bg-[#111827] text-white hover:bg-[#b8001f] hover:border-[#b8001f]'
                        } disabled:opacity-50`}
                      >
                        <span className="relative z-10 flex min-h-[28px] items-center justify-between gap-3">
                          <span
                            className={`text-[0.9rem] font-bold tracking-[-0.02em] leading-snug ${
                              isAuthenticated ? 'text-[#8f0018]' : 'text-white'
                            }`}
                          >
                            {isSubmittingOrder ? '처리중...' : '계좌이체 구매'}
                          </span>
                          <span className={`text-sm font-black ${
                            isAuthenticated ? 'text-[#8f0018]' : 'text-white'
                          }`}>
                            →
                          </span>
                        </span>
                      </button>
                      <div className="rounded-[14px] border border-[#e5e7eb] bg-[#f8f9fa] px-1.5 py-1.5 md:px-2.5 md:py-2.5 shadow-sm">
                        {nicepayError && (
                          <p className="mb-3 rounded-[16px] border border-red-500 bg-red-50 px-3 py-2 text-xs font-semibold text-red-800">{nicepayError}</p>
                        )}
                        <button
                          type="button"
                          onClick={() => void handleNicepayCheckout()}
                          disabled={isSubmittingOrder || isStartingNicepay}
                          className="group w-full min-h-[48px] overflow-hidden rounded-[12px] border border-[#b8001f] bg-[#b8001f] px-3 py-2 text-left text-white shadow-md transition-all duration-200 hover:bg-[#9a0019] disabled:opacity-50"
                        >
                          <span className="flex min-h-[28px] items-center justify-between gap-3">
                            <span className="text-[0.9rem] font-bold tracking-[-0.02em] leading-snug text-white">
                              {isStartingNicepay ? (
                                <>
                                  <span className="md:hidden">카드 준비중...</span>
                                  <span className="hidden md:inline">카드결제 준비중... (나이스페이먼츠)</span>
                                </>
                              ) : (
                                <>
                                  <span className="md:hidden">카드결제</span>
                                  <span className="hidden md:inline">카드결제 (나이스페이먼츠)</span>
                                </>
                              )}
                            </span>
                            <span className="shrink-0 text-base font-black text-white transition-transform duration-200 group-hover:translate-x-1">
                              →
                            </span>
                          </span>
                        </button>
                      </div>
                    </div>
                    {shouldShowPaypal ? (
                      <div className="rounded-[14px] border border-[#e5e7eb] bg-[#f8f9fa] px-2.5 py-2.5 shadow-sm">
                        {paypalError && (
                          <p className="mb-3 rounded-[16px] border border-red-500 bg-red-50 px-3 py-2 text-xs font-semibold text-red-800">{paypalError}</p>
                        )}
                        <div>
                          <div
                            ref={paypalContainerRef}
                            className="min-h-[46px]"
                            aria-label="paypal-sandbox-button"
                          />
                        </div>
                        {paypalError && (
                          <button
                            type="button"
                            onClick={() => {
                              setPaypalError(null);
                              setPaypalSdkReady(false);
                              setPaypalRetryNonce((value) => value + 1);
                            }}
                            className="mt-2.5 w-full rounded-[14px] border border-[#d1d5db] bg-white px-3 py-2 text-[10px] font-bold uppercase tracking-[0.16em] text-[#4b5563] transition-colors hover:border-[#b8001f] hover:text-[#b8001f]"
                          >
                            PayPal 다시 시도
                          </button>
                        )}
                      </div>
                    ) : null}
                    {!isAuthenticated ? (
                      <button
                        type="button"
                        onClick={() => void submitBankTransferOrder('guest')}
                        disabled={isSubmittingOrder}
                        className="group relative min-h-[48px] overflow-hidden rounded-[12px] border border-[#d1d5db] bg-[#111827] px-3 py-2 text-left text-white shadow-md transition-colors hover:border-[#b8001f] hover:bg-[#b8001f] disabled:opacity-50"
                      >
                        <span className="flex min-h-[28px] items-center justify-between gap-3">
                          <span className="text-[0.9rem] font-bold tracking-[-0.02em] leading-snug text-white">
                            {isSubmittingOrder ? '처리중...' : '비회원 구매'}
                          </span>
                          <span className="text-sm font-black text-white">→</span>
                        </span>
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => setMode('cart')}
                      className="w-full rounded-[12px] border border-[#d1d5db] bg-white py-2 text-[13px] font-bold text-[#4b5563] transition-colors hover:border-[#b8001f] hover:text-[#b8001f] shadow-sm"
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
