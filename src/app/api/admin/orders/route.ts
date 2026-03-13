import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { cancelNicepayOrder } from '@/lib/orders/nicepayCancel';
import { extractPaymentReceiptUrl } from '@/lib/orders/rawPayload';

const PRIMARY_ADMIN_EMAIL = 'morba9850@gmail.com';
const DEFAULT_ORDER_RECEIVER_EMAIL = 'morba9850@gmail.com';
const RESEND_API_ENDPOINT = 'https://api.resend.com/emails';
const ORDER_SELECT =
  'id, order_code, guest_order_number, channel, payment_method, payment_status, currency, amount_subtotal, amount_shipping, amount_tax, amount_total, customer_name, customer_email, customer_phone, customer_country, customer_address, bank_name, bank_account_number, paypal_order_id, paypal_capture_id, paypal_currency, paypal_value, items, shipping_status, shipping_company, tracking_number, shipping_note, shipped_at, delivered_at, raw_payload, created_at, updated_at';

type ShippingStatus = 'preparing' | 'shipping' | 'delivered';
type PaymentStatus =
  | 'pending_transfer'
  | 'transfer_confirmed'
  | 'refund_pending'
  | 'captured'
  | 'completed'
  | 'paid'
  | 'cancelled';

type AdminAuthResult =
  | {
      ok: true;
      serviceClient: SupabaseClient;
    }
  | {
      ok: false;
      response: NextResponse;
    };

type OrderRow = {
  id: string;
  order_code: string | null;
  guest_order_number: string | null;
  channel: string | null;
  payment_method: string | null;
  payment_status: string | null;
  currency: string | null;
  amount_subtotal: number | string | null;
  amount_shipping: number | string | null;
  amount_tax: number | string | null;
  amount_total: number | string | null;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  customer_country: string | null;
  customer_address: string | null;
  bank_name: string | null;
  bank_account_number: string | null;
  paypal_order_id: string | null;
  paypal_capture_id: string | null;
  paypal_currency: string | null;
  paypal_value: string | null;
  items: unknown;
  raw_payload: unknown;
  shipping_status: string | null;
  shipping_company: string | null;
  tracking_number: string | null;
  shipping_note: string | null;
  shipped_at: string | null;
  delivered_at: string | null;
  created_at: string | null;
  updated_at: string | null;
};

function getServerConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anonKey || !serviceRoleKey) return null;
  return { url, anonKey, serviceRoleKey };
}

function normalizeText(value: unknown) {
  if (typeof value !== 'string') return '';
  return value.trim();
}

function normalizeNullableText(value: unknown) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeNumber(value: unknown) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function normalizeItems(value: unknown) {
  if (Array.isArray(value)) {
    return value;
  }

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      return [];
    }
  }

  return [];
}

function normalizeShippingStatus(value: unknown): ShippingStatus | null {
  const normalized = normalizeText(value).toLowerCase();
  if (normalized === 'preparing' || normalized === 'shipping' || normalized === 'delivered') {
    return normalized;
  }
  return null;
}

function normalizePaymentStatus(value: unknown): PaymentStatus | null {
  const normalized = normalizeText(value).toLowerCase();
  if (
    normalized === 'pending_transfer' ||
    normalized === 'transfer_confirmed' ||
    normalized === 'refund_pending' ||
    normalized === 'paid' ||
    normalized === 'captured' ||
    normalized === 'completed' ||
    normalized === 'cancelled'
  ) {
    return normalized;
  }
  return null;
}

function mapOrderRow(row: OrderRow) {
  return {
    id: row.id,
    orderCode: normalizeText(row.order_code),
    guestOrderNumber: normalizeText(row.guest_order_number),
    channel: normalizeText(row.channel),
    paymentMethod: normalizeText(row.payment_method),
    paymentStatus: normalizeText(row.payment_status),
    currency: normalizeText(row.currency || 'KRW'),
    amountSubtotal: normalizeNumber(row.amount_subtotal),
    amountShipping: normalizeNumber(row.amount_shipping),
    amountTax: normalizeNumber(row.amount_tax),
    amountTotal: normalizeNumber(row.amount_total),
    customerName: normalizeText(row.customer_name),
    customerEmail: normalizeText(row.customer_email),
    customerPhone: normalizeText(row.customer_phone),
    customerCountry: normalizeText(row.customer_country),
    customerAddress: normalizeText(row.customer_address),
    bankName: normalizeText(row.bank_name),
    bankAccountNumber: normalizeText(row.bank_account_number),
    paypalOrderId: normalizeText(row.paypal_order_id),
    paypalCaptureId: normalizeText(row.paypal_capture_id),
    paypalCurrency: normalizeText(row.paypal_currency),
    paypalValue: normalizeText(row.paypal_value),
    paymentReceiptUrl: extractPaymentReceiptUrl(row.raw_payload),
    items: normalizeItems(row.items),
    shippingStatus: normalizeShippingStatus(row.shipping_status) || 'preparing',
    shippingCompany: normalizeText(row.shipping_company),
    trackingNumber: normalizeText(row.tracking_number),
    shippingNote: normalizeText(row.shipping_note),
    shippedAt: row.shipped_at,
    deliveredAt: row.delivered_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mergeRefundPendingRawPayload(rawPayloadValue: unknown, reason: string, actor: 'admin') {
  const rawPayload =
    rawPayloadValue && typeof rawPayloadValue === 'object' && !Array.isArray(rawPayloadValue)
      ? (rawPayloadValue as Record<string, unknown>)
      : {};
  const refundRequestedAt = new Date().toISOString();

  return {
    ...rawPayload,
    refundRequestedAt,
    refundRequestedBy: actor,
    refundReason: reason,
    refundStatus: 'pending',
    cancellation: {
      refundRequestedAt,
      refundRequestedBy: actor,
      reason,
      status: 'pending',
    },
  };
}

function getCancelErrorStatus(error: unknown) {
  const message = error instanceof Error ? error.message : '';
  if (
    message.includes('이미 ') ||
    message.includes('배송이 시작된') ||
    message.includes('지원하지 않습니다') ||
    message.includes('결제완료 상태') ||
    message.includes('환불 진행 중')
  ) {
    return 400;
  }
  return 500;
}

async function sendAdminCancelNotificationEmail(order: OrderRow, reason: string) {
  const resendApiKey = process.env.RESEND_API_KEY?.trim() || '';
  if (!resendApiKey) {
    throw new Error('서버에 RESEND_API_KEY가 설정되어 있지 않습니다.');
  }

  const to = (process.env.ORDER_NOTIFICATION_EMAIL || DEFAULT_ORDER_RECEIVER_EMAIL).trim();
  const from = (process.env.ORDER_FROM_EMAIL || 'Enico Veck Orders <onboarding@resend.dev>').trim();
  const orderCode = normalizeText(order.order_code) || order.id;
  const paymentMethod =
    normalizeText(order.payment_method).toLowerCase() === 'bank_transfer'
      ? '계좌이체'
      : normalizeText(order.payment_method) || '-';

  const subject = `[주문취소] 관리자 ${orderCode}`;
  const text = [
    '[관리자 주문 취소 알림]',
    `주문번호: ${orderCode}`,
    `취소 요청자: 관리자`,
    `취소 사유: ${reason}`,
    `결제수단: ${paymentMethod}`,
    `결제상태: ${normalizeText(order.payment_status) || '-'}`,
    `주문자: ${normalizeText(order.customer_name) || '-'}`,
    `이메일: ${normalizeText(order.customer_email) || '-'}`,
    `연락처: ${normalizeText(order.customer_phone) || '-'}`,
    `총 결제금액: ${normalizeNumber(order.amount_total).toLocaleString('ko-KR')}원`,
  ].join('\n');

  const response = await fetch(RESEND_API_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject,
      text,
      reply_to: normalizeText(order.customer_email) || undefined,
    }),
  });

  const responsePayload = (await response.json().catch(() => null)) as
    | { error?: { message?: string } }
    | null;

  if (!response.ok) {
    throw new Error(responsePayload?.error?.message || '취소 메일 발송 API 응답 오류');
  }
}

async function authenticateAdmin(request: Request): Promise<AdminAuthResult> {
  const config = getServerConfig();
  if (!config) {
    return {
      ok: false,
      response: NextResponse.json(
        { message: 'Supabase server config is missing.' },
        { status: 500 },
      ),
    };
  }

  const authHeader = request.headers.get('authorization') || '';
  const token = authHeader.toLowerCase().startsWith('bearer ')
    ? authHeader.slice(7).trim()
    : '';
  if (!token) {
    return {
      ok: false,
      response: NextResponse.json({ message: 'Unauthorized.' }, { status: 401 }),
    };
  }

  const anonClient = createClient(config.url, config.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const {
    data: { user },
    error,
  } = await anonClient.auth.getUser(token);

  if (error || !user) {
    return {
      ok: false,
      response: NextResponse.json({ message: 'Unauthorized.' }, { status: 401 }),
    };
  }

  const normalizedEmail = normalizeText(user.email || '').toLowerCase();
  if (normalizedEmail !== PRIMARY_ADMIN_EMAIL) {
    return {
      ok: false,
      response: NextResponse.json({ message: 'Forbidden.' }, { status: 403 }),
    };
  }

  const serviceClient = createClient(config.url, config.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return { ok: true, serviceClient };
}

export async function GET(request: Request) {
  const auth = await authenticateAdmin(request);
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const limitParam = Number(url.searchParams.get('limit') || 200);
  const limit = Number.isFinite(limitParam)
    ? Math.max(1, Math.min(500, Math.floor(limitParam)))
    : 200;

  const { data, error } = await auth.serviceClient
    .from('orders')
    .select(ORDER_SELECT)
    .neq('payment_status', 'pending_payment')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    if (error.code === '42P01') {
      return NextResponse.json(
        { message: 'orders 테이블이 없습니다. sql/orders_setup.sql을 실행하세요.' },
        { status: 500 },
      );
    }
    if (error.code === '42703') {
      return NextResponse.json(
        { message: 'orders 테이블 컬럼이 최신이 아닙니다. sql/orders_setup.sql을 다시 실행하세요.' },
        { status: 500 },
      );
    }
    return NextResponse.json(
      { message: `주문 목록 조회 실패: ${error.message}` },
      { status: 500 },
    );
  }

  const orders = ((data || []) as OrderRow[]).map((row) => mapOrderRow(row));
  return NextResponse.json({ orders });
}

export async function PATCH(request: Request) {
  const auth = await authenticateAdmin(request);
  if (!auth.ok) return auth.response;

  let payload: {
    id?: string;
    paymentStatus?: string;
    shippingStatus?: string;
    shippingCompany?: string;
    trackingNumber?: string;
    shippingNote?: string;
  } = {};

  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return NextResponse.json({ message: '잘못된 요청 본문입니다.' }, { status: 400 });
  }

  const id = normalizeText(payload.id);
  if (!id) {
    return NextResponse.json({ message: '수정 대상 id가 필요합니다.' }, { status: 400 });
  }

  const requestedPaymentStatus =
    typeof payload.paymentStatus === 'string'
      ? normalizePaymentStatus(payload.paymentStatus)
      : null;

  if (typeof payload.paymentStatus === 'string' && !requestedPaymentStatus) {
    return NextResponse.json(
      {
        message:
          'paymentStatus는 pending_transfer/transfer_confirmed/refund_pending/paid/captured/completed/cancelled 중 하나여야 합니다.',
      },
      { status: 400 },
    );
  }

  const requestedShippingStatus =
    typeof payload.shippingStatus === 'string'
      ? normalizeShippingStatus(payload.shippingStatus)
      : null;

  if (typeof payload.shippingStatus === 'string' && !requestedShippingStatus) {
    return NextResponse.json(
      { message: 'shippingStatus는 preparing/shipping/delivered 중 하나여야 합니다.' },
      { status: 400 },
    );
  }

  const { data: existing, error: existingError } = await auth.serviceClient
    .from('orders')
    .select('id, shipping_status, shipped_at, delivered_at')
    .eq('id', id)
    .maybeSingle();

  if (existingError) {
    return NextResponse.json(
      { message: `주문 조회 실패: ${existingError.message}` },
      { status: 500 },
    );
  }

  if (!existing) {
    return NextResponse.json({ message: '대상 주문이 없습니다.' }, { status: 404 });
  }

  const nowIso = new Date().toISOString();
  const nextStatus = requestedShippingStatus;

  const updatePayload: Record<string, unknown> = {
    updated_at: nowIso,
    shipping_company: normalizeNullableText(payload.shippingCompany),
    tracking_number: normalizeNullableText(payload.trackingNumber),
    shipping_note: normalizeNullableText(payload.shippingNote),
  };

  if (requestedPaymentStatus) {
    updatePayload.payment_status = requestedPaymentStatus;
  }

  if (nextStatus) {
    updatePayload.shipping_status = nextStatus;

    if (nextStatus === 'preparing') {
      updatePayload.shipped_at = null;
      updatePayload.delivered_at = null;
    } else if (nextStatus === 'shipping') {
      updatePayload.shipped_at = existing.shipped_at || nowIso;
      updatePayload.delivered_at = null;
    } else if (nextStatus === 'delivered') {
      updatePayload.shipped_at = existing.shipped_at || nowIso;
      updatePayload.delivered_at = nowIso;
    }
  }

  const { data, error } = await auth.serviceClient
    .from('orders')
    .update(updatePayload)
    .eq('id', id)
    .select(ORDER_SELECT)
    .maybeSingle();

  if (error) {
    if (error.code === '42P01') {
      return NextResponse.json(
        { message: 'orders 테이블이 없습니다. sql/orders_setup.sql을 실행하세요.' },
        { status: 500 },
      );
    }
    if (error.code === '42703') {
      return NextResponse.json(
        { message: 'orders 테이블 컬럼이 최신이 아닙니다. sql/orders_setup.sql을 다시 실행하세요.' },
        { status: 500 },
      );
    }
    return NextResponse.json(
      { message: `배송 정보 저장 실패: ${error.message}` },
      { status: 500 },
    );
  }

  if (!data) {
    return NextResponse.json({ message: '주문 갱신 결과를 찾을 수 없습니다.' }, { status: 404 });
  }

  return NextResponse.json({
    message: '주문 상태/배송 정보가 저장되었습니다.',
    order: mapOrderRow(data as OrderRow),
  });
}

export async function POST(request: Request) {
  const auth = await authenticateAdmin(request);
  if (!auth.ok) return auth.response;

  let payload: {
    id?: string;
    action?: string;
    reason?: string;
  } = {};

  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return NextResponse.json({ message: '잘못된 요청 본문입니다.' }, { status: 400 });
  }

  const id = normalizeText(payload.id);
  const action = normalizeText(payload.action).toLowerCase();
  const reason = normalizeText(payload.reason) || 'admin_cancel';

  if (!id) {
    return NextResponse.json({ message: '취소 대상 id가 필요합니다.' }, { status: 400 });
  }

  if (action !== 'cancel_payment') {
    return NextResponse.json({ message: '지원하지 않는 관리자 주문 액션입니다.' }, { status: 400 });
  }

  const { data: existing, error: existingError } = await auth.serviceClient
    .from('orders')
    .select(ORDER_SELECT)
    .eq('id', id)
    .maybeSingle();

  if (existingError) {
    return NextResponse.json(
      { message: `주문 조회 실패: ${existingError.message}` },
      { status: 500 },
    );
  }

  if (!existing) {
    return NextResponse.json({ message: '대상 주문이 없습니다.' }, { status: 404 });
  }

  try {
    const paymentMethod = normalizeText(existing.payment_method).toLowerCase();
    const paymentStatus = normalizeText(existing.payment_status).toLowerCase();
    const shippingStatus = normalizeText(existing.shipping_status).toLowerCase();
    let updatedOrder: OrderRow;

    if (paymentMethod === 'nicepay') {
      updatedOrder = await cancelNicepayOrder<OrderRow>({
        serviceClient: auth.serviceClient,
        order: existing as OrderRow,
        actor: 'admin',
        reason,
        selectQuery: ORDER_SELECT,
      });
    } else if (paymentMethod === 'bank_transfer') {
      if (paymentStatus === 'refund_pending') {
        return NextResponse.json({ message: '이미 환불 진행 중인 주문입니다.' }, { status: 400 });
      }

      if (paymentStatus === 'cancelled') {
        return NextResponse.json({ message: '이미 환불 완료된 주문입니다.' }, { status: 400 });
      }

      if (shippingStatus && shippingStatus !== 'preparing') {
        return NextResponse.json(
          { message: '배송이 시작된 주문은 취소할 수 없습니다.' },
          { status: 400 },
        );
      }

      const { data, error } = await auth.serviceClient
        .from('orders')
        .update({
          payment_status: 'refund_pending',
          updated_at: new Date().toISOString(),
          raw_payload: mergeRefundPendingRawPayload(existing.raw_payload, reason, 'admin'),
        })
        .eq('id', id)
        .select(ORDER_SELECT)
        .maybeSingle();

      if (error) {
        throw new Error(error.message);
      }

      if (!data) {
        throw new Error('취소 후 주문 정보를 다시 불러오지 못했습니다.');
      }

      updatedOrder = data as OrderRow;

      try {
        await sendAdminCancelNotificationEmail(updatedOrder, reason);
      } catch (error) {
        console.error('Failed to send admin cancel notification email', error);
      }
    } else {
      return NextResponse.json(
        { message: '관리자 주문취소는 NICE Payments와 계좌이체 주문만 지원합니다.' },
        { status: 400 },
      );
    }

    return NextResponse.json({
      message:
        paymentMethod === 'nicepay'
          ? '카드결제 취소가 완료되고 관리자 메일로도 정보가 전송됩니다.'
          : '환불 요청 상태로 변경되고 관리자 메일로도 정보가 전송됩니다.',
      order: mapOrderRow(updatedOrder),
    });
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error ? error.message : '관리자 결제 취소 처리 중 오류가 발생했습니다.',
      },
      { status: getCancelErrorStatus(error) },
    );
  }
}

export async function DELETE(request: Request) {
  const auth = await authenticateAdmin(request);
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const id = normalizeText(url.searchParams.get('id'));

  if (!id) {
    return NextResponse.json({ message: '삭제 대상 id가 필요합니다.' }, { status: 400 });
  }

  const { data: existing, error: existingError } = await auth.serviceClient
    .from('orders')
    .select('id')
    .eq('id', id)
    .maybeSingle();

  if (existingError) {
    return NextResponse.json(
      { message: `주문 조회 실패: ${existingError.message}` },
      { status: 500 },
    );
  }

  if (!existing) {
    return NextResponse.json({ message: '대상 주문이 없습니다.' }, { status: 404 });
  }

  const { error } = await auth.serviceClient
    .from('orders')
    .delete()
    .eq('id', id);

  if (error) {
    if (error.code === '42P01') {
      return NextResponse.json(
        { message: 'orders 테이블이 없습니다. sql/orders_setup.sql을 실행하세요.' },
        { status: 500 },
      );
    }
    return NextResponse.json(
      { message: `주문 삭제 실패: ${error.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({
    message: '주문이 삭제되었습니다.',
    id,
  });
}
