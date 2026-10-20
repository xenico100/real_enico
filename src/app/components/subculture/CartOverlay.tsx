'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { X, Trash2 } from 'lucide-react';
import { useFashionCart } from '@/app/context/FashionCartContext';
import { useAuth } from '@/app/context/AuthContext';
import { shouldBypassImageOptimization } from '@/lib/images';
import { NICEPAY_TEST_PRODUCT_ID } from '@/lib/storefront/productCatalog';
import {
  getPayPalOrderAmount,
  normalizeKrwPerUsd,
  normalizePayPalCurrency,
} from '@/lib/orders/paypalPricing';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { BankTransferInstructions, CustomerOrderNotifications, type BankAccountDetails, type OrderNotificationSummary } from './BankTransferInstructions';
import { BANK_RECEIPT_STORAGE_KEY, readBankOrderReceipt, type BankOrderReceipt } from '@/lib/orders/bankReceipt';
import { trackStorefrontEvent } from '@/app/components/system/VisitTracker';
import { motion, AnimatePresence } from 'motion/react';

interface CartOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenMyPageOrders?: () => void;
}

type CheckoutMode = 'cart' | 'checkout' | 'confirmation';
type OrderChannel = 'member' | 'guest';

type PendingPayPalApproval = {
  orderId: string;
  transactionId: string;
  channel: OrderChannel;
  requestJson: string;
  totalKrw: number;
  customerPhone: string;
  customerAddress: string;
};

const NICEPAY_SDK_SCRIPT_ID = 'nicepay-sdk-script';
const PAYPAL_SDK_SCRIPT_ID = 'paypal-sdk-script';
const PAYPAL_CLIENT_ID = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID || '';
const PAYPAL_CURRENCY = normalizePayPalCurrency(process.env.NEXT_PUBLIC_PAYPAL_CURRENCY);
const PAYPAL_KRW_PER_USD = normalizeKrwPerUsd(process.env.NEXT_PUBLIC_PAYPAL_KRW_PER_USD);
const DOMESTIC_REGION = '대한민국';
const DOMESTIC_SHIPPING_FEE = 3000;
const INTERNATIONAL_SHIPPING_FEE = 40000;
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

const SDK_LOAD_TIMEOUT_MS = 15_000;
let nicepaySdkPromise: Promise<void> | null = null;
let paypalSdkPromise: Promise<void> | null = null;
let paypalSdkPromiseUrl = '';
// Keep an approved order available if closing the cart unmounts this component.
// This is intentionally memory-only; checkout passwords are never put in storage.
let pendingPayPalApprovalInMemory: PendingPayPalApproval | null = null;

function loadExternalSdk(options: {
  scriptId: string;
  scriptUrl: string;
  isReady: () => boolean;
  loadErrorMessage: string;
  initializeErrorMessage: string;
}) {
  return new Promise<void>((resolve, reject) => {
    if (options.isReady()) {
      resolve();
      return;
    }

    let script = document.getElementById(options.scriptId) as HTMLScriptElement | null;
    if (script && script.src !== options.scriptUrl) {
      script.remove();
      script = null;
    }

    let settled = false;
    const cleanup = () => {
      window.clearTimeout(timeoutId);
      script?.removeEventListener('load', handleLoad);
      script?.removeEventListener('error', handleError);
    };
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (error) {
        if (!options.isReady()) script?.remove();
        reject(error);
      } else {
        resolve();
      }
    };
    const handleLoad = () => {
      finish(
        options.isReady()
          ? undefined
          : new Error(options.initializeErrorMessage),
      );
    };
    const handleError = () => finish(new Error(options.loadErrorMessage));
    const timeoutId = window.setTimeout(
      () => finish(new Error(`${options.loadErrorMessage} 잠시 후 다시 시도해 주세요.`)),
      SDK_LOAD_TIMEOUT_MS,
    );

    if (!script) {
      script = document.createElement('script');
      script.id = options.scriptId;
      script.src = options.scriptUrl;
      script.async = true;
      document.body.appendChild(script);
    }

    script.addEventListener('load', handleLoad, { once: true });
    script.addEventListener('error', handleError, { once: true });
    if (options.isReady()) finish();
  });
}

async function ensureNicepaySdkLoaded() {
  if (typeof window === 'undefined') {
    throw new Error('브라우저 환경에서만 NICE Payments를 실행할 수 있습니다.');
  }
  if (window.AUTHNICE) return;

  if (!nicepaySdkPromise) {
    nicepaySdkPromise = loadExternalSdk({
      scriptId: NICEPAY_SDK_SCRIPT_ID,
      scriptUrl: 'https://pay.nicepay.co.kr/v1/js/',
      isReady: () => Boolean(window.AUTHNICE),
      loadErrorMessage: 'NICE Payments SDK 로딩에 실패했습니다.',
      initializeErrorMessage: 'NICE Payments SDK를 불러왔지만 초기화에 실패했습니다.',
    }).catch((error) => {
      nicepaySdkPromise = null;
      throw error;
    });
  }

  await nicepaySdkPromise;
}

async function ensurePaypalSdkLoaded(scriptUrl: string) {
  if (typeof window === 'undefined') {
    throw new Error('브라우저 환경에서만 PayPal을 실행할 수 있습니다.');
  }
  if (window.paypal) return;

  if (!paypalSdkPromise || paypalSdkPromiseUrl !== scriptUrl) {
    paypalSdkPromiseUrl = scriptUrl;
    paypalSdkPromise = loadExternalSdk({
      scriptId: PAYPAL_SDK_SCRIPT_ID,
      scriptUrl,
      isReady: () => Boolean(window.paypal),
      loadErrorMessage: 'PayPal SDK 로딩에 실패했습니다.',
      initializeErrorMessage: 'PayPal SDK를 불러왔지만 버튼 초기화에 실패했습니다.',
    }).catch((error) => {
      paypalSdkPromise = null;
      throw error;
    });
  }

  await paypalSdkPromise;
}

function formatKrw(value: number) {
  return `${Math.round(value).toLocaleString('ko-KR')}원`;
}

export function CartOverlay({ isOpen, onClose, onOpenMyPageOrders }: CartOverlayProps) {
  const { cart, removeFromCart, clearCart } = useFashionCart();
  const { session, isAuthenticated, user, profile, updateAccountProfile } = useAuth();
  const checkoutScrollRef = useRef<HTMLDivElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const paypalContainerRef = useRef<HTMLDivElement | null>(null);
  const paypalButtonsInstanceRef = useRef<PayPalButtonsInstance | null>(null);
  const pendingPayPalApprovalRef = useRef<PendingPayPalApproval | null>(pendingPayPalApprovalInMemory);
  const paypalSubmissionInFlightRef = useRef(false);
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
  const [pendingPayPalApproval, setPendingPayPalApproval] = useState<PendingPayPalApproval | null>(pendingPayPalApprovalInMemory);
  const [checkoutMessage, setCheckoutMessage] = useState<string | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [bankOrderReceipt, setBankOrderReceipt] = useState<BankOrderReceipt | null>(null);
  const [isRestoredBankReceipt, setIsRestoredBankReceipt] = useState(false);
  const canUseNicepayCheckout = isAuthenticated;
  const shouldShowPaypal = true;

  useEffect(() => {
    if (!isOpen) return;
    if (pendingPayPalApprovalRef.current) {
      setMode('checkout');
      return;
    }

    let savedReceipt: BankOrderReceipt | null = null;
    try {
      savedReceipt = readBankOrderReceipt(window.sessionStorage.getItem(BANK_RECEIPT_STORAGE_KEY));
      if (!savedReceipt) window.sessionStorage.removeItem(BANK_RECEIPT_STORAGE_KEY);
    } catch { /* Confirmation remains available in memory if browser storage is blocked. */ }
    setBankOrderReceipt(savedReceipt);
    setIsRestoredBankReceipt(Boolean(savedReceipt));
    setTransactionId(generateTransactionId());
    setMode(savedReceipt && cart.length === 0 ? 'confirmation' : 'cart');
    setNicepayError(null);
    setCheckoutMessage(null);
    setCheckoutError(null);
    setGuestLookupPassword('');
  // Restore only when opening; cart mutations during submission must not reset the receipt.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    closeButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      previousFocusRef.current?.focus();
    };
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

    const scriptUrl = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(
      PAYPAL_CLIENT_ID,
    )}&currency=${encodeURIComponent(PAYPAL_CURRENCY)}&intent=capture&components=buttons&disable-funding=card`;
    let active = true;
    setPaypalSdkReady(false);

    void ensurePaypalSdkLoaded(scriptUrl)
      .then(() => {
        if (!active) return;
        setPaypalSdkReady(true);
        setPaypalError(null);
      })
      .catch((error) => {
        if (!active) return;
        setPaypalSdkReady(false);
        setPaypalError(error instanceof Error ? error.message : 'PayPal SDK 로딩에 실패했습니다.');
        void diagnosePaypalSdkLoad(scriptUrl).then((message) => {
          if (active) setPaypalError(message);
        });
      });

    return () => {
      active = false;
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
  const paypalOrderAmount = getPayPalOrderAmount(
    total,
    PAYPAL_CURRENCY,
    PAYPAL_KRW_PER_USD,
  );

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

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      announceCheckoutError('안내를 받을 수 있는 이메일 주소를 확인해 주세요.', checkoutEmailInputRef.current);
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
    if (pendingPayPalApprovalRef.current) {
      setCheckoutError('확인 중인 PayPal 결제가 있습니다. 새 결제를 시작하지 말고 PayPal 주문을 다시 확인해 주세요.');
      return;
    }
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
    trackStorefrontEvent({
      type: 'order_submit',
      target: `bank_transfer:${channel}`,
      detail: `items:${cart.length},total:${total}`,
    });
    try {
      const response = await fetch('/api/orders/bank-transfer', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(channel === 'member' && session?.access_token
            ? { Authorization: `Bearer ${session.access_token}` }
            : {}),
        },
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
        orderCode?: string;
        guestOrderNumber?: string;
        bankAccount: BankAccountDetails;
        pricing: { total: number };
        items: BankOrderReceipt['items'];
        notifications?: OrderNotificationSummary;
      };
      if (!response.ok) {
        throw new Error(payload.message || '주문 접수 중 오류가 발생했습니다.');
      }

      const receipt = readBankOrderReceipt(JSON.stringify({
        orderCode: payload.orderCode || '',
        guestOrderNumber: payload.guestOrderNumber || '',
        channel,
        bankAccount: payload.bankAccount,
        total: payload.pricing?.total,
        items: payload.items,
        notifications: payload.notifications,
        savedAt: Date.now(),
      }));
      if (channel === 'member') {
        syncCheckoutDetailsToAccount(normalizedPhone, normalizedAddress);
      }
      setBankOrderReceipt(receipt);
      setIsRestoredBankReceipt(false);
      try {
        if (receipt) window.sessionStorage.setItem(BANK_RECEIPT_STORAGE_KEY, JSON.stringify(receipt));
        else window.sessionStorage.removeItem(BANK_RECEIPT_STORAGE_KEY);
      } catch { /* The confirmation is still shown when browser storage is unavailable. */ }
      if (!receipt) setCheckoutMessage('주문은 접수되었습니다. 주문조회에서 입금 계좌와 주문 상태를 확인해 주세요. 다시 주문하지 마세요.');
      clearCart();
      setMode('confirmation');
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

  const handleNicepayCheckout = useCallback(async () => {
    if (pendingPayPalApprovalRef.current) {
      setCheckoutError('확인 중인 PayPal 결제가 있습니다. 새 결제를 시작하지 말고 PayPal 주문을 다시 확인해 주세요.');
      return;
    }
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
    syncCheckoutDetailsToAccount(normalizedPhone, normalizedAddress);

    if (channel === 'guest' && normalizedGuestLookupPassword.length < 4) {
      announceCheckoutError(
        '비회원 주문조회 비밀번호를 4자 이상 입력해 주세요.',
        guestPasswordInputRef.current,
      );
      return;
    }

    setIsStartingNicepay(true);
    trackStorefrontEvent({
      type: 'order_submit',
      target: `nicepay:${channel}`,
      detail: `items:${cart.length},total:${total}`,
    });

    try {
      const prepareResponse = await fetch('/api/orders/nicepay/prepare', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(channel === 'member' && session?.access_token
            ? { Authorization: `Bearer ${session.access_token}` }
            : {}),
        },
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
    session?.access_token,
    shipping,
    syncCheckoutDetailsToAccount,
    subtotal,
    tax,
    total,
    transactionId,
    user?.email,
    validateCheckoutFields,
  ]);

  const latestCheckoutRef = useRef({
    canCheckout,
    validateCheckoutFields,
    isAuthenticated,
    guestLookupPassword,
    announceCheckoutError,
    paypalOrderAmount,
    transactionId,
    checkoutName,
    checkoutAddress,
    checkoutPhone,
    checkoutEmail,
    checkoutCountry,
    userEmail: user?.email || '',
    accessToken: session?.access_token || '',
    subtotal,
    shipping,
    tax,
    total,
    buildOrderItemsPayload,
    syncCheckoutDetailsToAccount,
    clearCart,
  });
  latestCheckoutRef.current = {
    canCheckout,
    validateCheckoutFields,
    isAuthenticated,
    guestLookupPassword,
    announceCheckoutError,
    paypalOrderAmount,
    transactionId,
    checkoutName,
    checkoutAddress,
    checkoutPhone,
    checkoutEmail,
    checkoutCountry,
    userEmail: user?.email || '',
    accessToken: session?.access_token || '',
    subtotal,
    shipping,
    tax,
    total,
    buildOrderItemsPayload,
    syncCheckoutDetailsToAccount,
    clearCart,
  };

  const submitApprovedPayPal = useCallback(async (approval: PendingPayPalApproval) => {
    if (paypalSubmissionInFlightRef.current) return;
    paypalSubmissionInFlightRef.current = true;
    setCheckoutError(null);
    setCheckoutMessage(null);
    setIsSubmittingOrder(true);

    try {
      const accessToken = latestCheckoutRef.current.accessToken;
      const response = await fetch('/api/orders/paypal', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(approval.channel === 'member' && accessToken
            ? { Authorization: `Bearer ${accessToken}` }
            : {}),
        },
        body: approval.requestJson,
      });
      const payload = (await response.json()) as { message?: string };
      if (!response.ok) {
        throw new Error(payload.message || 'PayPal 주문 후처리에 실패했습니다.');
      }

      pendingPayPalApprovalRef.current = null;
      pendingPayPalApprovalInMemory = null;
      setPendingPayPalApproval(null);
      if (approval.channel === 'guest') {
        setCheckoutMessage(
          'PayPal 결제가 완료되었습니다. 모바일에서 주문한 핸드폰 번호와 주문 비밀번호로 배송조회할 수 있습니다.',
        );
      } else {
        syncCheckoutDetailsToAccount(approval.customerPhone, approval.customerAddress);
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
      const message = error instanceof Error ? error.message : 'PayPal 결제 처리 중 오류가 발생했습니다.';
      setCheckoutError(`${message} 결제 상태가 불확실할 수 있으니 새 결제를 시작하지 말고 같은 PayPal 주문을 다시 확인해 주세요.`);
    } finally {
      paypalSubmissionInFlightRef.current = false;
      setIsSubmittingOrder(false);
    }
  }, [clearCart, syncCheckoutDetailsToAccount]);

  useEffect(() => {
    if (!isOpen || mode !== 'checkout') return;
    if (!paypalSdkReady || !window.paypal || !paypalContainerRef.current) return;
    if (!latestCheckoutRef.current.canCheckout) return;

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
        if (pendingPayPalApprovalRef.current) {
          setCheckoutError('확인 중인 PayPal 결제가 있습니다. 아래 버튼으로 같은 PayPal 주문을 다시 확인해 주세요.');
          await actions.reject();
          return;
        }
        const latest = latestCheckoutRef.current;

        if (!latest.validateCheckoutFields()) {
          await actions.reject();
          return;
        }

        if (!latest.isAuthenticated && latest.guestLookupPassword.trim().length < 4) {
          latest.announceCheckoutError(
            '비회원 주문조회 비밀번호를 4자 이상 입력해 주세요.',
            guestPasswordInputRef.current,
          );
          await actions.reject();
          return;
        }

        await actions.resolve();
      },
      createOrder: async (_data, actions) => {
        if (pendingPayPalApprovalRef.current) {
          throw new Error('이전 PayPal 결제 상태를 먼저 확인해 주세요.');
        }
        const latest = latestCheckoutRef.current;
        return actions.order.create({
          purchase_units: [
            {
              amount: {
                currency_code: PAYPAL_CURRENCY,
                value: latest.paypalOrderAmount,
              },
              description: `ENICO VECK ORDER ${latest.transactionId}`,
            },
          ],
        });
      },
      onApprove: async (data) => {
        const pending = pendingPayPalApprovalRef.current;
        if (pending) {
          if (pending.orderId !== data.orderID) {
            setCheckoutError('이미 확인 중인 PayPal 주문이 있습니다. 새 결제를 시작하지 말고 아래 재확인 버튼을 눌러 주세요.');
            return;
          }
          await submitApprovedPayPal(pending);
          return;
        }

        const latest = latestCheckoutRef.current;
        const normalizedName = latest.checkoutName.trim();
        const normalizedAddress = latest.checkoutAddress.trim();
        const normalizedPhone = latest.checkoutPhone.trim();
        const normalizedEmail = latest.checkoutEmail.trim() || latest.userEmail;
        const channel: OrderChannel = latest.isAuthenticated ? 'member' : 'guest';
        const normalizedGuestLookupPassword = latest.guestLookupPassword.trim();
        const approval: PendingPayPalApproval = {
          orderId: data.orderID,
          transactionId: latest.transactionId,
          channel,
          totalKrw: latest.total,
          customerPhone: normalizedPhone,
          customerAddress: normalizedAddress,
          requestJson: JSON.stringify({
            transactionId: latest.transactionId,
            channel,
            customer: {
              name: normalizedName,
              email: normalizedEmail,
              phone: normalizedPhone,
              country: latest.checkoutCountry,
              address: normalizedAddress,
            },
            pricing: {
              subtotal: latest.subtotal,
              shipping: latest.shipping,
              tax: latest.tax,
              total: latest.total,
              currency: 'KRW',
            },
            guestLookupPassword: channel === 'guest' ? normalizedGuestLookupPassword : undefined,
            paypal: { orderId: data.orderID },
            items: latest.buildOrderItemsPayload(),
          }),
        };
        pendingPayPalApprovalRef.current = approval;
        pendingPayPalApprovalInMemory = approval;
        setPendingPayPalApproval(approval);
        await submitApprovedPayPal(approval);
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
  }, [isOpen, mode, paypalSdkReady, submitApprovedPayPal]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            aria-hidden="true"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/85 backdrop-blur-md z-[80]"
            onClick={onClose}
          />

          <motion.div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="cart-overlay-title"
            tabIndex={-1}
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
                  <h2
                    id="cart-overlay-title"
                    className="mt-3 text-[1.85rem] font-heading font-black uppercase tracking-[0.01em] leading-[1.08] text-[#111827] md:text-[2.45rem]"
                  >
                    {mode === 'confirmation' ? isRestoredBankReceipt ? '최근 주문 접수 내역' : '주문 접수 · 입금 대기' : mode === 'checkout' ? '결제' : '장바구니'}
                  </h2>
                </div>
                <button
                  ref={closeButtonRef}
                  type="button"
                  aria-label="장바구니 닫기"
                  onClick={onClose}
                  className="rounded-full border border-[#d1d5db] bg-white p-2.5 text-[#111827] transition-colors hover:border-[#b8001f] hover:bg-[#b8001f] hover:text-white shadow-sm"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            <div
              ref={checkoutScrollRef}
              className="checkout-scroll-area flex-1 min-h-0 space-y-4 overflow-y-auto px-4 py-4 pr-2 pb-6 md:space-y-5 md:px-7 md:py-6 md:pr-4 md:pb-8"
            >
              {mode !== 'confirmation' && <div className="sticky top-0 z-10 rounded-[16px] border border-[#d1d5db] bg-white/95 px-4 py-3 shadow-sm backdrop-blur-xl md:py-4">
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
              </div>}

              {(checkoutMessage || checkoutError) && (
                <div
                  role={checkoutError ? 'alert' : 'status'}
                  aria-live={checkoutError ? 'assertive' : 'polite'}
                  className={`rounded-[20px] border px-4 py-3 text-sm leading-relaxed font-semibold whitespace-pre-line ${
                    checkoutError
                      ? 'border-red-500 bg-red-50 text-red-800'
                      : 'border-[#b8001f]/40 bg-[#fff1f2] text-[#8f0018]'
                  }`}
                >
                  {checkoutError || checkoutMessage}
                </div>
              )}

              {mode === 'confirmation' ? (
                <div className="space-y-4">
                  {bankOrderReceipt && <>
                    <section className={CHECKOUT_SECTION_CLASS}>
                      <h3 className="font-bold">주문 접수 내역</h3>
                      <p className="mt-3 break-all text-sm">주문번호: <strong>{bankOrderReceipt.orderCode}</strong></p>
                      {bankOrderReceipt.guestOrderNumber && <p className="mt-2 break-all text-sm">비회원 조회번호: <strong>{bankOrderReceipt.guestOrderNumber}</strong></p>}
                      <ul className="mt-4 space-y-2 border-t border-[#e5e7eb] pt-3 text-sm">
                        {bankOrderReceipt.items.map((item, index) => <li key={`${item.id}-${index}`} className="flex justify-between gap-3"><span>{item.name}{item.selectedSize ? ` / ${item.selectedSize}` : ''} × {item.quantity}</span><span className="shrink-0">{formatKrw(item.lineTotal)}</span></li>)}
                      </ul>
                      <p className="mt-4 text-sm font-bold">배송비 포함 {isRestoredBankReceipt ? '접수 당시 주문금액' : '입금액'}: {formatKrw(bankOrderReceipt.total)}</p>
                    </section>
                    {isRestoredBankReceipt ? (
                      <>
                        <p className="rounded-xl border border-amber-500 bg-amber-50 p-4 text-sm leading-relaxed text-amber-950">저장된 접수 내역입니다. 이후 취소되거나 입금 확인되었을 수 있으니, 주문조회에서 현재 상태와 입금 안내를 확인해 주세요.</p>
                        <BankTransferInstructions bankAccount={bankOrderReceipt.bankAccount} amount={bankOrderReceipt.total} />
                      </>
                    ) : (
                      <>
                        <BankTransferInstructions bankAccount={bankOrderReceipt.bankAccount} amount={bankOrderReceipt.total} />
                        <CustomerOrderNotifications notifications={bankOrderReceipt.notifications} />
                      </>
                    )}
                    <p className="text-xs leading-relaxed text-[#4b5563]">접수 시점의 안내입니다. 이후 입금 확인·취소·배송 상태는 주문조회에서 확인해 주세요.{bankOrderReceipt.channel === 'guest' ? ' 비회원은 주문한 핸드폰 번호와 설정한 주문조회 비밀번호가 필요합니다.' : ''}</p>
                  </>}
                  {onOpenMyPageOrders ? (
                    <button
                      type="button"
                      onClick={() => {
                        trackStorefrontEvent({
                          type: 'tab_click',
                          target: 'cart_confirmation:open_mypage_orders',
                          detail: '내 주문내역(마이페이지) 바로가기',
                        });
                        onOpenMyPageOrders();
                      }}
                      className="block w-full rounded-xl bg-[#b8001f] px-4 py-3 text-center text-sm font-bold text-white shadow-sm transition-colors hover:bg-[#9a0019]"
                    >
                      내 주문내역(마이페이지) 바로가기
                    </button>
                  ) : null}
                  <Link
                    href="/orders"
                    className={`block rounded-xl px-4 py-3 text-center text-sm font-bold ${
                      onOpenMyPageOrders
                        ? 'border border-[#111827] bg-white text-[#111827] hover:border-[#b8001f] hover:text-[#b8001f]'
                        : 'bg-[#b8001f] text-white'
                    }`}
                  >
                    주문·입금·배송 조회 페이지 열기
                  </Link>
                  <button type="button" onClick={onClose} className="w-full rounded-xl border border-[#d1d5db] px-4 py-3 text-sm font-bold">쇼핑 계속하기</button>
                </div>
              ) : mode === 'cart' ? (
                <>
                  {bankOrderReceipt && (
                    <div className="rounded-xl border border-[#b8001f]/35 bg-[#fff1f2] p-3.5 text-xs text-[#8f0018]">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-bold">최근 접수한 무통장입금 주문({bankOrderReceipt.orderCode})이 있습니다.</span>
                        <button
                          type="button"
                          onClick={() => setMode('confirmation')}
                          className="rounded-lg bg-[#b8001f] px-3 py-1.5 text-xs font-bold text-white"
                        >
                          계좌번호 · 접수내역 보기
                        </button>
                      </div>
                    </div>
                  )}
                  {!canCheckout ? (
                    <div className="border border-dashed border-[#d1d5db] bg-[#f8f9fa] p-8 text-center rounded-2xl space-y-4">
                      <div>
                        <p className="font-heading text-2xl uppercase mb-2 text-[#111827] font-black">비어 있음</p>
                        <p className="text-xs text-[#6b7280] font-medium">선택된 항목이 없습니다. 의류 섹션에서 담아주세요.</p>
                      </div>
                      {onOpenMyPageOrders ? (
                        <button
                          type="button"
                          onClick={() => {
                            trackStorefrontEvent({
                              type: 'tab_click',
                              target: 'empty_cart:open_mypage_orders',
                              detail: '내 주문내역(마이페이지) 바로가기',
                            });
                            onOpenMyPageOrders();
                          }}
                          className="inline-flex items-center justify-center rounded-xl border border-[#111827] bg-white px-4 py-2.5 text-xs font-bold text-[#111827] transition-colors hover:border-[#b8001f] hover:text-[#b8001f]"
                        >
                          내 주문내역(마이페이지) 바로가기
                        </button>
                      ) : null}
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
                                  aria-label={`${item.name} 장바구니에서 삭제`}
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
                          <label htmlFor="checkout-email" className="block text-[13px] font-semibold tracking-[0.01em] text-[#111827]">
                            이메일
                          </label>
                        </div>
                        <div className={CHECKOUT_FIELD_BODY_CLASS}>
                          <input
                            id="checkout-email"
                            ref={checkoutEmailInputRef}
                            type="email"
                            autoComplete="email"
                            maxLength={320}
                            readOnly={isAuthenticated}
                            value={checkoutEmail}
                            onChange={(e) => setCheckoutEmail(e.target.value)}
                            placeholder="example@email.com"
                            className={CHECKOUT_FIELD_CLASS}
                          />
                        </div>
                      </div>
                      <div className={CHECKOUT_FIELD_GROUP_CLASS}>
                        <div className={CHECKOUT_FIELD_HEADER_CLASS}>
                          <label htmlFor="checkout-phone" className="block text-[13px] font-semibold tracking-[0.01em] text-[#111827]">
                            핸드폰 번호
                          </label>
                        </div>
                        <div className={CHECKOUT_FIELD_BODY_CLASS}>
                          <input
                            id="checkout-phone"
                            ref={checkoutPhoneInputRef}
                            type="tel"
                            autoComplete="tel"
                            maxLength={30}
                            value={checkoutPhone}
                            onChange={(e) => setCheckoutPhone(e.target.value)}
                            placeholder="010-0000-0000"
                            className={CHECKOUT_FIELD_CLASS}
                          />
                        </div>
                      </div>
                      <div className={CHECKOUT_FIELD_GROUP_CLASS}>
                        <div className={CHECKOUT_FIELD_HEADER_CLASS}>
                          <label htmlFor="checkout-name" className="block text-[13px] font-semibold tracking-[0.01em] text-[#111827]">
                            수령인 이름
                          </label>
                        </div>
                        <div className={CHECKOUT_FIELD_BODY_CLASS}>
                          <input
                            id="checkout-name"
                            ref={checkoutNameInputRef}
                            type="text"
                            autoComplete="shipping name"
                            maxLength={100}
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
                          <label htmlFor="checkout-country" className="block text-[13px] font-bold tracking-[0.01em] text-[#111827]">
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
                            id="checkout-country"
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
                          <label htmlFor="checkout-address" className="block text-[13px] font-bold tracking-[0.01em] text-[#111827]">
                            상세 주소
                          </label>
                          <p className="mt-2 text-[11px] font-medium leading-relaxed text-[#4b5563]">
                            수령지 주소를 상세하게 입력하세요. 도로명, 건물명, 호수까지 적어야 합니다.
                          </p>
                        </div>
                        <div className={CHECKOUT_FIELD_BODY_CLASS}>
                          <textarea
                            id="checkout-address"
                            ref={checkoutAddressInputRef}
                            value={checkoutAddress}
                            onChange={(e) => setCheckoutAddress(e.target.value)}
                            rows={3}
                            autoComplete="shipping street-address"
                            maxLength={1000}
                            placeholder="수령지 / 도로명 / 건물명 / 도시 / 우편번호"
                            className={`${CHECKOUT_FIELD_CLASS} resize-none`}
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                </div>
              )}
            {mode !== 'confirmation' && (canCheckout || pendingPayPalApproval) && (
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
                      {formatKrw(pendingPayPalApproval?.totalKrw ?? total)}
                    </p>
                  </div>
                  {!pendingPayPalApproval && <div className="mt-2 hidden grid-cols-2 gap-2 md:grid">
                    <div className="rounded-[10px] border border-[#d1d5db] bg-white px-3 py-2 text-xs text-[#4b5563] shadow-sm">
                      <p className="font-semibold">상품 금액</p>
                      <p className="mt-1 text-sm font-black text-[#111827]">{formatKrw(subtotal)}</p>
                    </div>
                    <div className="rounded-[10px] border border-[#d1d5db] bg-white px-3 py-2 text-xs text-[#4b5563] shadow-sm">
                      <p className="font-semibold">배송비</p>
                      <p className="mt-1 text-sm font-black text-[#111827]">{formatKrw(shipping)}</p>
                    </div>
                  </div>}
                </div>
                {mode === 'cart' && !pendingPayPalApproval ? (
                  <button
                    type="button"
                    onClick={() => {
                      trackStorefrontEvent({
                        type: 'checkout_open',
                        target: 'cart:proceed_to_checkout',
                        detail: `items:${cart.length},total:${total}`,
                      });
                      setMode('checkout');
                    }}
                    className="w-full rounded-[12px] bg-[#b8001f] px-4 py-3 text-center font-heading text-base font-black uppercase tracking-[0.08em] leading-[1.1] text-white transition-all hover:bg-[#9a0019] md:text-lg shadow-md"
                  >
                    결제로 이동
                  </button>
                ) : (
                  <div className="space-y-2.5 md:space-y-3">
                    {!isAuthenticated && (
                      <div className="rounded-[14px] border border-[#e5e7eb] bg-[#f8f9fa] px-3 py-3 shadow-sm">
                        <label htmlFor="guest-order-password" className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.2em] text-[#b8001f]">
                          비회원 주문조회 비밀번호
                        </label>
                        <input
                          id="guest-order-password"
                          ref={guestPasswordInputRef}
                          type="password"
                          autoComplete="new-password"
                          minLength={4}
                          maxLength={128}
                          value={guestLookupPassword}
                          onChange={(e) => setGuestLookupPassword(e.target.value)}
                          placeholder="4자 이상 입력"
                          className={CHECKOUT_FIELD_CLASS}
                        />
                        <p className="mt-2 text-xs font-medium leading-relaxed text-[#4b5563]">
                          비회원 주문 후 핸드폰 번호와 이 비밀번호로 주문·입금·배송 상태를 조회합니다.
                        </p>
                      </div>
                    )}

                    {/* Choose the authenticated route once; do not expose duplicate member/guest actions. */}
                    <div className="flex items-center justify-start">
                      <button
                        type="button"
                        onClick={() => void submitBankTransferOrder(isAuthenticated ? 'member' : 'guest')}
                        disabled={isSubmittingOrder || isStartingNicepay || Boolean(pendingPayPalApproval)}
                        style={{
                          backgroundColor: '#ffffff',
                          color: '#111827',
                          borderRadius: '10px',
                        }}
                        className="group relative inline-flex min-h-[44px] items-center justify-between gap-3 overflow-hidden border border-gray-300 px-3.5 py-2 text-left shadow-sm transition-all duration-200 hover:bg-gray-100 disabled:opacity-50 cursor-pointer"
                      >
                        <span className="text-[0.88rem] font-bold tracking-[-0.02em] leading-snug text-black">
                          {isSubmittingOrder ? '접수 중...' : isAuthenticated ? '무통장입금 주문' : '비회원 무통장입금 주문'}
                        </span>
                        <span className="text-sm font-black text-black transition-transform duration-200 group-hover:translate-x-1">
                          →
                        </span>
                      </button>
                    </div>

                    <p className="text-xs leading-relaxed text-[#4b5563]">주문 접수 후 안내되는 계좌로 직접 송금하는 방식입니다. 접수만으로 결제가 완료되지 않습니다.</p>
                    {canUseNicepayCheckout ? (
                    <div className="rounded-[14px] border border-[#e5e7eb] bg-[#f8f9fa] px-2.5 py-2.5 shadow-sm">
                      {nicepayError && (
                        <p role="alert" className="mb-3 rounded-[16px] border border-red-500 bg-red-50 px-3 py-2 text-xs font-semibold text-red-800">{nicepayError}</p>
                      )}
                      <button
                        type="button"
                        onClick={() => void handleNicepayCheckout()}
                        disabled={isSubmittingOrder || isStartingNicepay || Boolean(pendingPayPalApproval)}
                        style={{
                          width: '100%',
                          height: '52px',
                          minHeight: '52px',
                          backgroundColor: '#ffffff',
                          color: '#111827',
                          borderRadius: '8px',
                          border: '1px solid #d1d5db',
                        }}
                        className="group flex w-full cursor-pointer items-center justify-between overflow-hidden px-4 text-left shadow-sm transition-all duration-200 hover:bg-gray-100 disabled:opacity-50"
                      >
                        <span className="flex min-h-[28px] items-center justify-between gap-3 w-full">
                          <span className="text-[0.92rem] font-bold tracking-[-0.02em] leading-snug text-black">
                            {isStartingNicepay ? (
                              '카드결제 준비중... (나이스페이먼츠)'
                            ) : (
                              '카드결제 (나이스페이먼츠)'
                            )}
                          </span>
                          <span className="shrink-0 text-base font-black text-black transition-transform duration-200 group-hover:translate-x-1">
                            →
                          </span>
                        </span>
                      </button>
                    </div>
                    ) : <p className="rounded-xl border border-[#d1d5db] bg-[#f8f9fa] p-3 text-xs text-[#4b5563]">카드결제는 회원 로그인 후 이용할 수 있습니다. <Link href="/?popup=mypage" className="font-bold underline">로그인하기</Link></p>}

                    {shouldShowPaypal ? (
                      <div className="rounded-[14px] border border-[#e5e7eb] bg-[#f8f9fa] px-2.5 py-2.5 shadow-sm">
                        {pendingPayPalApproval && (
                          <div role="alert" className="mb-3 rounded-[14px] border border-amber-500 bg-amber-50 px-3 py-3 text-xs font-semibold leading-relaxed text-amber-950">
                            PayPal 주문 {pendingPayPalApproval.transactionId}의 결제 상태를 확인 중입니다. 새 결제를 시작하지 마세요. 아래 버튼은 같은 승인 건만 다시 확인하며, 추가 결제를 만들지 않습니다.
                            <button
                              type="button"
                              onClick={() => void submitApprovedPayPal(pendingPayPalApproval)}
                              disabled={isSubmittingOrder}
                              className="mt-2 block w-full rounded-[10px] border border-amber-600 bg-white px-3 py-2 text-sm font-bold text-amber-950 disabled:opacity-50"
                            >
                              {isSubmittingOrder ? '같은 PayPal 주문 확인 중...' : '같은 PayPal 주문 다시 확인'}
                            </button>
                          </div>
                        )}
                        {paypalError && (
                          <p role="alert" className="mb-3 rounded-[16px] border border-red-500 bg-red-50 px-3 py-2 text-xs font-semibold text-red-800">{paypalError}</p>
                        )}
                        <div>
                          <div
                            ref={paypalContainerRef}
                            className={pendingPayPalApproval ? 'hidden' : 'min-h-[52px]'}
                            aria-label="PayPal 결제 버튼"
                            aria-hidden={Boolean(pendingPayPalApproval)}
                          />
                        </div>
                        {paypalError && !pendingPayPalApproval && (
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

                    <button
                      type="button"
                      onClick={() => setMode('cart')}
                      disabled={Boolean(pendingPayPalApproval)}
                      className="w-full rounded-[12px] border border-[#d1d5db] bg-white py-2 text-[13px] font-bold text-[#4b5563] transition-colors hover:border-[#b8001f] hover:text-[#b8001f] shadow-sm"
                    >
                      장바구니로
                    </button>
                  </div>
                )}
              </div>
            )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
