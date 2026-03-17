import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { revalidateTag } from 'next/cache';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { generateGuestOrderNumber } from '@/lib/orders/guestLookup';
import {
  buildNicepayFailureUrl,
  buildNicepaySuccessUrl,
  getNicepayApiBaseUrl,
  getNicepayPendingOrderCookieSameSite,
  NICEPAY_PENDING_ORDER_COOKIE,
  type NicepayPendingOrder,
  verifyNicepayPendingOrder,
} from '@/lib/orders/nicepay';
import {
  extractPersistentProductIds,
} from '@/lib/storefront/productAvailability';
import {
  fetchProductAvailabilitySnapshot,
  markProductsSoldOut,
} from '@/lib/storefront/productAvailabilityDb';

const DEFAULT_ORDER_RECEIVER_EMAIL = 'morba9850@gmail.com';
const RESEND_API_ENDPOINT = 'https://api.resend.com/emails';

type NicepayReturnParams = {
  authResultCode: string | null;
  authResultMsg: string | null;
  tid: string | null;
  clientId: string | null;
  orderId: string | null;
  amount: string | null;
  authToken: string | null;
  mallReserved: string | null;
  signature: string | null;
};

function getOrderServerConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || '';
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || '';
  const clientKey = process.env.NICEPAY_CLIENT_KEY?.trim() || '';
  const secretKey = process.env.NICEPAY_SECRET_KEY?.trim() || '';

  if (!url || !serviceRoleKey || !clientKey || !secretKey) {
    return null;
  }

  return { url, serviceRoleKey, clientKey, secretKey };
}

function formatKrw(value: number) {
  return `${Math.round(value).toLocaleString('ko-KR')}원`;
}

function normalizeText(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function buildRedirect(url: URL) {
  return NextResponse.redirect(url, { status: 303 });
}

function deletePendingOrderCookie(response: NextResponse) {
  response.cookies.set({
    name: NICEPAY_PENDING_ORDER_COOKIE,
    value: '',
    httpOnly: true,
    sameSite: getNicepayPendingOrderCookieSameSite(),
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  });
}

async function readReturnParams(request: Request): Promise<NicepayReturnParams> {
  const contentType = request.headers.get('content-type') || '';
  const fromParams = (params: URLSearchParams | FormData) => ({
    authResultCode: normalizeText(params.get('authResultCode')),
    authResultMsg: normalizeText(params.get('authResultMsg')),
    tid: normalizeText(params.get('tid')),
    clientId: normalizeText(params.get('clientId')),
    orderId: normalizeText(params.get('orderId')),
    amount: normalizeText(params.get('amount')),
    authToken: normalizeText(params.get('authToken')),
    mallReserved: normalizeText(params.get('mallReserved')),
    signature: normalizeText(params.get('signature')),
  });

  if (request.method === 'POST' && contentType.includes('application/x-www-form-urlencoded')) {
    return fromParams(await request.formData());
  }

  if (request.method === 'POST' && contentType.includes('multipart/form-data')) {
    return fromParams(await request.formData());
  }

  const url = new URL(request.url);
  return fromParams(url.searchParams);
}

function toNumber(value: unknown) {
  return typeof value === 'number' ? value : Number(value);
}

function isExpectedDigest(value: string | null | undefined) {
  if (!value) return false;
  return /^[a-fA-F0-9]{32,128}$/.test(value.trim());
}

function parsePendingOrderFromRawPayload(rawPayload: unknown): NicepayPendingOrder | null {
  if (!rawPayload || typeof rawPayload !== 'object') return null;

  const target = rawPayload as { pendingOrder?: unknown };
  if (!target.pendingOrder || typeof target.pendingOrder !== 'object') return null;

  const pendingOrder = target.pendingOrder as Partial<NicepayPendingOrder>;
  if (
    !normalizeText(pendingOrder.orderId) ||
    !normalizeText(pendingOrder.transactionId) ||
    !pendingOrder.customer ||
    !pendingOrder.pricing ||
    !pendingOrder.nicepay ||
    !Array.isArray(pendingOrder.items)
  ) {
    return null;
  }

  return pendingOrder as NicepayPendingOrder;
}

function validateApprovalPayload(
  approvalPayload: Record<string, unknown> | null,
  pendingOrder: NonNullable<ReturnType<typeof verifyNicepayPendingOrder>>,
  params: NicepayReturnParams,
) {
  const resultCode = normalizeText(approvalPayload?.resultCode);
  const status = normalizeText(approvalPayload?.status).toLowerCase();
  const tid = normalizeText(approvalPayload?.tid);
  const orderId = normalizeText(approvalPayload?.orderId);
  const currency = normalizeText(approvalPayload?.currency).toUpperCase();
  const goodsName = normalizeText(approvalPayload?.goodsName);
  const approvalSignature = normalizeText(approvalPayload?.signature);
  const amount = toNumber(approvalPayload?.amount);

  if (resultCode !== '0000') {
    return {
      ok: false as const,
      code: resultCode || 'approval_failed',
      message:
        normalizeText(approvalPayload?.resultMsg) || 'NICE 승인 응답의 resultCode가 0000이 아닙니다.',
    };
  }

  if (status !== 'paid') {
    return {
      ok: false as const,
      code: status || 'approval_status_invalid',
      message: 'NICE 승인 응답의 결제 상태가 paid가 아닙니다.',
    };
  }

  if (!Number.isFinite(amount) || Math.round(amount) !== pendingOrder.nicepay.amount) {
    return {
      ok: false as const,
      code: 'approval_amount_mismatch',
      message: 'NICE 승인 응답의 금액이 주문 금액과 일치하지 않습니다.',
    };
  }

  if (!tid || tid !== params.tid) {
    return {
      ok: false as const,
      code: 'approval_tid_mismatch',
      message: 'NICE 승인 응답의 tid가 인증 단계 응답과 일치하지 않습니다.',
    };
  }

  if (!orderId || orderId !== pendingOrder.orderId) {
    return {
      ok: false as const,
      code: 'approval_orderid_mismatch',
      message: 'NICE 승인 응답의 orderId가 주문 정보와 일치하지 않습니다.',
    };
  }

  if (currency && currency !== pendingOrder.pricing.currency) {
    return {
      ok: false as const,
      code: 'approval_currency_mismatch',
      message: 'NICE 승인 응답의 통화가 주문 통화와 일치하지 않습니다.',
    };
  }

  if (goodsName && goodsName !== pendingOrder.nicepay.goodsName) {
    return {
      ok: false as const,
      code: 'approval_goods_mismatch',
      message: 'NICE 승인 응답의 상품명이 주문 준비 정보와 일치하지 않습니다.',
    };
  }

  if (!isExpectedDigest(approvalSignature)) {
    return {
      ok: false as const,
      code: 'approval_signature_missing',
      message: 'NICE 승인 응답의 signature 형식이 올바르지 않습니다.',
    };
  }

  return { ok: true as const };
}

function buildRawPayload(
  pendingOrder: NonNullable<ReturnType<typeof verifyNicepayPendingOrder>>,
  params: NicepayReturnParams,
  approvalPayload: unknown,
) {
  return {
    transactionId: pendingOrder.transactionId,
    channel: pendingOrder.channel,
    guestLookupPassword: pendingOrder.channel === 'guest' ? '[REDACTED]' : null,
    customer: pendingOrder.customer,
    pricing: pendingOrder.pricing,
    items: pendingOrder.items,
    nicepay: {
      orderId: pendingOrder.orderId,
      tid: params.tid,
      clientId: params.clientId,
      authResultCode: params.authResultCode,
      authResultMsg: params.authResultMsg,
      amount: params.amount,
      mallReserved: params.mallReserved,
      signature: params.signature,
      approval: approvalPayload,
    },
  };
}

async function markPurchasedItemsSoldOut(
  serviceClient: SupabaseClient,
  pendingOrder: NonNullable<ReturnType<typeof verifyNicepayPendingOrder>>,
) {
  const productIds = extractPersistentProductIds(pendingOrder.items);
  if (productIds.length === 0) return;

  const snapshot = await fetchProductAvailabilitySnapshot(serviceClient, productIds);
  await markProductsSoldOut(serviceClient, snapshot.rows, {
    hasRawColumn: snapshot.hasRawColumn,
    orderCode: pendingOrder.transactionId,
    paymentMethod: 'nicepay',
  });

  revalidateTag('storefront-products', 'max');
}

function buildEmailText(
  pendingOrder: NonNullable<ReturnType<typeof verifyNicepayPendingOrder>>,
  guestOrderNumber: string | null,
  params: NicepayReturnParams,
  approvalPayload: Record<string, unknown> | null,
) {
  const lines = pendingOrder.items.map((item, index) => {
    const sizeText = item.selectedSize ? ` / 사이즈 ${item.selectedSize}` : '';
    return `${index + 1}. ${item.name} (${item.category}${sizeText}) x${item.quantity} = ${formatKrw(item.lineTotal)}`;
  });

  return [
    '[NICE Payments 주문 접수]',
    `거래번호: ${pendingOrder.transactionId}`,
    `구매유형: ${pendingOrder.channel === 'member' ? '회원 구매' : '비회원 구매'}`,
    ...(guestOrderNumber ? [`비회원 주문조회 번호: ${guestOrderNumber}`] : []),
    '',
    '[NICE 승인 정보]',
    `orderId: ${pendingOrder.orderId}`,
    `tid: ${params.tid || '-'}`,
    `clientId: ${params.clientId || '-'}`,
    `인증결과: ${params.authResultCode || '-'} / ${params.authResultMsg || '-'}`,
    `결제금액: ${params.amount || '-'} KRW`,
    `인증 signature: ${params.signature || '-'}`,
    `승인상태: ${normalizeText(approvalPayload?.status) || normalizeText(approvalPayload?.resultCode) || 'paid'}`,
    `승인 signature: ${normalizeText(approvalPayload?.signature) || '-'}`,
    '',
    '[주문자 정보]',
    `이름: ${pendingOrder.customer.name}`,
    `이메일: ${pendingOrder.customer.email}`,
    `핸드폰: ${pendingOrder.customer.phone}`,
    `국가/구역: ${pendingOrder.customer.country}`,
    `주소: ${pendingOrder.customer.address}`,
    '',
    '[내부 금액(KRW)]',
    `상품합계: ${formatKrw(pendingOrder.pricing.subtotal)}`,
    `배송비: ${formatKrw(pendingOrder.pricing.shipping)}`,
    `세금: ${formatKrw(pendingOrder.pricing.tax)}`,
    `총액: ${formatKrw(pendingOrder.pricing.total)} (${pendingOrder.pricing.currency})`,
    '',
    '[주문 상품]',
    ...lines,
  ].join('\n');
}

async function sendOrderEmail(
  pendingOrder: NonNullable<ReturnType<typeof verifyNicepayPendingOrder>>,
  guestOrderNumber: string | null,
  params: NicepayReturnParams,
  approvalPayload: Record<string, unknown> | null,
) {
  const resendApiKey = process.env.RESEND_API_KEY;
  if (!resendApiKey) {
    throw new Error('서버에 RESEND_API_KEY가 설정되어 있지 않습니다.');
  }

  const to = (process.env.ORDER_NOTIFICATION_EMAIL || DEFAULT_ORDER_RECEIVER_EMAIL).trim();
  const from = (process.env.ORDER_FROM_EMAIL || 'Enico Veck Orders <onboarding@resend.dev>').trim();
  const subject = `[NICE 주문] ${pendingOrder.channel === 'member' ? '회원' : '비회원'} ${pendingOrder.transactionId}`;

  const emailResponse = await fetch(RESEND_API_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject,
      text: buildEmailText(pendingOrder, guestOrderNumber, params, approvalPayload),
      reply_to: pendingOrder.customer.email,
    }),
  });

  if (!emailResponse.ok) {
    const payload = (await emailResponse.json().catch(() => null)) as
      | { error?: { message?: string } }
      | null;
    throw new Error(payload?.error?.message || '메일 발송 API 응답 오류');
  }
}

export async function GET(request: Request) {
  const failureUrl = buildNicepayFailureUrl(new URL(request.url).origin, {
    code: 'invalid_access',
    message: 'NICE 승인 리턴은 POST 요청으로만 처리됩니다.',
  });
  return buildRedirect(failureUrl);
}

export async function POST(request: Request) {
  const requestUrl = new URL(request.url);
  const config = getOrderServerConfig();

  if (!config) {
    const response = buildRedirect(
      buildNicepayFailureUrl(requestUrl.origin, {
        code: 'server_config_missing',
        message: 'NICEPAY / Supabase 서버 설정이 누락되었습니다.',
      }),
    );
    deletePendingOrderCookie(response);
    return response;
  }

  const params = await readReturnParams(request);
  const serviceClient = createClient(config.url, config.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const cookieStore = await cookies();
  let pendingOrder = verifyNicepayPendingOrder(
    cookieStore.get(NICEPAY_PENDING_ORDER_COOKIE)?.value,
    config.secretKey,
  );
  let pendingOrderRowId: string | null = null;

  const fallbackOrderCode = normalizeText(requestUrl.searchParams.get('orderCode'));
  if (!pendingOrder && fallbackOrderCode) {
    const fallbackLookup = await serviceClient
      .from('orders')
      .select('id, raw_payload')
      .eq('order_code', fallbackOrderCode)
      .eq('payment_method', 'nicepay')
      .eq('payment_status', 'pending_payment')
      .order('created_at', { ascending: false })
      .limit(1);

    if (fallbackLookup.error) {
      const response = buildRedirect(
        buildNicepayFailureUrl(requestUrl.origin, {
          code: 'pending_order_lookup_failed',
          message: fallbackLookup.error.message,
        }),
      );
      deletePendingOrderCookie(response);
      return response;
    }

    const fallbackRow = fallbackLookup.data?.[0];
    if (fallbackRow) {
      pendingOrder = parsePendingOrderFromRawPayload(fallbackRow.raw_payload);
      pendingOrderRowId = normalizeText(fallbackRow.id);
    }
  }

  if (!pendingOrder) {
    const response = buildRedirect(
      buildNicepayFailureUrl(requestUrl.origin, {
        code: 'pending_order_missing',
        message: '결제 준비 정보가 없어 NICE 승인을 이어갈 수 없습니다.',
      }),
    );
    deletePendingOrderCookie(response);
    return response;
  }

  if (params.authResultCode !== '0000') {
    const response = buildRedirect(
      buildNicepayFailureUrl(requestUrl.origin, {
        code: params.authResultCode || 'auth_failed',
        message: params.authResultMsg || 'NICE 인증 단계에서 결제가 실패했습니다.',
      }),
    );
    deletePendingOrderCookie(response);
    return response;
  }

  if (
    !params.tid ||
    !params.authToken ||
    !params.orderId ||
    !params.clientId ||
    !params.amount ||
    !params.signature
  ) {
    const response = buildRedirect(
      buildNicepayFailureUrl(requestUrl.origin, {
        code: 'return_params_missing',
        message: 'NICE 승인에 필요한 리턴 파라미터가 부족합니다.',
      }),
    );
    deletePendingOrderCookie(response);
    return response;
  }

  if (!isExpectedDigest(params.signature)) {
    const response = buildRedirect(
      buildNicepayFailureUrl(requestUrl.origin, {
        code: 'return_signature_invalid',
        message: 'NICE 인증 응답의 signature 형식이 올바르지 않습니다.',
      }),
    );
    deletePendingOrderCookie(response);
    return response;
  }

  if (
    pendingOrder.orderId !== params.orderId ||
    config.clientKey !== params.clientId ||
    pendingOrder.nicepay.amount !== Number(params.amount)
  ) {
    const response = buildRedirect(
      buildNicepayFailureUrl(requestUrl.origin, {
        code: 'payment_data_mismatch',
        message: 'NICE 승인 데이터와 주문 준비 정보가 일치하지 않습니다.',
      }),
    );
    deletePendingOrderCookie(response);
    return response;
  }

  if (!pendingOrderRowId) {
    const pendingLookup = await serviceClient
      .from('orders')
      .select('id')
      .eq('order_code', pendingOrder.transactionId)
      .eq('payment_method', 'nicepay')
      .eq('payment_status', 'pending_payment')
      .order('created_at', { ascending: false })
      .limit(1);

    if (!pendingLookup.error) {
      pendingOrderRowId = normalizeText(pendingLookup.data?.[0]?.id);
    }
  }

  const existingOrder = await serviceClient
    .from('orders')
    .select('id, guest_order_number')
    .eq('order_code', pendingOrder.transactionId)
    .eq('payment_method', 'nicepay')
    .eq('payment_status', 'paid')
    .limit(1)
    .maybeSingle();

  if (existingOrder.data?.id) {
    const response = buildRedirect(
      buildNicepaySuccessUrl(requestUrl.origin, {
        orderCode: pendingOrder.transactionId,
        guestOrderNumber: existingOrder.data.guest_order_number,
        channel: pendingOrder.channel,
      }),
    );
    deletePendingOrderCookie(response);
    return response;
  }

  try {
    const approvalResponse = await fetch(
      `${getNicepayApiBaseUrl(config.clientKey)}/v1/payments/${encodeURIComponent(params.tid)}`,
      {
        method: 'POST',
        cache: 'no-store',
        headers: {
          Authorization: `Basic ${Buffer.from(`${config.clientKey}:${config.secretKey}`).toString('base64')}`,
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(10000),
        body: JSON.stringify({
          amount: pendingOrder.nicepay.amount,
        }),
      },
    );

    const approvalPayload = (await approvalResponse.json().catch(() => null)) as
      | Record<string, unknown>
      | null;

    if (!approvalResponse.ok) {
      const failureResponse = buildRedirect(
        buildNicepayFailureUrl(requestUrl.origin, {
          code:
            normalizeText(approvalPayload?.resultCode) ||
            normalizeText(approvalPayload?.code) ||
            'approval_failed',
          message:
            normalizeText(approvalPayload?.resultMsg) ||
            normalizeText(approvalPayload?.message) ||
            'NICE 서버 승인에 실패했습니다.',
        }),
      );
      deletePendingOrderCookie(failureResponse);
      return failureResponse;
    }

    const approvalValidation = validateApprovalPayload(approvalPayload, pendingOrder, params);
    if (!approvalValidation.ok) {
      const failureResponse = buildRedirect(
        buildNicepayFailureUrl(requestUrl.origin, {
          code: approvalValidation.code,
          message: approvalValidation.message,
        }),
      );
      deletePendingOrderCookie(failureResponse);
      return failureResponse;
    }

    const guestOrderNumber =
      pendingOrder.channel === 'guest' ? generateGuestOrderNumber() : null;
    const persistPayload = {
      order_code: pendingOrder.transactionId,
      channel: pendingOrder.channel,
      payment_method: 'nicepay',
      payment_status: 'paid',
      currency: pendingOrder.pricing.currency,
      amount_subtotal: Math.round(pendingOrder.pricing.subtotal),
      amount_shipping: Math.round(pendingOrder.pricing.shipping),
      amount_tax: Math.round(pendingOrder.pricing.tax),
      amount_total: Math.round(pendingOrder.pricing.total),
      customer_name: pendingOrder.customer.name,
      customer_email: pendingOrder.customer.email,
      customer_phone: pendingOrder.customer.phone,
      customer_country: pendingOrder.customer.country,
      customer_address: pendingOrder.customer.address,
      guest_order_number: guestOrderNumber,
      guest_password_hash: pendingOrder.guestPasswordHash,
      shipping_status: 'preparing',
      items: pendingOrder.items,
      raw_payload: buildRawPayload(pendingOrder, params, approvalPayload),
    };

    const persistResult = pendingOrderRowId
      ? await serviceClient
          .from('orders')
          .update(persistPayload)
          .eq('id', pendingOrderRowId)
          .select('id, order_code, payment_method, payment_status')
          .maybeSingle()
      : await serviceClient
          .from('orders')
          .insert(persistPayload)
          .select('id, order_code, payment_method, payment_status')
          .maybeSingle();

    if (persistResult.error) {
      if (persistResult.error.code === '42P01') {
        throw new Error('orders 테이블이 없습니다. sql/orders_setup.sql을 먼저 실행하세요.');
      }
      if (
        persistResult.error.code === '23514' ||
        persistResult.error.message.toLowerCase().includes('payment_method')
      ) {
        throw new Error(
          'orders 결제수단 제약조건이 최신이 아닙니다. sql/orders_setup.sql을 다시 실행해 주세요.',
        );
      }
      if (persistResult.error.code === '42703') {
        throw new Error(
          'orders 테이블 컬럼이 최신이 아닙니다. sql/orders_setup.sql을 다시 실행해 주세요.',
        );
      }
      throw new Error(persistResult.error.message);
    }

    if (!persistResult.data?.id) {
      throw new Error('NICE 승인 후 주문 저장 결과를 확인하지 못했습니다.');
    }

    try {
      await markPurchasedItemsSoldOut(serviceClient, pendingOrder);
    } catch (error) {
      console.error('Failed to mark products sold out after NICE approval', error);
    }

    let mailFailed = false;
    try {
      await sendOrderEmail(pendingOrder, guestOrderNumber, params, approvalPayload);
    } catch (error) {
      mailFailed = true;
      console.error('NICE order email failed', error);
    }

    const successResponse = buildRedirect(
      buildNicepaySuccessUrl(requestUrl.origin, {
        orderCode: pendingOrder.transactionId,
        guestOrderNumber,
        channel: pendingOrder.channel,
        mailFailed,
      }),
    );
    deletePendingOrderCookie(successResponse);
    return successResponse;
  } catch (error) {
    const response = buildRedirect(
      buildNicepayFailureUrl(requestUrl.origin, {
        code: 'server_approval_failed',
        message:
          error instanceof Error ? error.message : 'NICE 결제 승인 처리 중 오류가 발생했습니다.',
      }),
    );
    deletePendingOrderCookie(response);
    return response;
  }
}
