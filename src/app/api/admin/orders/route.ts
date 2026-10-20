import { isPrimaryAdmin } from '@/lib/security/identity';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { revalidateTag } from 'next/cache';
import { NextResponse } from 'next/server';
import { cancelNicepayOrder } from '@/lib/orders/nicepayCancel';
import { assertExpectedSupabaseProject } from '@/lib/supabase/projectGuard';
import { dispatchOrderNotifications, getCurrentOrderNotificationEvent, getOrderNotificationHistory, getOrderNotificationSummary, projectPhoneRelayOrderNotifications, type NotificationChannel, type OrderNotificationEvent } from '@/lib/orders/notifications';
import { getOrderBankAccount } from '@/lib/orders/bankAccount';
import { extractPaymentReceiptUrl } from '@/lib/orders/rawPayload';
import { getShippingHistory, prepareShippingUpdate } from '@/lib/orders/shippingWorkflow';

const DEFAULT_SHIPPING_COMPANY = '우체국';
const ORDER_SELECT =
  'id, order_code, guest_order_number, channel, payment_method, payment_status, currency, amount_subtotal, amount_shipping, amount_tax, amount_total, customer_name, customer_email, customer_phone, customer_country, customer_address, bank_name, bank_account_number, paypal_order_id, paypal_capture_id, paypal_currency, paypal_value, items, shipping_status, shipping_company, tracking_number, shipping_note, shipped_at, delivered_at, raw_payload, created_at, updated_at';

type ShippingStatus = 'preparing' | 'shipping' | 'delivered';
type PaymentStatus =
  | 'pending_transfer'
  | 'transfer_confirmed'
  | 'refund_pending'
  | 'approval_processing'
  | 'cancel_processing'
  | 'captured'
  | 'completed'
  | 'paid'
  | 'cancelled';

const BANK_PAYMENT_STATUS_TRANSITIONS: Record<string, readonly string[]> = {
  pending_transfer: ['transfer_confirmed', 'cancelled'],
  transfer_confirmed: ['refund_pending'],
  refund_pending: ['cancelled'],
  cancelled: [],
};

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
    normalized === 'approval_processing' ||
    normalized === 'cancel_processing' ||
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
    bankAccount: row.payment_method === 'bank_transfer' ? getOrderBankAccount(row) : null,
    notifications: getOrderNotificationSummary(row.raw_payload),
    notificationHistory: getOrderNotificationHistory(row.raw_payload),
    shippingHistory: getShippingHistory(row.raw_payload),
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

async function projectOrderRow(client: SupabaseClient, row: OrderRow) {
  return (await projectPhoneRelayOrderNotifications(client, [mapOrderRow(row)]))[0];
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

function mergeUnpaidCancellationRawPayload(rawPayloadValue: unknown, reason: string, actor: 'admin') {
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

function mergeRefundCompletedRawPayload(rawPayloadValue: unknown, actor: 'admin') {
  const rawPayload =
    rawPayloadValue && typeof rawPayloadValue === 'object' && !Array.isArray(rawPayloadValue)
      ? (rawPayloadValue as Record<string, unknown>)
      : {};
  const refundCompletedAt = new Date().toISOString();
  const existingCancellation =
    rawPayload.cancellation &&
    typeof rawPayload.cancellation === 'object' &&
    !Array.isArray(rawPayload.cancellation)
      ? (rawPayload.cancellation as Record<string, unknown>)
      : {};

  return {
    ...rawPayload,
    refundCompletedAt,
    refundCompletedBy: actor,
    refundStatus: 'completed',
    cancellation: {
      ...existingCancellation,
      status: 'completed',
      refundCompletedAt,
      refundCompletedBy: actor,
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

type NotificationOutcome = 'processed' | 'attention_required' | 'not_requested';
async function notifyAndRefresh(serviceClient: SupabaseClient, order: OrderRow, event: OrderNotificationEvent) {
  let outcome: NotificationOutcome = 'processed';
  try {
    const summary = await dispatchOrderNotifications(serviceClient, order.id, event);
    // Queue/provider acceptance is separate from delivery. Missing or uncertain
    // customer results must never turn a saved shipping update into a success claim.
    if (['customerEmail', 'customerSms'].some(channel => {
      const status = summary.channels[channel as NotificationChannel]?.status;
      return !status || !['queued', 'claimed', 'submitted', 'sent'].includes(status);
    })) outcome = 'attention_required';
  } catch {
    outcome = 'attention_required';
    console.error('Order notification needs attention', { orderId: order.id, event });
  }
  try {
    const { data, error } = await serviceClient.from('orders').select(ORDER_SELECT).eq('id', order.id).maybeSingle();
    if (error || !data) outcome = 'attention_required';
    return { order: (data || order) as OrderRow, outcome };
  } catch {
    return { order, outcome: 'attention_required' as const };
  }
}
function notificationWarning(outcome: NotificationOutcome) {
  return outcome === 'attention_required'
    ? ' 고객 알림 일부는 실패·미설정 또는 결과 확인이 필요합니다. 주문 저장은 완료되었으며 발송 내역을 확인해 주세요.' : '';
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

  if (!isPrimaryAdmin(user)) {
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
      { message: '주문 목록을 조회하지 못했습니다. 잠시 후 다시 확인해 주세요.' },
      { status: 500 },
    );
  }

  const orders = await projectPhoneRelayOrderNotifications(auth.serviceClient,
    ((data || []) as OrderRow[]).map((row) => mapOrderRow(row)));
  return NextResponse.json({ orders }, { headers: { 'Cache-Control': 'private, no-store' } });
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
    const body: unknown = await request.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('invalid_body');
    payload = body as typeof payload;
    for (const field of ['id', 'paymentStatus', 'shippingStatus', 'shippingCompany', 'trackingNumber', 'shippingNote'] as const) {
      const value = payload[field];
      if (value !== undefined && (typeof value !== 'string' || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value))) throw new Error('invalid_field');
    }
    if ((payload.shippingCompany?.length || 0) > 80 || (payload.trackingNumber?.length || 0) > 120 || (payload.shippingNote?.length || 0) > 2000) throw new Error('field_too_long');
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
          'paymentStatus는 pending_transfer/transfer_confirmed/refund_pending/approval_processing/cancel_processing/paid/captured/completed/cancelled 중 하나여야 합니다.',
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
    .select(ORDER_SELECT)
    .eq('id', id)
    .maybeSingle();

  if (existingError) {
    return NextResponse.json(
      { message: '주문을 조회하지 못했습니다. 잠시 후 다시 확인해 주세요.' },
      { status: 500 },
    );
  }

  if (!existing) {
    return NextResponse.json({ message: '대상 주문이 없습니다.' }, { status: 404 });
  }

  const nowIso = new Date().toISOString();
  const paymentMethod = normalizeText(existing.payment_method).toLowerCase();
  const currentPaymentStatus = normalizeText(existing.payment_status).toLowerCase();

  if (currentPaymentStatus === 'approval_processing') {
    return NextResponse.json(
      { message: '결제승인 결과를 확인하는 동안 주문 상태나 배송 정보를 수정할 수 없습니다. 중복 결제도 시도하지 마세요.' },
      { status: 409 },
    );
  }

  if (
    requestedShippingStatus &&
    requestedShippingStatus !== existing.shipping_status &&
    (requestedShippingStatus === 'shipping' || requestedShippingStatus === 'delivered') &&
    (currentPaymentStatus === 'pending_payment' ||
      (paymentMethod === 'bank_transfer' && currentPaymentStatus === 'pending_transfer'))
  ) {
    return NextResponse.json(
      { message: '결제가 확인되기 전에는 배송을 시작하거나 완료 처리할 수 없습니다.' },
      { status: 409 },
    );
  }

  if (
    requestedShippingStatus &&
    requestedShippingStatus !== existing.shipping_status &&
    ['cancel_processing', 'refund_pending', 'cancelled'].includes(requestedPaymentStatus || currentPaymentStatus)
  ) {
    return NextResponse.json(
      { message: '결제취소 또는 환불 처리 중인 주문의 배송 상태는 변경할 수 없습니다.' },
      { status: 409 },
    );
  }

  if (requestedPaymentStatus && requestedPaymentStatus !== currentPaymentStatus
    && ['refund_pending', 'cancelled'].includes(requestedPaymentStatus)
    && normalizeShippingStatus(existing.shipping_status) !== null
    && normalizeShippingStatus(existing.shipping_status) !== 'preparing') {
    return NextResponse.json({ message: '배송이 시작된 주문은 이 화면에서 취소·환불 상태로 변경할 수 없습니다. 배송 및 반품 내역을 먼저 확인해 주세요.' }, { status: 409 });
  }

  if (paymentMethod === 'bank_transfer' && requestedPaymentStatus) {
    if (!(currentPaymentStatus in BANK_PAYMENT_STATUS_TRANSITIONS)) {
      return NextResponse.json({ message: '현재 계좌이체 결제 상태를 확인할 수 없습니다.' }, { status: 409 });
    }
    if (
      requestedPaymentStatus !== currentPaymentStatus &&
      !BANK_PAYMENT_STATUS_TRANSITIONS[currentPaymentStatus].includes(requestedPaymentStatus)
    ) {
      return NextResponse.json({ message: '이전 결제 상태로 되돌리거나 취소 주문을 재활성화할 수 없습니다.' }, { status: 409 });
    }
  }

  if (requestedPaymentStatus && requestedPaymentStatus !== currentPaymentStatus) {
    if (paymentMethod === 'nicepay') {
      return NextResponse.json(
        { message: 'NICE 결제 상태는 수동 변경할 수 없습니다. 결제취소 버튼으로 실제 승인 취소를 진행해 주세요.' },
        { status: 409 },
      );
    }
    if (paymentMethod === 'paypal') {
      return NextResponse.json(
        { message: 'PayPal 결제 상태는 수동 변경할 수 없습니다. PayPal에서 실제 환불을 확인한 뒤 관리자에게 문의해 주세요.' },
        { status: 409 },
      );
    }
  }

  if (
    paymentMethod === 'bank_transfer' &&
    currentPaymentStatus === 'pending_transfer' &&
    requestedPaymentStatus === 'transfer_confirmed'
  ) {
    const shippingDetailsChanged =
      (requestedShippingStatus !== null && requestedShippingStatus !== existing.shipping_status) ||
      (payload.shippingCompany !== undefined &&
        (normalizeNullableText(payload.shippingCompany) || DEFAULT_SHIPPING_COMPANY) !==
          (normalizeNullableText(existing.shipping_company) || DEFAULT_SHIPPING_COMPANY)) ||
      (payload.trackingNumber !== undefined &&
        normalizeNullableText(payload.trackingNumber) !== normalizeNullableText(existing.tracking_number)) ||
      (payload.shippingNote !== undefined &&
        normalizeNullableText(payload.shippingNote) !== normalizeNullableText(existing.shipping_note));
    if (shippingDetailsChanged) {
      return NextResponse.json(
        { message: '이체확인과 배송정보 변경은 함께 저장할 수 없습니다. 이체확인 후 배송정보를 별도로 저장해 주세요.' },
        { status: 409 },
      );
    }

    const { data: confirmed, error: confirmationError } = await auth.serviceClient.rpc(
      'confirm_bank_transfer_order',
      { p_order_id: id },
    );
    if (confirmationError) {
      if (['P0001', '23505', '23514', '22023'].includes(confirmationError.code || '')) {
        return NextResponse.json(
          { message: '상품이 다른 주문에서 처리 중이거나 주문 상태가 변경되었습니다. 입금 내역을 확인하고 필요한 경우 환불을 안내해 주세요.' },
          { status: 409 },
        );
      }
      console.error('Bank transfer confirmation failed', {
        code: confirmationError.code,
        message: confirmationError.message,
      });
      return NextResponse.json(
        { message: '이체확인 결과를 확정하지 못했습니다. 재시도 전에 주문과 입금 내역을 확인해 주세요.' },
        { status: 503 },
      );
    }
    if (confirmed !== true) {
      return NextResponse.json(
        { message: '이체확인 결과가 불명확합니다. 재시도 전에 주문과 입금 내역을 확인해 주세요.' },
        { status: 503 },
      );
    }

    try {
      revalidateTag('storefront-products', 'max');
    } catch (error) {
      console.error('Bank transfer product cache revalidation failed', error);
    }

    const { data: confirmedOrder, error: confirmedOrderError } = await auth.serviceClient
      .from('orders')
      .select(ORDER_SELECT)
      .eq('id', id)
      .maybeSingle();
    if (confirmedOrderError || !confirmedOrder) {
      console.error('Bank transfer confirmed but order refresh failed', confirmedOrderError);
      return NextResponse.json({
        message: '이체확인은 완료되었습니다. 주문 화면을 새로고침한 뒤 배송정보를 저장해 주세요.',
      });
    }
    const notified = await notifyAndRefresh(auth.serviceClient, confirmedOrder as OrderRow, 'payment_confirmed');
    return NextResponse.json({
      saved: true, notificationOutcome: notified.outcome,
      message: '이체확인 및 단품 재고 처리가 완료되었습니다. 배송정보는 별도로 저장해 주세요.' + notificationWarning(notified.outcome),
      order: await projectOrderRow(auth.serviceClient, notified.order),
    });
  }

  const shippingUpdate = prepareShippingUpdate(existing, { shippingStatus: requestedShippingStatus,
    shippingCompany: payload.shippingCompany, trackingNumber: payload.trackingNumber, shippingNote: payload.shippingNote },
    nowIso, requestedPaymentStatus || existing.payment_status);
  if (!shippingUpdate.ok) return NextResponse.json({ message: shippingUpdate.message }, { status: 409 });
  const paymentChanged = Boolean(requestedPaymentStatus && requestedPaymentStatus !== currentPaymentStatus);
  if (!shippingUpdate.changed && !paymentChanged) {
    return NextResponse.json({ saved: true, notificationOutcome: 'not_requested',
      message: '변경된 주문 정보가 없습니다.', order: await projectOrderRow(auth.serviceClient, existing as OrderRow) });
  }
  const updatePayload: Record<string, unknown> = { ...shippingUpdate.update, updated_at: nowIso };

  if (requestedPaymentStatus) {
    updatePayload.payment_status = requestedPaymentStatus;

    if (paymentMethod === 'bank_transfer' && requestedPaymentStatus !== currentPaymentStatus) {
      if (requestedPaymentStatus === 'refund_pending') {
        if (currentPaymentStatus !== 'transfer_confirmed') {
          return NextResponse.json(
            { message: '이체확인 상태의 주문만 환불 진행 상태로 변경할 수 있습니다.' },
            { status: 409 },
          );
        }
        updatePayload.raw_payload = mergeRefundPendingRawPayload(
          updatePayload.raw_payload ?? existing.raw_payload,
          'admin_manual_refund_pending',
          'admin',
        );
      } else if (requestedPaymentStatus === 'cancelled') {
        updatePayload.raw_payload = currentPaymentStatus === 'pending_transfer'
          ? mergeUnpaidCancellationRawPayload(updatePayload.raw_payload ?? existing.raw_payload, 'admin_manual_cancel', 'admin')
          : mergeRefundCompletedRawPayload(updatePayload.raw_payload ?? existing.raw_payload, 'admin');
      }
    }
  }


  let updateQuery = auth.serviceClient
    .from('orders')
    .update(updatePayload)
    .eq('id', id)
    .eq('payment_status', existing.payment_status);
  for (const field of ['shipping_status', 'shipping_company', 'tracking_number', 'shipping_note', 'shipped_at', 'delivered_at'] as const) {
    const value = existing[field];
    // Undefined only occurs in old fixture/legacy records; SQL rows use null.
    if (value !== undefined) updateQuery = value === null ? updateQuery.is(field, null) : updateQuery.eq(field, value);
  }
  updateQuery = existing.raw_payload === null ? updateQuery.is('raw_payload', null) : updateQuery.eq('raw_payload', JSON.stringify(existing.raw_payload));
  const { data, error } = await updateQuery.select(ORDER_SELECT).maybeSingle();

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
      { message: '배송 정보를 저장하지 못했습니다. 새로고침 후 저장 여부를 확인해 주세요.' },
      { status: 500 },
    );
  }

  if (!data) {
    return NextResponse.json(
      { message: '주문 상태가 변경되었습니다. 새로고침한 뒤 다시 확인해 주세요.' },
      { status: 409 },
    );
  }

  const nextEvent = data.payment_status === 'cancelled' && currentPaymentStatus === 'refund_pending'
    ? 'refunded' : getCurrentOrderNotificationEvent(data);
  const notified = (paymentChanged || shippingUpdate.notifyShipment) && nextEvent
    ? await notifyAndRefresh(auth.serviceClient, data as OrderRow, nextEvent)
    : { order: data as OrderRow, outcome: 'not_requested' as const };

  return NextResponse.json({
    saved: true, notificationOutcome: notified.outcome,
    message: (
      paymentMethod === 'bank_transfer' && requestedPaymentStatus === 'cancelled'
        ? currentPaymentStatus === 'pending_transfer'
          ? '미입금 주문이 취소되었습니다.'
          : '환불 완료 처리되었습니다.'
        : paymentMethod === 'bank_transfer' &&
            requestedPaymentStatus === 'refund_pending' &&
            currentPaymentStatus !== 'refund_pending'
          ? '환불 진행중 상태로 저장되었습니다.'
          : '주문 상태/배송 정보가 저장되었습니다.') + notificationWarning(notified.outcome),
    order: await projectOrderRow(auth.serviceClient, notified.order),
  });
}

export async function POST(request: Request) {
  const auth = await authenticateAdmin(request);
  if (!auth.ok) return auth.response;

  let payload: {
    id?: string;
    action?: string;
    reason?: string;
    channels?: NotificationChannel[];
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

  if (action !== 'cancel_payment' && action !== 'retry_notifications') {
    return NextResponse.json({ message: '지원하지 않는 관리자 주문 액션입니다.' }, { status: 400 });
  }

  const { data: existing, error: existingError } = await auth.serviceClient
    .from('orders')
    .select(ORDER_SELECT)
    .eq('id', id)
    .maybeSingle();

  if (existingError) {
    return NextResponse.json(
      { message: '주문을 조회하지 못했습니다. 잠시 후 다시 확인해 주세요.' },
      { status: 500 },
    );
  }

  if (!existing) {
    return NextResponse.json({ message: '대상 주문이 없습니다.' }, { status: 404 });
  }

  if (action === 'retry_notifications') {
    const allowedChannels: NotificationChannel[] = ['adminEmail', 'customerEmail', 'customerSms', 'adminSms'];
    if (payload.channels && (!Array.isArray(payload.channels) || payload.channels.some(c => !allowedChannels.includes(c)))) {
      return NextResponse.json({ message: '알림 채널이 올바르지 않습니다.' }, { status: 400 });
    }
    const event = getCurrentOrderNotificationEvent(existing as OrderRow);
    if (!event) return NextResponse.json({ message: '결제 결과 확인 중인 주문에는 알림을 재발송할 수 없습니다.' }, { status: 409 });
    try {
      await dispatchOrderNotifications(auth.serviceClient, id, event, { channels: payload.channels, retry: true });
      const { data } = await auth.serviceClient.from('orders').select(ORDER_SELECT).eq('id', id).maybeSingle();
      const order = await projectOrderRow(auth.serviceClient, (data || existing) as OrderRow);
      return NextResponse.json({ message: '발송 가능한 알림을 처리했습니다. 완료·결과 확인 필요 알림은 중복 발송하지 않습니다.', notifications: order.notifications, order });
    } catch {
      return NextResponse.json({ message: '알림 처리 결과를 확인하지 못했습니다. 주문은 유지됩니다. 발송 내역을 확인해 주세요.' }, { status: 503 });
    }
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

      if (paymentStatus !== 'pending_transfer' && paymentStatus !== 'transfer_confirmed') {
        return NextResponse.json({ message: '취소 가능한 계좌이체 주문 상태가 아닙니다.' }, { status: 409 });
      }

      const wasUnpaid = paymentStatus === 'pending_transfer';

      let updateQuery = auth.serviceClient
        .from('orders')
        .update({
          payment_status: wasUnpaid ? 'cancelled' : 'refund_pending',
          updated_at: new Date().toISOString(),
          raw_payload: wasUnpaid
            ? mergeUnpaidCancellationRawPayload(existing.raw_payload, reason, 'admin')
            : mergeRefundPendingRawPayload(existing.raw_payload, reason, 'admin'),
        })
        .eq('id', id)
        .eq('payment_method', 'bank_transfer')
        .eq('payment_status', existing.payment_status);
      updateQuery = existing.shipping_status === null
        ? updateQuery.is('shipping_status', null)
        : updateQuery.eq('shipping_status', 'preparing');
      updateQuery = existing.raw_payload === null ? updateQuery.is('raw_payload', null) : updateQuery.eq('raw_payload', JSON.stringify(existing.raw_payload));
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

      updatedOrder = (await notifyAndRefresh(auth.serviceClient, updatedOrder, wasUnpaid ? 'cancelled' : 'refund_pending')).order;
    } else {
      return NextResponse.json(
        { message: '관리자 주문취소는 NICE Payments와 계좌이체 주문만 지원합니다.' },
        { status: 400 },
      );
    }

    return NextResponse.json({
      message:
        paymentMethod === 'nicepay'
          ? '카드결제 취소가 완료되었습니다.'
          : paymentStatus === 'pending_transfer'
            ? '미입금 주문이 취소되었습니다.'
            : '환불 요청 상태로 변경되었습니다.',
      order: await projectOrderRow(auth.serviceClient, updatedOrder),
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
  return NextResponse.json(
    { message: '결제·환불 감사 이력 보호를 위해 주문 영구 삭제는 지원하지 않습니다.' },
    { status: 409 },
  );
}
