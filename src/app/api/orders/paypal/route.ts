import { revalidateTag } from 'next/cache';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import {
  generateGuestOrderNumber,
  hashGuestLookupPassword,
} from '@/lib/orders/guestLookup';
import { capturePayPalOrder } from '@/lib/orders/paypalServer';
import {
  authenticateOrderRequest,
  buildCanonicalOrder,
  getOrderErrorStatus,
  normalizeTransactionId,
  OrderValidationError,
  type CanonicalOrderItem,
  type CanonicalOrderPricing,
  type ClientOrderItem,
  type ServerOrderChannel,
} from '@/lib/orders/serverOrderValidation';
import { extractPersistentProductIds } from '@/lib/storefront/productAvailability';
import {
  fetchProductAvailabilitySnapshot,
  markProductsSoldOut,
} from '@/lib/storefront/productAvailabilityDb';

const DEFAULT_ORDER_RECEIVER_EMAIL = 'morba9850@gmail.com';
const RESEND_API_ENDPOINT = 'https://api.resend.com/emails';

type CustomerDetails = {
  name: string;
  email: string;
  phone: string;
  country: string;
  address: string;
};

type PayPalDetails = {
  orderId: string;
  captureId: string;
  status: string;
  currency: string;
  value: string;
};

type PayPalOrderPayload = {
  transactionId: string;
  channel: ServerOrderChannel;
  customer: CustomerDetails;
  pricing: CanonicalOrderPricing;
  paypal: PayPalDetails;
  items: CanonicalOrderItem[];
};

type ParsedPayPalRequest = {
  transactionId: string;
  channel: ServerOrderChannel;
  guestLookupPassword: string | null;
  customer: CustomerDetails;
  clientTotal: number;
  paypal: {
    orderId: string;
    captureId: string | null;
  };
  items: ClientOrderItem[];
};

type PayPalOrderBasePayload = Omit<PayPalOrderPayload, 'paypal'>;

type PersistGuestMeta = {
  guestOrderNumber: string | null;
  guestPasswordHash: string | null;
};

type ExistingPayPalOrder = {
  id: string;
  order_code: string;
  paypal_order_id: string | null;
  payment_status: string;
  guest_order_number: string | null;
  channel: ServerOrderChannel;
  customer_email: string;
  amount_total: number;
};

function createOrderServiceClient() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new OrderValidationError(
      '주문 저장용 Supabase 서버 설정이 없습니다. SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY를 확인하세요.',
      500,
    );
  }

  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
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

function parseRequestBody(body: unknown): ParsedPayPalRequest {
  if (!body || typeof body !== 'object') {
    throw new OrderValidationError('PayPal 주문 요청 형식이 올바르지 않습니다.');
  }

  const payload = body as Record<string, unknown>;
  const customer = payload.customer as Record<string, unknown> | null;
  const pricing = payload.pricing as Record<string, unknown> | null;
  const paypal = payload.paypal as Record<string, unknown> | null;
  if (!customer || !pricing || !paypal) {
    throw new OrderValidationError('PayPal 주문 요청 형식이 올바르지 않습니다.');
  }

  const channel = payload.channel;
  if (channel !== 'member' && channel !== 'guest') {
    throw new OrderValidationError('주문 유형이 올바르지 않습니다.');
  }

  const email = normalizeRequiredText(customer.email, '이메일', 320);
  if (!email.includes('@')) {
    throw new OrderValidationError('이메일 형식이 올바르지 않습니다.');
  }

  const clientTotal = Number(pricing.total);
  if (!Number.isFinite(clientTotal) || clientTotal < 0) {
    throw new OrderValidationError('주문 금액 형식이 올바르지 않습니다.');
  }

  const orderId = normalizeRequiredText(paypal.orderId, 'PayPal 주문 ID', 64);
  const captureId =
    typeof paypal.captureId === 'string' && paypal.captureId.trim()
      ? paypal.captureId.trim()
      : null;
  if (captureId && !/^[A-Za-z0-9_-]{6,64}$/.test(captureId)) {
    throw new OrderValidationError('PayPal capture ID 형식이 올바르지 않습니다.');
  }

  const guestLookupPassword =
    channel === 'guest' && typeof payload.guestLookupPassword === 'string'
      ? payload.guestLookupPassword.trim()
      : null;
  if (channel === 'guest' && (!guestLookupPassword || guestLookupPassword.length < 4 || guestLookupPassword.length > 128)) {
    throw new OrderValidationError('비회원 주문조회 비밀번호는 4자 이상 128자 이하로 입력해 주세요.');
  }

  return {
    transactionId: normalizeTransactionId(payload.transactionId),
    channel,
    guestLookupPassword,
    customer: {
      name: normalizeRequiredText(customer.name, '이름', 100),
      email,
      phone: normalizeRequiredText(customer.phone, '핸드폰 번호', 50),
      country: normalizeRequiredText(customer.country, '국가/구역', 100),
      address: normalizeRequiredText(customer.address, '주소', 500),
    },
    clientTotal,
    paypal: { orderId, captureId },
    items: parseItems(payload.items),
  };
}

function formatKrw(value: number) {
  return `${Math.round(value).toLocaleString('ko-KR')}원`;
}

function buildRawPayload(payload: PayPalOrderPayload) {
  return {
    ...payload,
    verification: 'paypal_server_api',
  };
}

function buildEmailText(payload: PayPalOrderPayload, guestOrderNumber: string | null) {
  const lines = payload.items.map((item, index) => {
    const sizeText = item.selectedSize ? ` / 사이즈 ${item.selectedSize}` : '';
    return `${index + 1}. ${item.name} (${item.category}${sizeText}) x${item.quantity} = ${formatKrw(item.lineTotal)}`;
  });

  return [
    '[PayPal 주문 접수]',
    `거래번호: ${payload.transactionId}`,
    `구매유형: ${payload.channel === 'member' ? '회원 구매' : '비회원 구매'}`,
    ...(guestOrderNumber ? [`비회원 주문조회 번호: ${guestOrderNumber}`] : []),
    '',
    '[PayPal 서버 검증 정보]',
    `Order ID: ${payload.paypal.orderId}`,
    `Capture ID: ${payload.paypal.captureId}`,
    `상태: ${payload.paypal.status}`,
    `결제 금액: ${payload.paypal.value} ${payload.paypal.currency}`,
    '',
    '[주문자 정보]',
    `이름: ${payload.customer.name}`,
    `이메일: ${payload.customer.email}`,
    `핸드폰: ${payload.customer.phone}`,
    `국가/구역: ${payload.customer.country}`,
    `주소: ${payload.customer.address}`,
    '',
    '[내부 금액(KRW)]',
    `상품합계: ${formatKrw(payload.pricing.subtotal)}`,
    `배송비: ${formatKrw(payload.pricing.shipping)}`,
    `세금: ${formatKrw(payload.pricing.tax)}`,
    `총액: ${formatKrw(payload.pricing.total)} (${payload.pricing.currency})`,
    '',
    '[주문 상품]',
    ...lines,
  ].join('\n');
}

async function sendOrderEmail(payload: PayPalOrderPayload, guestOrderNumber: string | null) {
  const resendApiKey = process.env.RESEND_API_KEY;
  if (!resendApiKey) {
    throw new Error('RESEND_API_KEY가 설정되어 있지 않습니다.');
  }

  const to = (process.env.ORDER_NOTIFICATION_EMAIL || DEFAULT_ORDER_RECEIVER_EMAIL).trim();
  const from = (process.env.ORDER_FROM_EMAIL || 'Enico Veck Orders <onboarding@resend.dev>').trim();
  const response = await fetch(RESEND_API_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: `[PayPal 주문] ${payload.channel === 'member' ? '회원' : '비회원'} ${payload.transactionId}`,
      text: buildEmailText(payload, guestOrderNumber),
      reply_to: payload.customer.email,
    }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    const responsePayload = (await response.json().catch(() => null)) as
      | { error?: { message?: string } }
      | null;
    throw new Error(responsePayload?.error?.message || '주문 메일 발송 API 응답 오류');
  }
}

async function findExistingOrder(
  serviceClient: SupabaseClient,
  transactionId: string,
  paypalOrderId: string,
) {
  const [byCode, byPayPalId] = await Promise.all([
    serviceClient
      .from('orders')
      .select('id, order_code, paypal_order_id, payment_status, guest_order_number, channel, customer_email, amount_total')
      .eq('payment_method', 'paypal')
      .eq('order_code', transactionId)
      .maybeSingle<ExistingPayPalOrder>(),
    serviceClient
      .from('orders')
      .select('id, order_code, paypal_order_id, payment_status, guest_order_number, channel, customer_email, amount_total')
      .eq('payment_method', 'paypal')
      .eq('paypal_order_id', paypalOrderId)
      .maybeSingle<ExistingPayPalOrder>(),
  ]);

  const error = byCode.error || byPayPalId.error;
  if (error) {
    if (error.code === '42P01') {
      throw new OrderValidationError('orders 테이블이 없습니다. sql/orders_setup.sql을 먼저 실행하세요.', 500);
    }
    console.error('PayPal existing order lookup failed', error);
    throw new OrderValidationError('기존 PayPal 주문 확인 중 오류가 발생했습니다.', 500);
  }

  if (byCode.data && byPayPalId.data && byCode.data.id !== byPayPalId.data.id) {
    throw new OrderValidationError('거래번호 또는 PayPal 주문 ID가 이미 사용되었습니다.', 409);
  }

  const existing = byCode.data || byPayPalId.data;
  if (
    existing &&
    (existing.order_code !== transactionId || existing.paypal_order_id !== paypalOrderId)
  ) {
    throw new OrderValidationError('거래번호 또는 PayPal 주문 ID가 이미 사용되었습니다.', 409);
  }
  return existing;
}

async function persistPendingOrder(
  serviceClient: SupabaseClient,
  payload: PayPalOrderBasePayload,
  paypalOrderId: string,
  guestMeta: PersistGuestMeta,
) {
  const { data, error } = await serviceClient
    .from('orders')
    .insert({
      order_code: payload.transactionId,
      channel: payload.channel,
      payment_method: 'paypal',
      payment_status: 'pending_payment',
      currency: payload.pricing.currency,
      amount_subtotal: payload.pricing.subtotal,
      amount_shipping: payload.pricing.shipping,
      amount_tax: payload.pricing.tax,
      amount_total: payload.pricing.total,
      customer_name: payload.customer.name,
      customer_email: payload.customer.email,
      customer_phone: payload.customer.phone,
      customer_country: payload.customer.country,
      customer_address: payload.customer.address,
      paypal_order_id: paypalOrderId,
      guest_order_number: guestMeta.guestOrderNumber,
      guest_password_hash: guestMeta.guestPasswordHash,
      shipping_status: 'preparing',
      items: payload.items,
      raw_payload: {
        stage: 'pending_paypal_capture',
        ...payload,
        paypal: { orderId: paypalOrderId },
      },
    })
    .select('id, order_code, paypal_order_id, payment_status, guest_order_number')
    .single<ExistingPayPalOrder>();

  if (!error && data) return data;
  if (error?.code === '23505') {
    const existing = await findExistingOrder(
      serviceClient,
      payload.transactionId,
      paypalOrderId,
    );
    if (existing) return existing;
  }
  if (error?.code === '42P01') {
    throw new OrderValidationError('orders 테이블이 없습니다. sql/orders_setup.sql을 먼저 실행하세요.', 500);
  }
  if (error?.code === '42703') {
    throw new OrderValidationError(
      'orders 테이블 컬럼이 최신이 아닙니다. sql/orders_setup.sql을 다시 실행해 주세요.',
      500,
    );
  }

  console.error('PayPal pending order insert failed', error);
  throw new OrderValidationError('PayPal 결제 준비 주문 저장 중 오류가 발생했습니다.', 500);
}

async function finalizeOrder(
  serviceClient: SupabaseClient,
  orderId: string,
  payload: PayPalOrderPayload,
) {
  const { data, error } = await serviceClient
    .from('orders')
    .update({
      payment_status: payload.paypal.status,
      paypal_capture_id: payload.paypal.captureId,
      paypal_currency: payload.paypal.currency,
      paypal_value: payload.paypal.value,
      raw_payload: buildRawPayload(payload),
    })
    .eq('id', orderId)
    .eq('payment_method', 'paypal')
    .select('id')
    .maybeSingle();

  if (!error && data?.id) return;
  if (error?.code === '23505') {
    throw new OrderValidationError('이미 처리된 PayPal 결제입니다.', 409);
  }
  console.error('PayPal order finalization failed', error);
  throw new OrderValidationError(
    'PayPal 결제는 완료되었지만 주문 확정에 실패했습니다. 거래번호로 관리자에게 문의해 주세요.',
    500,
  );
}

async function markPurchasedItemsSoldOut(
  serviceClient: SupabaseClient,
  payload: PayPalOrderPayload,
) {
  const productIds = extractPersistentProductIds(payload.items);
  if (productIds.length === 0) return;

  const snapshot = await fetchProductAvailabilitySnapshot(serviceClient, productIds);
  if (snapshot.rows.length !== productIds.length) {
    throw new Error('결제 완료 상품의 재고 정보를 모두 찾지 못했습니다.');
  }
  await markProductsSoldOut(serviceClient, snapshot.rows, {
    hasRawColumn: snapshot.hasRawColumn,
    orderCode: payload.transactionId,
    paymentMethod: 'paypal',
  });
  revalidateTag('storefront-products', 'max');
}

export async function POST(request: Request) {
  try {
    const parsed = parseRequestBody(await request.json());
    const authentication = await authenticateOrderRequest(request, parsed.channel);
    const serviceClient = createOrderServiceClient();
    const canonical = await buildCanonicalOrder(serviceClient, {
      items: parsed.items,
      customerCountry: parsed.customer.country,
      user: authentication.user,
      clientTotal: parsed.clientTotal,
    });
    const authenticatedEmail = authentication.user?.email?.trim();
    if (parsed.channel === 'member' && !authenticatedEmail) {
      throw new OrderValidationError('회원 계정 이메일을 확인할 수 없습니다.', 400);
    }

    const basePayload: PayPalOrderBasePayload = {
      transactionId: parsed.transactionId,
      channel: parsed.channel,
      customer: {
        ...parsed.customer,
        email: authenticatedEmail || parsed.customer.email,
      },
      pricing: canonical.pricing,
      items: canonical.items,
    };

    let pendingOrder = await findExistingOrder(
      serviceClient,
      basePayload.transactionId,
      parsed.paypal.orderId,
    );
    if (
      pendingOrder &&
      (pendingOrder.channel !== basePayload.channel ||
        pendingOrder.customer_email.trim().toLowerCase() !==
          basePayload.customer.email.trim().toLowerCase() ||
        Number(pendingOrder.amount_total) !== basePayload.pricing.total)
    ) {
      throw new OrderValidationError('기존 PayPal 주문 정보와 요청이 일치하지 않습니다.', 409);
    }
    if (pendingOrder?.payment_status.toUpperCase() === 'COMPLETED') {
      return NextResponse.json({
        ok: true,
        message: '이미 처리된 PayPal 주문입니다.',
        guestOrderNumber: pendingOrder.guest_order_number,
        alreadyProcessed: true,
      });
    }

    const newGuestMeta: PersistGuestMeta = {
      guestOrderNumber:
        basePayload.channel === 'guest' ? generateGuestOrderNumber() : null,
      guestPasswordHash:
        basePayload.channel === 'guest' && parsed.guestLookupPassword
          ? hashGuestLookupPassword(parsed.guestLookupPassword)
          : null,
    };

    const verifiedPayPal = await capturePayPalOrder(
      {
        orderId: parsed.paypal.orderId,
        expectedTotalKrw: canonical.pricing.total,
      },
      async () => {
        if (!pendingOrder) {
          pendingOrder = await persistPendingOrder(
            serviceClient,
            basePayload,
            parsed.paypal.orderId,
            newGuestMeta,
          );
        }
      },
    );

    if (!pendingOrder) {
      throw new OrderValidationError('PayPal 결제 준비 주문을 확인하지 못했습니다.', 500);
    }

    const payload: PayPalOrderPayload = {
      ...basePayload,
      paypal: verifiedPayPal,
    };
    await finalizeOrder(serviceClient, pendingOrder.id, payload);
    const guestOrderNumber = pendingOrder.guest_order_number;

    const [inventoryResult, emailResult] = await Promise.allSettled([
      markPurchasedItemsSoldOut(serviceClient, payload),
      sendOrderEmail(payload, guestOrderNumber),
    ]);
    if (inventoryResult.status === 'rejected') {
      console.error('PayPal inventory update failed', inventoryResult.reason);
    }
    if (emailResult.status === 'rejected') {
      console.error('PayPal order email failed', emailResult.reason);
    }

    const mailSent = emailResult.status === 'fulfilled';
    return NextResponse.json({
      ok: true,
      message: mailSent
        ? 'PayPal 주문 접수 및 메일 발송 완료'
        : 'PayPal 주문은 접수되었지만 알림 메일 발송에 실패했습니다.',
      guestOrderNumber,
      mailSent,
      inventorySynced: inventoryResult.status === 'fulfilled',
    });
  } catch (error) {
    if (!(error instanceof OrderValidationError)) {
      console.error('PayPal order processing failed', error);
    }
    return NextResponse.json(
      {
        message:
          error instanceof Error ? error.message : 'PayPal 주문 접수 중 서버 오류가 발생했습니다.',
      },
      { status: getOrderErrorStatus(error) },
    );
  }
}
