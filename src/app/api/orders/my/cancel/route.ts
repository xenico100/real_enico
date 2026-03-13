import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { cancelNicepayOrder } from '@/lib/orders/nicepayCancel';
import { extractPaymentReceiptUrl } from '@/lib/orders/rawPayload';

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
    const updatedOrder = await cancelNicepayOrder<OrderRow>({
      serviceClient,
      order: existing as OrderRow,
      actor: 'member',
      reason: normalizeText(payload.reason) || 'member_cancel',
      selectQuery: ORDER_SELECT,
    });

    return NextResponse.json({
      message: '주문취소가 완료되었습니다. 관리자 메일에도 취소 정보가 전송됩니다.',
      order: mapOrderRow(updatedOrder),
    });
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error ? error.message : '주문취소 처리 중 오류가 발생했습니다.',
      },
      { status: 500 },
    );
  }
}
