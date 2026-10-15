import { createClient } from '@supabase/supabase-js';
import { isVerifiedMember } from '@/lib/security/identity';
import { NextResponse } from 'next/server';
import { cancelNicepayOrder } from '@/lib/orders/nicepayCancel';
import { assertExpectedSupabaseProject } from '@/lib/supabase/projectGuard';
import { dispatchOrderNotifications } from '@/lib/orders/notifications';
import { extractPaymentReceiptUrl } from '@/lib/orders/rawPayload';
import { readJsonObject, RequestBodyError } from '@/lib/security/requestBody';
import { isMemberOrderOwner, LEGACY_MEMBER_ORDER_LINK_MESSAGE } from '@/lib/orders/memberOrderOwnership';

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
  const url = assertExpectedSupabaseProject(process.env.NEXT_PUBLIC_SUPABASE_URL);
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

function buildUnpaidCancellationRawPayload(rawPayloadValue: unknown, reason: string, actor: 'member') {
  const rawPayload =
    rawPayloadValue && typeof rawPayloadValue === 'object' && !Array.isArray(rawPayloadValue)
      ? (rawPayloadValue as Record<string, unknown>)
      : {};
  const cancelledAt = new Date().toISOString();

  return {
    ...rawPayload,
    cancellation: {
      cancelledAt,
      cancelledBy: actor,
      reason,
      status: 'cancelled_unpaid',
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
    payload = (await readJsonObject(request, 4096)) as typeof payload;
  } catch (error) {
    return NextResponse.json({ message: '잘못된 요청 본문입니다.' }, { status: error instanceof RequestBodyError ? error.status : 400 });
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

  if (userError || !isVerifiedMember(user)) {
    return NextResponse.json({ message: 'Unauthorized.' }, { status: 401 });
  }

  const serviceClient = createClient(config.url, config.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: existing, error: existingError } = await serviceClient
    .from('orders')
    .select(ORDER_SELECT)
    .eq('id', orderId)
    .eq('channel', 'member')
    .eq('raw_payload->>customerUserId', user.id)
    .maybeSingle();

  if (existingError) {
    return NextResponse.json(
      { message: `주문 조회 실패: ${existingError.message}` },
      { status: 500 },
    );
  }

  if (!existing || !isMemberOrderOwner(existing, user.id)) {
    return NextResponse.json({ message: `취소 가능한 회원 주문을 찾지 못했습니다. ${LEGACY_MEMBER_ORDER_LINK_MESSAGE}` }, { status: 404 });
  }

  try {
    const paymentMethod = normalizeText(existing.payment_method).toLowerCase();
    const paymentStatus = normalizeText(existing.payment_status).toLowerCase();
    const shippingStatus = normalizeText(existing.shipping_status).toLowerCase();
    const cancelReason = normalizeText(payload.reason).slice(0, 200) || 'member_cancel';
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

      if (paymentStatus !== 'pending_transfer' && paymentStatus !== 'transfer_confirmed') {
        return NextResponse.json({ message: '취소 가능한 계좌이체 주문 상태가 아닙니다.' }, { status: 409 });
      }

      const wasUnpaid = paymentStatus === 'pending_transfer';
      const nextStatus = wasUnpaid ? 'cancelled' : 'refund_pending';
      const nextRawPayload = wasUnpaid
        ? buildUnpaidCancellationRawPayload(existing.raw_payload, cancelReason, 'member')
        : buildRefundPendingRawPayload(existing.raw_payload, cancelReason, 'member');

      let updateQuery = serviceClient
        .from('orders')
        .update({
          payment_status: nextStatus,
          updated_at: new Date().toISOString(),
          raw_payload: nextRawPayload,
        })
        .eq('id', orderId)
        .eq('channel', 'member')
        .eq('raw_payload->>customerUserId', user.id)
        .eq('payment_method', 'bank_transfer')
        .eq('payment_status', paymentStatus);
      updateQuery = existing.shipping_status === null
        ? updateQuery.is('shipping_status', null)
        : updateQuery.eq('shipping_status', 'preparing');
      // Notifications update the same JSON value. Refuse a stale write rather
      // than discard another request's notification or refund metadata.
      updateQuery = existing.raw_payload === null ? updateQuery.is('raw_payload', null)
        : updateQuery.eq('raw_payload', JSON.stringify(existing.raw_payload));
      const { data, error } = await updateQuery.select(ORDER_SELECT).maybeSingle();

      if (error) {
        throw new Error(error.message);
      }

      if (!data) {
        return NextResponse.json(
          { message: '주문 상태가 변경되었습니다. 새로고침한 뒤 다시 확인해 주세요.' },
          { status: 409 },
        );
      }

      updatedOrder = data as OrderRow;

      try {
        await dispatchOrderNotifications(serviceClient, updatedOrder.id, nextStatus);
      } catch (error) {
        console.error('Failed to send member cancel notifications', error);
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
          ? '카드결제 취소가 완료되었습니다.'
          : paymentStatus === 'pending_transfer'
            ? '미입금 주문이 취소되었습니다.'
            : '환불 요청이 접수되었습니다.',
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
