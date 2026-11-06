'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
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
  onOpenLogin?: () => void;
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
  'min-w-0 border border-[#d1d5db] bg-white px-4 py-4 md:px-6 md:py-6';
const CHECKOUT_FIELD_GROUP_CLASS =
  'min-w-0 border-b border-[#e5e7eb] bg-white px-0 py-3 md:px-0 md:py-4';
const CHECKOUT_FIELD_CLASS =
  'w-full min-w-0 rounded-none border border-[#cbd0d6] bg-[#f7f7f5] px-3.5 py-3 text-[15px] leading-[1.45] text-[#111827] placeholder:text-[#8b929d] focus:border-[#b8001f] focus:outline-none focus:ring-2 focus:ring-[#b8001f]/15 font-medium';
const CHECKOUT_FIELD_HEADER_CLASS = 'mb-2.5';
const CHECKOUT_FIELD_BODY_CLASS = '';
const CHECKOUT_PAYMENT_PANEL_CLASS =
  'border border-[#d1d5db] bg-white p-1.5';
const CHECKOUT_PAYMENT_BUTTON_CLASS =
  'group flex h-[52px] min-h-[52px] w-full cursor-pointer items-center justify-between overflow-hidden rounded-none border border-[#d1d5db] bg-white px-4 text-left text-[#111827] transition-colors duration-200 hover:bg-[#f7f7f5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b8001f] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50';

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

export function CartOverlay({ isOpen, onClose, onOpenMyPageOrders, onOpenLogin }: CartOverlayProps) {
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
    setMode('cart');
    setNicepayError(null);
    setCheckoutMessage(null);
    setCheckoutError(null);
    setGuestLookupPassword('');
  // Restore only when opening; cart mutations during submission must not reset the receipt.
  }, [isOpen]);

  useLayoutEffect(() => {
    if (isOpen && checkoutScrollRef.current) checkoutScrollRef.current.scrollTop = 0;
  }, [isOpen, mode]);

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
    cart.length,
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
            initial={false}
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
            className="fixed inset-0 z-[90] flex min-h-0 flex-col overflow-hidden bg-[#f7f7f5] font-mono text-[#111827] shadow-2xl md:inset-y-0 md:left-auto md:right-0 md:w-[560px] md:border-l md:border-[#c9cdd3] md:shadow-[-16px_0_65px_rgba(0,0,0,.16)]"
          >
            <header className="relative z-10 shrink-0 border-b border-[#ced2d8] bg-[#f7f7f5] px-5 pb-4 pt-[max(20px,env(safe-area-inset-top))] md:px-8 md:pb-6 md:pt-8">
              <div className="mb-3 flex items-center gap-3 text-[10px] font-bold uppercase tracking-[.16em] text-[#737883]">
                <span className="text-[#b8001f]">ENICO VECK / STORE</span>
                <span className="h-px flex-1 bg-[#d1d5db]" aria-hidden="true" />
                <span>{mode === 'cart' ? '01 / BAG' : mode === 'checkout' ? '02 / CHECKOUT' : '03 / ORDER'}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <h2 id="cart-overlay-title" className="font-heading text-[clamp(25px,6.8vw,34px)] font-black leading-[1.08] tracking-[-.05em] text-[#101522] md:text-[38px]">
                    {mode === 'confirmation' ? (isRestoredBankReceipt ? '최근 주문 기록' : '주문 접수') : mode === 'checkout' ? '주문 / 결제' : '장바구니'}
                  </h2>
                  <p className="mt-1.5 text-[11px] font-medium leading-5 text-[#69707d]">
                    {mode === 'confirmation' ? 'ORDER RECORD / TRANSFER' : mode === 'checkout' ? 'CHECKOUT / SECURE' : 'SELECTED PIECES'}
                  </p>
                </div>
                <button ref={closeButtonRef} type="button" aria-label="장바구니 닫기" onClick={onClose}
                  className="grid h-11 w-11 shrink-0 place-items-center border border-[#c7ccd3] bg-white text-[#101522] transition-colors hover:border-[#b8001f] hover:text-[#b8001f] focus-visible:outline-2 focus-visible:outline-[#b8001f]">
                  <X size={21} strokeWidth={1.8} />
                </button>
              </div>
            </header>

            <div
              ref={checkoutScrollRef}
              className="checkout-scroll-area min-h-0 flex-1 space-y-4 overflow-x-hidden overflow-y-auto overscroll-contain px-4 pb-[max(24px,env(safe-area-inset-bottom))] pt-4 [scrollbar-width:thin] [-webkit-overflow-scrolling:touch] md:space-y-5 md:px-8 md:py-6"
            >
              {mode !== 'confirmation' && (
                <div className="sticky top-0 z-10 flex min-h-[62px] items-center justify-between gap-4 border border-[#d1d5db] bg-[#f7f7f5]/95 px-4 py-3 backdrop-blur-lg">
                  <span className="text-[11px] font-semibold uppercase tracking-[.09em] text-[#737883]">
                    {mode === 'checkout' ? 'ORDER TOTAL' : 'PIECES / ' + String(itemCount).padStart(2, '0')}
                  </span>
                  <strong className="text-right font-heading text-lg font-black tracking-[-.04em] tabular-nums text-[#111827] md:text-xl">{formatKrw(total)}</strong>
                </div>
              )}

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
                  <div className="border-l-[3px] border-[#b8001f] bg-[#f0f1ef] px-4 py-3">
                    <p className="text-[10px] font-bold uppercase tracking-[.18em] text-[#b8001f]">ORDER RECORDED</p>
                    <p className="mt-1 text-sm font-semibold leading-6 text-[#111827]">
                      {isRestoredBankReceipt ? '저장된 주문 기록입니다.' : '무통장입금 주문이 접수됐습니다.'}
                    </p>
                    <p className="text-xs leading-5 text-[#59616d]">입금이 확인되어야 결제가 완료됩니다.</p>
                  </div>
                  {bankOrderReceipt ? (
                    <>
                      <section className="border border-[#d1d5db] bg-white p-4 md:p-5" aria-label="주문 접수 내역">
                        <div className="mb-3 flex items-center justify-between border-b border-[#e5e7eb] pb-3">
                          <h3 className="text-xs font-bold tracking-[.08em]">ORDER SUMMARY</h3>
                          <span className="text-[10px] text-[#757c87]">{bankOrderReceipt.items.length} ITEMS</span>
                        </div>
                        <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-2 text-[12px] leading-5">
                          <dt className="text-[#69707d]">주문번호</dt>
                          <dd className="min-w-0 break-all text-right font-bold tabular-nums">{bankOrderReceipt.orderCode}</dd>
                          {bankOrderReceipt.guestOrderNumber && <>
                            <dt className="text-[#69707d]">비회원 조회번호</dt>
                            <dd className="min-w-0 break-all text-right font-bold tabular-nums">{bankOrderReceipt.guestOrderNumber}</dd>
                          </>}
                        </dl>
                        <ul className="mt-4 space-y-2 border-t border-[#e5e7eb] pt-3">
                          {bankOrderReceipt.items.map((item, index) => (
                            <li key={String(item.id) + String(index)} className="flex items-start justify-between gap-3 text-[12px] leading-5">
                              <span className="min-w-0 break-words text-[#4b5563]">{item.name}{item.selectedSize ? ' / ' + item.selectedSize : ''} × {item.quantity}</span>
                              <strong className="shrink-0 whitespace-nowrap tabular-nums text-[#111827]">{formatKrw(item.lineTotal)}</strong>
                            </li>
                          ))}
                        </ul>
                        <div className="mt-4 flex items-center justify-between gap-4 border-t border-[#111827] pt-3">
                          <span className="text-xs font-semibold">입금 안내 금액</span>
                          <strong className="font-heading text-xl font-black tabular-nums text-[#111827]">{formatKrw(bankOrderReceipt.total)}</strong>
                        </div>
                      </section>
                      {isRestoredBankReceipt && <p className="border-l-2 border-[#9ca3af] bg-[#f0f1ef] px-3 py-2.5 text-xs leading-5 text-[#4b5563]">저장 당시의 안내입니다. 실제 입금·취소·배송 상태는 주문조회에서 확인하세요.</p>}
                      <BankTransferInstructions bankAccount={bankOrderReceipt.bankAccount} amount={bankOrderReceipt.total} tone="receipt" />
                      {!isRestoredBankReceipt && <CustomerOrderNotifications notifications={bankOrderReceipt.notifications} />}
                      <p className="text-xs leading-5 text-[#646b75]">계좌이체만으로 주문이 자동 확정되지는 않습니다. 입금 확인 후 상태가 변경됩니다.{bankOrderReceipt.channel === 'guest' ? ' 비회원 주문조회에는 주문 시 지정한 비밀번호가 필요합니다.' : ''}</p>
                    </>
                  ) : <p className="text-sm leading-6 text-[#4b5563]">접수된 주문의 자세한 상태는 주문조회에서 확인해 주세요. 같은 주문을 다시 접수하지 마세요.</p>}
                  {onOpenMyPageOrders ? (
                    <button type="button" onClick={() => {
                      trackStorefrontEvent({ type: 'tab_click', target: 'cart_confirmation:open_mypage_orders', detail: '주문 상태 확인' });
                      onOpenMyPageOrders();
                    }} className="flex min-h-12 w-full items-center justify-between bg-[#b8001f] px-4 py-3 text-left text-sm font-bold text-white transition-colors hover:bg-[#930018]">
                      주문 상태 확인 <span aria-hidden="true">↗</span>
                    </button>
                  ) : <Link href="/orders" className="flex min-h-12 w-full items-center justify-between bg-[#b8001f] px-4 py-3 text-sm font-bold text-white">주문 상태 확인 <span aria-hidden="true">↗</span></Link>}
                  <div className="grid grid-cols-2 gap-2">
                    <button type="button" onClick={() => setMode('cart')} className="min-h-11 border border-[#b8bec6] bg-white px-3 py-2 text-xs font-semibold text-[#111827]">장바구니 보기</button>
                    <button type="button" onClick={onClose} className="min-h-11 border border-[#b8bec6] bg-white px-3 py-2 text-xs font-semibold text-[#111827]">전시로 돌아가기</button>
                  </div>
                </div>
              ) : mode === 'cart' ? (
                <>
                  {bankOrderReceipt && (
                    <div className="border-l-[3px] border-[#b8001f] bg-[#f0f1ef] px-3 py-3 text-xs text-[#111827]">
                      <div className="flex items-center justify-between gap-3">
                        <span className="min-w-0 break-words font-semibold leading-5">최근 접수 기록 <span className="font-normal text-[#6b7280]">/ {bankOrderReceipt.orderCode}</span></span>
                        <button
                          type="button"
                          onClick={() => setMode('confirmation')}
                          className="min-h-11 shrink-0 border border-[#b8001f] px-3 py-2 text-[11px] font-bold text-[#b8001f]"
                        >
                          내역 보기
                        </button>
                      </div>
                    </div>
                  )}
                  {!canCheckout ? (
                    <div className="grid min-h-[220px] place-content-center gap-4 border border-[#d1d5db] bg-white p-6 text-center">
                      <div>
                        <p className="mb-2 font-heading text-3xl font-black uppercase tracking-[-.07em] text-[#111827]">비어 있음</p>
                        <p className="text-xs text-[#6b7280] font-medium">아직 선택한 피스가 없습니다.</p>
                      </div>
                      {onOpenMyPageOrders && !bankOrderReceipt ? (
                        <button
                          type="button"
                          onClick={() => {
                            trackStorefrontEvent({
                              type: 'tab_click',
                              target: 'empty_cart:open_mypage_orders',
                              detail: '주문 조회',
                            });
                            onOpenMyPageOrders();
                          }}
                          className="inline-flex items-center justify-center rounded-xl border border-[#111827] bg-white px-4 py-2.5 text-xs font-bold text-[#111827] transition-colors hover:border-[#b8001f] hover:text-[#b8001f]"
                        >
                          주문 조회
                        </button>
                      ) : null}
                      <button type="button" onClick={onClose} className="min-h-11 border border-[#111827] px-5 py-2 text-xs font-bold uppercase tracking-wider">전시 계속 보기 →</button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {cart.map((item) => (
                        <div key={`${item.id}-${item.selectedSize ?? 'na'}`} className="border border-[#d1d5db] bg-white p-3 md:p-4">
                          <div className="flex gap-4">
                            <div className="relative aspect-[4/5] w-[76px] shrink-0 overflow-hidden border border-[#d1d5db] bg-[#f7f7f5] md:w-20">
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
                                    {[item.category || '항목', item.selectedSize ? 'SIZE ' + item.selectedSize : null]
                                      .filter(Boolean)
                                      .join(' / ')}
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
                                <div className="flex items-center border border-[#e1e4e8] bg-[#f7f7f5] px-2.5 py-1.5">
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
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className={`${CHECKOUT_FIELD_GROUP_CLASS} sm:col-span-2`}>
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
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
                      <div className={`${CHECKOUT_FIELD_GROUP_CLASS} sm:col-span-2`}>
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
              <div className="relative z-20 border-t border-[#cbd0d6] bg-[#f7f7f5] px-3 py-3 md:px-4 md:py-4">
                <div className="mb-3 border border-[#d1d5db] bg-white px-3 py-3 md:px-4 md:py-4">
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
                    className="min-h-[52px] w-full bg-[#b8001f] px-4 py-3 text-center font-heading text-[15px] font-black tracking-[.04em] text-white transition-colors hover:bg-[#930018]"
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
                    <div className={CHECKOUT_PAYMENT_PANEL_CLASS}>
                      <button
                        type="button"
                        onClick={() => void submitBankTransferOrder(isAuthenticated ? 'member' : 'guest')}
                        disabled={isSubmittingOrder || isStartingNicepay || Boolean(pendingPayPalApproval)}
                        className={CHECKOUT_PAYMENT_BUTTON_CLASS}
                      >
                        <span className="flex min-h-[28px] items-center justify-between gap-3 w-full">
                          <span className="text-[0.92rem] font-bold tracking-[-0.02em] leading-snug text-black">
                            {isSubmittingOrder ? '접수 중...' : isAuthenticated ? '무통장입금 주문' : '비회원 무통장입금 주문'}
                          </span>
                          <span className="shrink-0 text-base font-black text-black transition-transform duration-200 group-hover:translate-x-1">
                            →
                          </span>
                        </span>
                      </button>
                    </div>

                    <p className="text-xs leading-relaxed text-[#4b5563]">주문 접수 후 안내되는 계좌로 직접 송금하는 방식입니다. 접수만으로 결제가 완료되지 않습니다.</p>
                    {canUseNicepayCheckout ? (
                    <div className={CHECKOUT_PAYMENT_PANEL_CLASS}>
                      {nicepayError && (
                        <p role="alert" className="mb-3 rounded-[16px] border border-red-500 bg-red-50 px-3 py-2 text-xs font-semibold text-red-800">{nicepayError}</p>
                      )}
                      <button
                        type="button"
                        onClick={() => void handleNicepayCheckout()}
                        disabled={isSubmittingOrder || isStartingNicepay || Boolean(pendingPayPalApproval)}
                        className={CHECKOUT_PAYMENT_BUTTON_CLASS}
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
                    ) : (
                      <p className="rounded-xl border border-[#d1d5db] bg-[#f8f9fa] p-3 text-xs text-[#4b5563]">
                        카드결제는 회원 로그인 후 이용할 수 있습니다.{' '}
                        {onOpenLogin ? (
                          <button type="button" onClick={onOpenLogin} className="font-bold underline">
                            로그인하기
                          </button>
                        ) : (
                          <Link href="/?popup=mypage" className="font-bold underline">로그인하기</Link>
                        )}
                      </p>
                    )}

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
