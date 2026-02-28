import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { verifyGuestLookupPassword } from '@/lib/orders/guestLookup';

type GuestLookupRow = {
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
  shipping_status: string | null;
  shipping_company: string | null;
  tracking_number: string | null;
  shipping_note: string | null;
  shipped_at: string | null;
  delivered_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  guest_password_hash: string | null;
};

function getServerConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return null;
  return { url, serviceRoleKey };
}

function normalizeText(value: unknown) {
  if (typeof value !== 'string') return '';
  return value.trim();
}

function normalizePhone(value: unknown) {
  if (typeof value !== 'string') return '';
  return value.replace(/[^\d]/g, '');
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
  if (Array.isArray(value)) return value;

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

export async function POST(request: Request) {
  let payload: { guestOrderNumber?: string; phone?: string; password?: string } = {};
  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return NextResponse.json({ message: '잘못된 요청 본문입니다.' }, { status: 400 });
  }

  const guestOrderNumber = normalizeText(payload.guestOrderNumber).toUpperCase();
  const phone = normalizePhone(payload.phone);
  const password = normalizeText(payload.password);

  if ((!guestOrderNumber && !phone) || !password) {
    return NextResponse.json(
      { message: '비회원 주문번호 또는 핸드폰 번호와 비밀번호를 입력해 주세요.' },
      { status: 400 },
    );
  }

  const config = getServerConfig();
  if (!config) {
    return NextResponse.json(
      { message: 'Supabase server config is missing.' },
      { status: 500 },
    );
  }

  const serviceClient = createClient(config.url, config.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const selectColumns =
    'id, order_code, guest_order_number, channel, payment_method, payment_status, currency, amount_subtotal, amount_shipping, amount_tax, amount_total, customer_name, customer_email, customer_phone, customer_country, customer_address, items, shipping_status, shipping_company, tracking_number, shipping_note, shipped_at, delivered_at, created_at, updated_at, guest_password_hash';

  const mapLookupError = (error: { code?: string; message: string }) => {
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
      { message: `비회원 주문 조회 실패: ${error.message}` },
      { status: 500 },
    );
  };

  let matchedOrder: GuestLookupRow | null = null;

  if (guestOrderNumber) {
    const { data, error } = await serviceClient
      .from('orders')
      .select(selectColumns)
      .eq('guest_order_number', guestOrderNumber)
      .eq('channel', 'guest')
      .maybeSingle<GuestLookupRow>();

    if (error) {
      return mapLookupError(error);
    }

    if (data?.guest_password_hash && verifyGuestLookupPassword(password, data.guest_password_hash)) {
      matchedOrder = data;
    }
  }

  if (!matchedOrder && phone) {
    const last4Digits = phone.slice(-4);
    let phoneQuery = serviceClient
      .from('orders')
      .select(selectColumns)
      .eq('channel', 'guest')
      .order('created_at', { ascending: false })
      .limit(200);

    if (last4Digits.length === 4) {
      phoneQuery = phoneQuery.ilike('customer_phone', `%${last4Digits}%`);
    }

    const { data: rows, error } = await phoneQuery.returns<GuestLookupRow[]>();

    if (error) {
      return mapLookupError(error);
    }

    const phoneMatchedRows = (rows || []).filter(
      (row) => normalizePhone(row.customer_phone) === phone,
    );

    matchedOrder =
      phoneMatchedRows.find(
        (row) =>
          Boolean(row.guest_password_hash) &&
          verifyGuestLookupPassword(password, row.guest_password_hash || ''),
      ) || null;
  }

  if (!matchedOrder) {
    return NextResponse.json(
      { message: '주문번호/핸드폰번호 또는 비밀번호가 올바르지 않습니다.' },
      { status: 401 },
    );
  }

  const order = {
    id: matchedOrder.id,
    orderCode: normalizeText(matchedOrder.order_code),
    guestOrderNumber: normalizeText(matchedOrder.guest_order_number),
    channel: normalizeText(matchedOrder.channel),
    paymentMethod: normalizeText(matchedOrder.payment_method),
    paymentStatus: normalizeText(matchedOrder.payment_status),
    currency: normalizeText(matchedOrder.currency || 'KRW'),
    amountSubtotal: normalizeNumber(matchedOrder.amount_subtotal),
    amountShipping: normalizeNumber(matchedOrder.amount_shipping),
    amountTax: normalizeNumber(matchedOrder.amount_tax),
    amountTotal: normalizeNumber(matchedOrder.amount_total),
    customerName: normalizeText(matchedOrder.customer_name),
    customerEmail: normalizeText(matchedOrder.customer_email),
    customerPhone: normalizeText(matchedOrder.customer_phone),
    customerCountry: normalizeText(matchedOrder.customer_country),
    customerAddress: normalizeText(matchedOrder.customer_address),
    items: normalizeItems(matchedOrder.items),
    shippingStatus: normalizeText(matchedOrder.shipping_status || 'preparing'),
    shippingCompany: normalizeText(matchedOrder.shipping_company),
    trackingNumber: normalizeText(matchedOrder.tracking_number),
    shippingNote: normalizeText(matchedOrder.shipping_note),
    shippedAt: matchedOrder.shipped_at,
    deliveredAt: matchedOrder.delivered_at,
    createdAt: matchedOrder.created_at,
    updatedAt: matchedOrder.updated_at,
    matchedBy: guestOrderNumber ? 'guestOrderNumber' : 'phone',
  };

  return NextResponse.json({ order });
}
