import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import {
  buildNicepayGoodsName,
  generateNicepayOrderId,
  getNicepayPendingOrderCookieSameSite,
  NICEPAY_PENDING_ORDER_COOKIE,
  NICEPAY_PENDING_ORDER_MAX_AGE,
  signNicepayPendingOrder,
  type NicepayPendingOrder,
} from '@/lib/orders/nicepay';
import {
  authenticateOrderRequest,
  buildCanonicalOrder,
  getOrderErrorStatus,
  normalizeTransactionId,
  OrderValidationError,
  type ClientOrderItem,
} from '@/lib/orders/serverOrderValidation';

type CustomerDetails = {
  name: string;
  email: string;
  phone: string;
  country: string;
  address: string;
};

type ParsedNicepayRequest = {
  transactionId: string;
  channel: 'member';
  customer: CustomerDetails;
  clientTotal: number;
  items: ClientOrderItem[];
};

function getNicepayConfig() {
  const url = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || '';
  const clientKey = process.env.NICEPAY_CLIENT_KEY?.trim() || '';
  const secretKey = process.env.NICEPAY_SECRET_KEY?.trim() || '';
  const returnUrl = process.env.NICEPAY_RETURN_URL?.trim() || '';

  if (!url || !serviceRoleKey || !clientKey || !secretKey || !returnUrl) {
    throw new OrderValidationError(
      'NICEPAY_CLIENT_KEY / NICEPAY_SECRET_KEY / NICEPAY_RETURN_URL / Supabase 서버 설정이 필요합니다.',
      500,
    );
  }

  return { url, serviceRoleKey, clientKey, secretKey, returnUrl };
}

function normalizeRequiredText(value: unknown, label: string, maxLength: number) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized || normalized.length > maxLength) {
    throw new OrderValidationError(`${label} 형식이 올바르지 않습니다.`);
  }
  return normalized;
}

function parseItems(value: unknown): ClientOrderItem[] {
  if (!Array.isArray(value)) {
    throw new OrderValidationError('주문 상품 구성이 올바르지 않습니다.');
  }

  return value.map((valueItem) => {
    if (!valueItem || typeof valueItem !== 'object') {
      throw new OrderValidationError('주문 상품 구성이 올바르지 않습니다.');
    }
    const item = valueItem as Record<string, unknown>;
    return {
      id: normalizeRequiredText(item.id, '상품 ID', 100),
      selectedSize:
        typeof item.selectedSize === 'string' ? item.selectedSize.trim().slice(0, 40) || null : null,
      quantity: Number(item.quantity),
    };
  });
}

function parseRequestBody(body: unknown): ParsedNicepayRequest {
  if (!body || typeof body !== 'object') {
    throw new OrderValidationError('NICE Payments 요청 형식이 올바르지 않습니다.');
  }

  const payload = body as Record<string, unknown>;
  if (payload.channel !== 'member') {
    throw new OrderValidationError('NICE 카드결제는 로그인한 회원만 사용할 수 있습니다.', 403);
  }

  const customer = payload.customer as Record<string, unknown> | null;
  const pricing = payload.pricing as Record<string, unknown> | null;
  if (!customer || !pricing) {
    throw new OrderValidationError('NICE Payments 요청 형식이 올바르지 않습니다.');
  }

  const email = normalizeRequiredText(customer.email, '이메일', 320);
  if (!email.includes('@')) {
    throw new OrderValidationError('이메일 형식이 올바르지 않습니다.');
  }

  const clientTotal = Number(pricing.total);
  if (!Number.isFinite(clientTotal) || clientTotal < 0) {
    throw new OrderValidationError('주문 금액 형식이 올바르지 않습니다.');
  }

  return {
    transactionId: normalizeTransactionId(payload.transactionId),
    channel: 'member',
    customer: {
      name: normalizeRequiredText(customer.name, '이름', 100),
      email,
      phone: normalizeRequiredText(customer.phone, '핸드폰 번호', 50),
      country: normalizeRequiredText(customer.country, '국가/구역', 100),
      address: normalizeRequiredText(customer.address, '주소', 500),
    },
    clientTotal,
    items: parseItems(payload.items),
  };
}

function buildPendingRawPayload(pendingOrder: NicepayPendingOrder) {
  return {
    stage: 'pending',
    pendingOrder,
  };
}

export async function POST(request: Request) {
  try {
    const config = getNicepayConfig();
    const parsed = parseRequestBody(await request.json());
    const authentication = await authenticateOrderRequest(request, parsed.channel);
    const authenticatedEmail = authentication.user?.email?.trim();
    if (!authenticatedEmail) {
      throw new OrderValidationError('회원 계정 이메일을 확인할 수 없습니다.', 400);
    }

    const serviceClient = createClient(config.url, config.serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const canonical = await buildCanonicalOrder(serviceClient, {
      items: parsed.items,
      customerCountry: parsed.customer.country,
      user: authentication.user,
      clientTotal: parsed.clientTotal,
    });

    const orderId = generateNicepayOrderId();
    const amount = canonical.pricing.total;
    const goodsName = buildNicepayGoodsName(canonical.items);
    const dynamicReturnUrl = new URL(config.returnUrl);
    dynamicReturnUrl.searchParams.set('orderCode', parsed.transactionId);
    const resolvedReturnUrl = dynamicReturnUrl.toString();
    const pendingOrder: NicepayPendingOrder = {
      orderId,
      transactionId: parsed.transactionId,
      channel: 'member',
      guestPasswordHash: null,
      customer: {
        ...parsed.customer,
        email: authenticatedEmail,
      },
      pricing: canonical.pricing,
      items: canonical.items,
      nicepay: {
        amount,
        goodsName,
        returnUrl: resolvedReturnUrl,
      },
    };

    const deletePendingResult = await serviceClient
      .from('orders')
      .delete()
      .eq('order_code', parsed.transactionId)
      .eq('payment_method', 'nicepay')
      .eq('payment_status', 'pending_payment');

    if (deletePendingResult.error && deletePendingResult.error.code !== 'PGRST116') {
      throw new OrderValidationError('기존 NICE 결제 준비 주문 정리에 실패했습니다.', 500);
    }

    const insertResult = await serviceClient
      .from('orders')
      .insert({
        order_code: pendingOrder.transactionId,
        channel: pendingOrder.channel,
        payment_method: 'nicepay',
        payment_status: 'pending_payment',
        currency: pendingOrder.pricing.currency,
        amount_subtotal: pendingOrder.pricing.subtotal,
        amount_shipping: pendingOrder.pricing.shipping,
        amount_tax: pendingOrder.pricing.tax,
        amount_total: pendingOrder.pricing.total,
        customer_name: pendingOrder.customer.name,
        customer_email: pendingOrder.customer.email,
        customer_phone: pendingOrder.customer.phone,
        customer_country: pendingOrder.customer.country,
        customer_address: pendingOrder.customer.address,
        guest_password_hash: null,
        shipping_status: 'preparing',
        items: pendingOrder.items,
        raw_payload: buildPendingRawPayload(pendingOrder),
      })
      .select('id')
      .maybeSingle();

    if (insertResult.error) {
      if (insertResult.error.code === '23505') {
        throw new OrderValidationError('이미 준비되었거나 처리된 NICE 주문입니다.', 409);
      }
      if (insertResult.error.code === '42P01') {
        throw new OrderValidationError('orders 테이블이 없습니다. sql/orders_setup.sql을 먼저 실행하세요.', 500);
      }
      if (
        insertResult.error.code === '23514' ||
        insertResult.error.message.toLowerCase().includes('payment_method')
      ) {
        throw new OrderValidationError(
          'orders 결제수단 제약조건이 최신이 아닙니다. sql/orders_setup.sql을 다시 실행해 주세요.',
          500,
        );
      }
      if (insertResult.error.code === '42703') {
        throw new OrderValidationError(
          'orders 테이블 컬럼이 최신이 아닙니다. sql/orders_setup.sql을 다시 실행해 주세요.',
          500,
        );
      }
      console.error('NICE pending order insert failed', insertResult.error);
      throw new OrderValidationError('NICE 결제 준비 주문 저장에 실패했습니다.', 500);
    }

    if (!insertResult.data?.id) {
      throw new OrderValidationError('NICE 결제 준비 주문을 저장하지 못했습니다.', 500);
    }

    const response = NextResponse.json({
      ok: true,
      clientKey: config.clientKey,
      returnUrl: resolvedReturnUrl,
      orderId,
      amount,
      goodsName,
      customer: {
        name: pendingOrder.customer.name,
        email: pendingOrder.customer.email,
        phone: pendingOrder.customer.phone,
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
    if (!(error instanceof OrderValidationError)) {
      console.error('NICE payment preparation failed', error);
    }
    return NextResponse.json(
      {
        message:
          error instanceof Error ? error.message : 'NICE Payments 준비 중 오류가 발생했습니다.',
      },
      { status: getOrderErrorStatus(error) },
    );
  }
}
