import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export type OrderChannel = 'member' | 'guest';

export type OrderItem = {
  id: string;
  name: string;
  category: string;
  selectedSize: string | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
};

export type NicepayPendingOrder = {
  orderId: string;
  transactionId: string;
  channel: OrderChannel;
  guestPasswordHash: string | null;
  customer: {
    name: string;
    email: string;
    phone: string;
    country: string;
    address: string;
  };
  pricing: {
    subtotal: number;
    shipping: number;
    tax: number;
    total: number;
    currency: string;
  };
  items: OrderItem[];
  nicepay: {
    amount: number;
    goodsName: string;
    returnUrl: string;
  };
};

export const NICEPAY_PENDING_ORDER_COOKIE = 'nicepay_pending_order';
export const NICEPAY_PENDING_ORDER_MAX_AGE = 15 * 60;
const NICEPAY_MAX_GOODS_NAME_LENGTH = 40;
const NICEPAY_DEFAULT_GOODS_NAME = 'ENICO VECK ORDER';

export function getNicepayPendingOrderCookieSameSite() {
  return process.env.NODE_ENV === 'production' ? 'none' : 'lax';
}

function normalizeNicepayText(value: string) {
  return value
    .normalize('NFKC')
    .replace(/[^0-9A-Za-z가-힣ㄱ-ㅎㅏ-ㅣ\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function truncateNicepayText(value: string, maxLength: number) {
  return Array.from(value).slice(0, maxLength).join('').trim();
}

function sanitizeNicepayGoodsLabel(value: string) {
  const normalized = truncateNicepayText(
    normalizeNicepayText(value),
    NICEPAY_MAX_GOODS_NAME_LENGTH,
  );
  return normalized || NICEPAY_DEFAULT_GOODS_NAME;
}

function toBase64Url(value: string) {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function fromBase64Url(value: string) {
  return Buffer.from(value, 'base64url').toString('utf8');
}

export function buildNicepayGoodsName(items: OrderItem[]) {
  const firstItem = sanitizeNicepayGoodsLabel(items[0]?.name?.trim() || NICEPAY_DEFAULT_GOODS_NAME);
  if (items.length <= 1) return firstItem;

  const suffix = ` 외 ${items.length - 1}건`;
  const maxBaseLength = Math.max(1, NICEPAY_MAX_GOODS_NAME_LENGTH - suffix.length);
  const baseName =
    truncateNicepayText(firstItem, maxBaseLength) ||
    truncateNicepayText(NICEPAY_DEFAULT_GOODS_NAME, maxBaseLength);

  return `${baseName}${suffix}`;
}

export function generateNicepayOrderId() {
  return `NP${Date.now()}${randomBytes(4).toString('hex').toUpperCase()}`;
}

export function getNicepayApiBaseUrl(clientKey: string) {
  return clientKey.trim().toUpperCase().startsWith('S')
    ? 'https://sandbox-api.nicepay.co.kr'
    : 'https://api.nicepay.co.kr';
}

export function signNicepayPendingOrder(
  payload: NicepayPendingOrder,
  secret: string,
) {
  const encodedPayload = toBase64Url(JSON.stringify(payload));
  const signature = createHmac('sha256', secret).update(encodedPayload).digest('base64url');
  return `${encodedPayload}.${signature}`;
}

export function verifyNicepayPendingOrder(
  token: string | undefined,
  secret: string,
) {
  if (!token) return null;

  const [encodedPayload, signature] = token.split('.');
  if (!encodedPayload || !signature) return null;

  const expectedSignature = createHmac('sha256', secret)
    .update(encodedPayload)
    .digest('base64url');

  const actual = Buffer.from(signature, 'utf8');
  const expected = Buffer.from(expectedSignature, 'utf8');
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    return null;
  }

  try {
    const parsed = JSON.parse(fromBase64Url(encodedPayload)) as NicepayPendingOrder;
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
}

export function buildNicepaySuccessUrl(
  origin: string,
  payload: {
    orderCode: string;
    guestOrderNumber?: string | null;
    channel: OrderChannel;
    mailFailed?: boolean;
  },
) {
  const url = new URL('/orders/nicepay/success', origin);
  url.searchParams.set('orderCode', payload.orderCode);
  url.searchParams.set('channel', payload.channel);
  if (payload.guestOrderNumber) {
    url.searchParams.set('guestOrderNumber', payload.guestOrderNumber);
  }
  if (payload.mailFailed) {
    url.searchParams.set('mail', 'failed');
  }
  return url;
}

export function buildNicepayFailureUrl(
  origin: string,
  payload: {
    code?: string | null;
    message?: string | null;
  },
) {
  const url = new URL('/orders/nicepay/failure', origin);
  if (payload.code) {
    url.searchParams.set('code', payload.code);
  }
  if (payload.message) {
    url.searchParams.set('message', payload.message);
  }
  return url;
}
