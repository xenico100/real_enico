import { NextResponse } from 'next/server';
import { hashGuestLookupPassword } from '@/lib/orders/guestLookup';
import {
  buildNicepayGoodsName,
  generateNicepayOrderId,
  NICEPAY_PENDING_ORDER_COOKIE,
  NICEPAY_PENDING_ORDER_MAX_AGE,
  signNicepayPendingOrder,
  type NicepayPendingOrder,
  type OrderChannel,
  type OrderItem,
} from '@/lib/orders/nicepay';

type NicepayPreparePayload = {
  transactionId: string;
  channel: OrderChannel;
  guestLookupPassword: string | null;
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
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function toNumber(value: unknown) {
  return typeof value === 'number' ? value : Number(value);
}

function getNicepayConfig() {
  const clientKey = process.env.NICEPAY_CLIENT_KEY?.trim() || '';
  const secretKey = process.env.NICEPAY_SECRET_KEY?.trim() || '';
  const mid = process.env.NICEPAY_MID?.trim() || '';
  const returnUrl = process.env.NICEPAY_RETURN_URL?.trim() || '';

  if (!clientKey || !secretKey || !mid || !returnUrl) {
    return null;
  }

  return { clientKey, secretKey, mid, returnUrl };
}

function normalizeGuestLookupPassword(payload: Partial<NicepayPreparePayload>) {
  if (payload.channel !== 'guest') return null;
  if (!isNonEmptyString(payload.guestLookupPassword)) return null;
  const normalized = payload.guestLookupPassword.trim();
  return normalized.length >= 4 ? normalized : null;
}

function validatePayload(body: unknown): NicepayPreparePayload | null {
  if (!body || typeof body !== 'object') return null;

  const payload = body as Partial<NicepayPreparePayload>;
  if (
    !isNonEmptyString(payload.transactionId) ||
    (payload.channel !== 'member' && payload.channel !== 'guest')
  ) {
    return null;
  }

  const customer = payload.customer;
  const pricing = payload.pricing;
  const items = payload.items;
  const normalizedGuestLookupPassword = normalizeGuestLookupPassword(payload);

  if (
    !customer ||
    !pricing ||
    !Array.isArray(items) ||
    items.length === 0 ||
    !isNonEmptyString(customer.name) ||
    !isNonEmptyString(customer.email) ||
    !isNonEmptyString(customer.phone) ||
    !isNonEmptyString(customer.country) ||
    !isNonEmptyString(customer.address) ||
    !isNonEmptyString(pricing.currency)
  ) {
    return null;
  }

  if (payload.channel === 'guest' && !normalizedGuestLookupPassword) {
    return null;
  }

  const subtotal = toNumber(pricing.subtotal);
  const shipping = toNumber(pricing.shipping);
  const tax = toNumber(pricing.tax);
  const total = toNumber(pricing.total);

  if (
    Number.isNaN(subtotal) ||
    Number.isNaN(shipping) ||
    Number.isNaN(tax) ||
    Number.isNaN(total)
  ) {
    return null;
  }

  const normalizedItems: OrderItem[] = [];
  for (const item of items) {
    if (!item || typeof item !== 'object') return null;
    const target = item as Partial<OrderItem>;
    if (
      !isNonEmptyString(target.id) ||
      !isNonEmptyString(target.name) ||
      !isNonEmptyString(target.category)
    ) {
      return null;
    }

    const quantity = toNumber(target.quantity);
    const unitPrice = toNumber(target.unitPrice);
    const lineTotal = toNumber(target.lineTotal);
    if (
      Number.isNaN(quantity) ||
      Number.isNaN(unitPrice) ||
      Number.isNaN(lineTotal) ||
      quantity <= 0 ||
      quantity > 1
    ) {
      return null;
    }

    normalizedItems.push({
      id: target.id.trim(),
      name: target.name.trim(),
      category: target.category.trim(),
      selectedSize: typeof target.selectedSize === 'string' ? target.selectedSize.trim() || null : null,
      quantity,
      unitPrice,
      lineTotal,
    });
  }

  return {
    transactionId: payload.transactionId.trim(),
    channel: payload.channel,
    guestLookupPassword: normalizedGuestLookupPassword,
    customer: {
      name: customer.name.trim(),
      email: customer.email.trim(),
      phone: customer.phone.trim(),
      country: customer.country.trim(),
      address: customer.address.trim(),
    },
    pricing: {
      subtotal,
      shipping,
      tax,
      total,
      currency: pricing.currency.trim().toUpperCase(),
    },
    items: normalizedItems,
  };
}

export async function POST(request: Request) {
  const config = getNicepayConfig();
  if (!config) {
    return NextResponse.json(
      { message: 'NICEPAY_CLIENT_KEY / NICEPAY_SECRET_KEY / NICEPAY_MID / NICEPAY_RETURN_URL 설정이 필요합니다.' },
      { status: 500 },
    );
  }

  try {
    const body = (await request.json()) as unknown;
    const payload = validatePayload(body);
    if (!payload) {
      return NextResponse.json(
        { message: 'NICE Payments 요청 형식이 올바르지 않습니다.' },
        { status: 400 },
      );
    }

    const orderId = generateNicepayOrderId();
    const amount = Math.max(1, Math.round(payload.pricing.total));
    const goodsName = buildNicepayGoodsName(payload.items);
    const pendingOrder: NicepayPendingOrder = {
      orderId,
      transactionId: payload.transactionId,
      channel: payload.channel,
      guestPasswordHash:
        payload.channel === 'guest' && payload.guestLookupPassword
          ? hashGuestLookupPassword(payload.guestLookupPassword)
          : null,
      customer: payload.customer,
      pricing: payload.pricing,
      items: payload.items,
      nicepay: {
        amount,
        goodsName,
        mid: config.mid,
        returnUrl: config.returnUrl,
      },
    };

    const response = NextResponse.json({
      ok: true,
      clientKey: config.clientKey,
      mid: config.mid,
      returnUrl: config.returnUrl,
      orderId,
      amount,
      goodsName,
      customer: {
        name: payload.customer.name,
        email: payload.customer.email,
        phone: payload.customer.phone,
      },
    });

    response.cookies.set({
      name: NICEPAY_PENDING_ORDER_COOKIE,
      value: signNicepayPendingOrder(pendingOrder, config.secretKey),
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: NICEPAY_PENDING_ORDER_MAX_AGE,
    });

    return response;
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error ? error.message : 'NICE Payments 준비 중 오류가 발생했습니다.',
      },
      { status: 500 },
    );
  }
}
