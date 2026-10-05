import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { requestBudget } from '@/lib/security/requestBudget';
import { readJsonObject } from '@/lib/security/requestBody';
import { assertExpectedSupabaseProject } from '@/lib/supabase/projectGuard';
import { claimCheckoutProducts, releaseCheckoutProducts } from '@/lib/orders/checkoutClaims';
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
  const url = assertExpectedSupabaseProject(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  );
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

function parseStoredPendingOrder(value: unknown): NicepayPendingOrder | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const payload = value as { stage?: unknown; pendingOrder?: unknown };
  if (payload.stage !== 'pending' || !payload.pendingOrder || typeof payload.pendingOrder !== 'object') {
    return null;
  }
  return payload.pendingOrder as NicepayPendingOrder;
}

function isSamePendingCheckout(existing: NicepayPendingOrder, current: NicepayPendingOrder) {
  const sameCustomer =
    existing.customer?.name === current.customer.name &&
    existing.customer?.email === current.customer.email &&
    existing.customer?.phone === current.customer.phone &&
    existing.customer?.country === current.customer.country &&
    existing.customer?.address === current.customer.address;
  const samePricing =
    existing.pricing?.subtotal === current.pricing.subtotal &&
    existing.pricing?.shipping === current.pricing.shipping &&
    existing.pricing?.tax === current.pricing.tax &&
    existing.pricing?.total === current.pricing.total &&
    existing.pricing?.currency === current.pricing.currency;
  const sameItems =
    Array.isArray(existing.items) &&
    existing.items.length === current.items.length &&
    existing.items.every((item, index) => {
      const next = current.items[index];
      return (
        item.id === next.id &&
        item.name === next.name &&
        item.category === next.category &&
        item.selectedSize === next.selectedSize &&
        item.quantity === next.quantity &&
        item.unitPrice === next.unitPrice &&
        item.lineTotal === next.lineTotal
      );
    });

  return (
    existing.transactionId === current.transactionId &&
    existing.channel === current.channel &&
    existing.guestPasswordHash === current.guestPasswordHash &&
    sameCustomer &&
    samePricing &&
    sameItems &&
    existing.nicepay?.amount === current.nicepay.amount &&
    existing.nicepay?.goodsName === current.nicepay.goodsName &&
    existing.nicepay?.returnUrl === current.nicepay.returnUrl &&
    typeof existing.orderId === 'string' &&
    existing.orderId.length > 0
  );
}

function buildPrepareResponse(
  pendingOrder: NicepayPendingOrder,
  config: { clientKey: string; secretKey: string },
) {
  const response = NextResponse.json({
    ok: true,
    clientKey: config.clientKey,
    returnUrl: pendingOrder.nicepay.returnUrl,
    orderId: pendingOrder.orderId,
    amount: pendingOrder.nicepay.amount,
    goodsName: pendingOrder.nicepay.goodsName,
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
}

async function releaseFailedPrepareClaim(
  serviceClient: SupabaseClient,
  orderCode: string,
) {
  try {
    await releaseCheckoutProducts(serviceClient, 'nicepay', orderCode);
  } catch (error) {
    console.error('NICE failed-prepare product claim release failed', { orderCode, error });
  }
}

export async function POST(request: Request) {
  const blocked = await requestBudget(request, 'nicepay-prepare', 20, 600);
  if (blocked) return blocked;
  try {
    const config = getNicepayConfig();
    const parsed = parseRequestBody(await readJsonObject(request));
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

    const existingOrder = await serviceClient
      .from('orders')
      .select('id, payment_status, raw_payload')
      .eq('order_code', pendingOrder.transactionId)
      .eq('payment_method', 'nicepay')
      .maybeSingle();
    if (existingOrder.error) {
      throw new OrderValidationError('기존 NICE 주문 확인에 실패했습니다.', 500);
    }
    if (existingOrder.data?.id) {
      const storedPending = parseStoredPendingOrder(existingOrder.data.raw_payload);
      if (
        existingOrder.data.payment_status === 'pending_payment' &&
        storedPending &&
        isSamePendingCheckout(storedPending, pendingOrder)
      ) {
        await claimCheckoutProducts(
          serviceClient,
          storedPending.items,
          'nicepay',
          storedPending.transactionId,
          1800,
        );
        return buildPrepareResponse(storedPending, config);
      }
      throw new OrderValidationError('이미 준비되었거나 처리된 NICE 주문입니다.', 409);
    }

    await claimCheckoutProducts(
      serviceClient,
      pendingOrder.items,
      'nicepay',
      pendingOrder.transactionId,
      1800,
    );

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
        const racedOrder = await serviceClient
          .from('orders')
          .select('payment_status, raw_payload')
          .eq('order_code', pendingOrder.transactionId)
          .eq('payment_method', 'nicepay')
          .maybeSingle();
        const racedPending = parseStoredPendingOrder(racedOrder.data?.raw_payload);
        if (
          !racedOrder.error &&
          racedOrder.data?.payment_status === 'pending_payment' &&
          racedPending &&
          isSamePendingCheckout(racedPending, pendingOrder)
        ) {
          return buildPrepareResponse(racedPending, config);
        }
        throw new OrderValidationError('이미 준비되었거나 처리된 NICE 주문입니다.', 409);
      }
      await releaseFailedPrepareClaim(serviceClient, pendingOrder.transactionId);
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
      const verifyInsert = await serviceClient
        .from('orders')
        .select('id, payment_status, raw_payload')
        .eq('order_code', pendingOrder.transactionId)
        .eq('payment_method', 'nicepay')
        .maybeSingle();
      const verifiedPending = parseStoredPendingOrder(verifyInsert.data?.raw_payload);
      if (
        !verifyInsert.error &&
        verifyInsert.data?.payment_status === 'pending_payment' &&
        verifiedPending &&
        isSamePendingCheckout(verifiedPending, pendingOrder)
      ) {
        return buildPrepareResponse(verifiedPending, config);
      }
      if (!verifyInsert.error && !verifyInsert.data?.id) {
        await releaseFailedPrepareClaim(serviceClient, pendingOrder.transactionId);
      }
      throw new OrderValidationError('NICE 결제 준비 주문을 저장하지 못했습니다.', 500);
    }

    return buildPrepareResponse(pendingOrder, config);
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
