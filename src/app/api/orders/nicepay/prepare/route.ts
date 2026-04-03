import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { hashGuestLookupPassword } from '@/lib/orders/guestLookup';
import {
  buildNicepayGoodsName,
  generateNicepayOrderId,
  getNicepayPendingOrderCookieSameSite,
  NICEPAY_PENDING_ORDER_COOKIE,
  NICEPAY_PENDING_ORDER_MAX_AGE,
  signNicepayPendingOrder,
  type NicepayPendingOrder,
  type OrderChannel,
  type OrderItem,
} from '@/lib/orders/nicepay';
import {
  extractPersistentProductIds,
  getSingleStockOrderViolation,
} from '@/lib/storefront/productAvailability';
import {
  fetchProductAvailabilitySnapshot,
  isProductUnavailable,
} from '@/lib/storefront/productAvailabilityDb';

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

function toRoundedAmount(value: number) {
  return Math.round(value);
}

function getNicepayConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || '';
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || '';
  const clientKey = process.env.NICEPAY_CLIENT_KEY?.trim() || '';
  const secretKey = process.env.NICEPAY_SECRET_KEY?.trim() || '';
  const returnUrl = process.env.NICEPAY_RETURN_URL?.trim() || '';

  if (!url || !serviceRoleKey || !clientKey || !secretKey || !returnUrl) {
    return null;
  }

  return { url, serviceRoleKey, clientKey, secretKey, returnUrl };
}

function buildPendingRawPayload(pendingOrder: NicepayPendingOrder) {
  return {
    stage: 'pending',
    pendingOrder,
  };
}

async function ensureItemsAvailable(
  serviceClient: SupabaseClient,
  items: OrderItem[],
) {
  const productIds = extractPersistentProductIds(items);
  if (productIds.length === 0) return;

  const { rows } = await fetchProductAvailabilitySnapshot(serviceClient, productIds, {
    includeTitle: true,
  });
  if (rows.length !== productIds.length) {
    throw new Error('이미 판매 완료되었거나 더 이상 구매할 수 없는 상품이 포함되어 있습니다.');
  }

  const soldOutProduct = rows.find((row) => isProductUnavailable(row));
  if (soldOutProduct) {
    throw new Error(
      `${soldOutProduct.title?.trim() || '선택한 상품'}은 이미 품절되어 결제를 진행할 수 없습니다.`,
    );
  }
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
  let subtotalFromItems = 0;
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
      quantity > 99 ||
      unitPrice < 0 ||
      lineTotal < 0
    ) {
      return null;
    }

    if (toRoundedAmount(unitPrice * quantity) !== toRoundedAmount(lineTotal)) {
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
    subtotalFromItems += toRoundedAmount(lineTotal);
  }

  if (
    subtotal < 0 ||
    shipping < 0 ||
    tax < 0 ||
    total < 0 ||
    toRoundedAmount(subtotal) !== subtotalFromItems ||
    toRoundedAmount(subtotal + shipping + tax) !== toRoundedAmount(total) ||
    pricing.currency.trim().toUpperCase() !== 'KRW'
  ) {
    return null;
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
      { message: 'NICEPAY_CLIENT_KEY / NICEPAY_SECRET_KEY / NICEPAY_RETURN_URL 설정이 필요합니다.' },
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

    const singleStockViolation = getSingleStockOrderViolation(payload.items);
    if (singleStockViolation) {
      return NextResponse.json({ message: singleStockViolation }, { status: 409 });
    }

    const orderId = generateNicepayOrderId();
    const amount = Math.max(1, Math.round(payload.pricing.total));
    const goodsName = buildNicepayGoodsName(payload.items);
    const dynamicReturnUrl = new URL(config.returnUrl);
    dynamicReturnUrl.searchParams.set('orderCode', payload.transactionId);
    const resolvedReturnUrl = dynamicReturnUrl.toString();
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
        returnUrl: resolvedReturnUrl,
      },
    };

    const serviceClient = createClient(config.url, config.serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    await ensureItemsAvailable(serviceClient, payload.items);

    const deletePendingResult = await serviceClient
      .from('orders')
      .delete()
      .eq('order_code', payload.transactionId)
      .eq('payment_method', 'nicepay')
      .eq('payment_status', 'pending_payment');

    if (deletePendingResult.error && deletePendingResult.error.code !== 'PGRST116') {
      throw new Error(deletePendingResult.error.message);
    }

    const insertResult = await serviceClient
      .from('orders')
      .insert({
        order_code: payload.transactionId,
        channel: payload.channel,
        payment_method: 'nicepay',
        payment_status: 'pending_payment',
        currency: payload.pricing.currency,
        amount_subtotal: Math.round(payload.pricing.subtotal),
        amount_shipping: Math.round(payload.pricing.shipping),
        amount_tax: Math.round(payload.pricing.tax),
        amount_total: Math.round(payload.pricing.total),
        customer_name: payload.customer.name,
        customer_email: payload.customer.email,
        customer_phone: payload.customer.phone,
        customer_country: payload.customer.country,
        customer_address: payload.customer.address,
        guest_password_hash: pendingOrder.guestPasswordHash,
        shipping_status: 'preparing',
        items: payload.items,
        raw_payload: buildPendingRawPayload(pendingOrder),
      })
      .select('id')
      .maybeSingle();

    if (insertResult.error) {
      if (insertResult.error.code === '42P01') {
        throw new Error('orders 테이블이 없습니다. sql/orders_setup.sql을 먼저 실행하세요.');
      }
      if (
        insertResult.error.code === '23514' ||
        insertResult.error.message.toLowerCase().includes('payment_method')
      ) {
        throw new Error(
          'orders 결제수단 제약조건이 최신이 아닙니다. sql/orders_setup.sql을 다시 실행해 주세요.',
        );
      }
      if (insertResult.error.code === '42703') {
        throw new Error(
          'orders 테이블 컬럼이 최신이 아닙니다. sql/orders_setup.sql을 다시 실행해 주세요.',
        );
      }
      throw new Error(insertResult.error.message);
    }

    if (!insertResult.data?.id) {
      throw new Error('NICE 결제 준비 주문을 저장하지 못했습니다.');
    }

    const response = NextResponse.json({
      ok: true,
      clientKey: config.clientKey,
      returnUrl: resolvedReturnUrl,
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
      sameSite: getNicepayPendingOrderCookieSameSite(),
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
