import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { cancelNicepayOrder } from '@/lib/orders/nicepayCancel';
import { extractPaymentReceiptUrl } from '@/lib/orders/rawPayload';

const DEFAULT_ORDER_RECEIVER_EMAIL = 'morba9850@gmail.com';
const RESEND_API_ENDPOINT = 'https://api.resend.com/emails';

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

const ORDER_SELECT =
  'id, order_code, guest_order_number, channel, payment_method, payment_status, currency, amount_subtotal, amount_shipping, amount_tax, amount_total, customer_name, customer_email, customer_phone, customer_country, customer_address, items, raw_payload, shipping_status, shipping_company, tracking_number, shipping_note, shipped_at, delivered_at, created_at, updated_at';

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

function buildRefundPendingRawPayload(rawPayloadValue: unknown, reason: string, actor: 'member') {
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

async function sendMemberCancelNotificationEmail(order: OrderRow, reason: string) {
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

  const subject = `[주문취소] 회원 ${orderCode}`;
  const text = [
    '[회원 주문 취소 알림]',
    `주문번호: ${orderCode}`,
    `취소 요청자: 회원`,
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
    paymentReceiptUrl: extractPaymentReceiptUrl(row.raw_payload),
    items: normalizeItems(row.items),
    shippingStatus: normalizeText(row.shipping_status || 'preparing'),
    shippingCompany: normalizeText(row.shipping_company),
    trackingNumber: normalizeText(row.tracking_number),
    shippingNote: normalizeText(row.shipping_note),
    shippedAt: row.shipped_at,
    deliveredAt: row.delivered_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function POST(request: Request) {
  const config = getServerConfig();
  if (!config) {
    return NextResponse.json(
      { message: 'Supabase server config is missing.' },
      { status: 500 },
    );
  }

  const authHeader = request.headers.get('authorization') || '';
  const token = authHeader.toLowerCase().startsWith('bearer ')
    ? authHeader.slice(7).trim()
    : '';
  if (!token) {
    return NextResponse.json({ message: 'Unauthorized.' }, { status: 401 });
  }

  let payload: { id?: string; reason?: string } = {};
  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return NextResponse.json({ message: '잘못된 요청 본문입니다.' }, { status: 400 });
  }

  const orderId = normalizeText(payload.id);
  if (!orderId) {
    return NextResponse.json({ message: '취소 대상 id가 필요합니다.' }, { status: 400 });
  }

  const anonClient = createClient(config.url, config.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const {
    data: { user },
    error: userError,
  } = await anonClient.auth.getUser(token);

  if (userError || !user) {
    return NextResponse.json({ message: 'Unauthorized.' }, { status: 401 });
  }

  const targetEmail = normalizeText(user.email || '');
  if (!targetEmail) {
    return NextResponse.json({ message: '회원 이메일이 없습니다.' }, { status: 400 });
  }

  const serviceClient = createClient(config.url, config.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: existing, error: existingError } = await serviceClient
    .from('orders')
    .select(ORDER_SELECT)
    .eq('id', orderId)
    .ilike('customer_email', targetEmail)
    .maybeSingle();

  if (existingError) {
    return NextResponse.json(
      { message: `주문 조회 실패: ${existingError.message}` },
      { status: 500 },
    );
  }

  if (!existing) {
    return NextResponse.json({ message: '취소 가능한 회원 주문을 찾지 못했습니다.' }, { status: 404 });
  }

  try {
    const paymentMethod = normalizeText(existing.payment_method).toLowerCase();
    const paymentStatus = normalizeText(existing.payment_status).toLowerCase();
    const shippingStatus = normalizeText(existing.shipping_status).toLowerCase();
    const cancelReason = normalizeText(payload.reason) || 'member_cancel';
    let updatedOrder: OrderRow;

    if (paymentMethod === 'nicepay') {
      updatedOrder = await cancelNicepayOrder<OrderRow>({
        serviceClient,
        order: existing as OrderRow,
        actor: 'member',
        reason: cancelReason,
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
          { message: '배송이 시작된 주문은 온라인에서 취소할 수 없습니다.' },
          { status: 400 },
        );
      }

      const { data, error } = await serviceClient
        .from('orders')
        .update({
          payment_status: 'refund_pending',
          updated_at: new Date().toISOString(),
          raw_payload: buildRefundPendingRawPayload(existing.raw_payload, cancelReason, 'member'),
        })
        .eq('id', orderId)
        .select(ORDER_SELECT)
        .maybeSingle();

      if (error) {
        throw new Error(error.message);
      }

      if (!data) {
        throw new Error('환불 요청 후 주문 정보를 다시 불러오지 못했습니다.');
      }

      updatedOrder = data as OrderRow;

      try {
        await sendMemberCancelNotificationEmail(updatedOrder, cancelReason);
      } catch (error) {
        console.error('Failed to send member cancel notification email', error);
      }
    } else {
      return NextResponse.json(
        {
          message:
            '이 결제수단은 회원 자동 환불을 지원하지 않습니다. 관리자에게 문의해 주세요.',
        },
        { status: 400 },
      );
    }

    return NextResponse.json({
      message:
        paymentMethod === 'nicepay'
          ? '카드결제 취소가 완료되었습니다. 관리자 메일에도 취소 정보가 전송됩니다.'
          : '환불 요청이 접수되었습니다. 관리자 메일에도 취소 정보가 전송됩니다.',
      order: mapOrderRow(updatedOrder),
    });
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error ? error.message : '주문취소 처리 중 오류가 발생했습니다.',
      },
      { status: getCancelErrorStatus(error) },
    );
  }
}
