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
  let payload: { guestOrderNumber?: string; password?: string } = {};
  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return NextResponse.json({ message: '잘못된 요청 본문입니다.' }, { status: 400 });
  }

  const guestOrderNumber = normalizeText(payload.guestOrderNumber).toUpperCase();
  const password = normalizeText(payload.password);

  if (!guestOrderNumber || !password) {
    return NextResponse.json(
      { message: '비회원 주문번호와 비밀번호를 모두 입력해 주세요.' },
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

  const { data, error } = await serviceClient
    .from('orders')
    .select(
      'id, order_code, guest_order_number, channel, payment_method, payment_status, currency, amount_subtotal, amount_shipping, amount_tax, amount_total, customer_name, customer_email, customer_phone, customer_country, customer_address, items, shipping_status, shipping_company, tracking_number, shipping_note, shipped_at, delivered_at, created_at, updated_at, guest_password_hash',
    )
    .eq('guest_order_number', guestOrderNumber)
    .eq('channel', 'guest')
    .maybeSingle<GuestLookupRow>();

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
      { message: `비회원 주문 조회 실패: ${error.message}` },
      { status: 500 },
    );
  }

  if (!data || !data.guest_password_hash) {
    return NextResponse.json(
      { message: '주문번호 또는 비밀번호가 올바르지 않습니다.' },
      { status: 401 },
    );
  }

  const isPasswordValid = verifyGuestLookupPassword(password, data.guest_password_hash);
  if (!isPasswordValid) {
    return NextResponse.json(
      { message: '주문번호 또는 비밀번호가 올바르지 않습니다.' },
      { status: 401 },
    );
  }

  const order = {
    id: data.id,
    orderCode: normalizeText(data.order_code),
    guestOrderNumber: normalizeText(data.guest_order_number),
    channel: normalizeText(data.channel),
    paymentMethod: normalizeText(data.payment_method),
    paymentStatus: normalizeText(data.payment_status),
    currency: normalizeText(data.currency || 'KRW'),
    amountSubtotal: normalizeNumber(data.amount_subtotal),
    amountShipping: normalizeNumber(data.amount_shipping),
    amountTax: normalizeNumber(data.amount_tax),
    amountTotal: normalizeNumber(data.amount_total),
    customerName: normalizeText(data.customer_name),
    customerEmail: normalizeText(data.customer_email),
    customerPhone: normalizeText(data.customer_phone),
    customerCountry: normalizeText(data.customer_country),
    customerAddress: normalizeText(data.customer_address),
    items: normalizeItems(data.items),
    shippingStatus: normalizeText(data.shipping_status || 'preparing'),
    shippingCompany: normalizeText(data.shipping_company),
    trackingNumber: normalizeText(data.tracking_number),
    shippingNote: normalizeText(data.shipping_note),
    shippedAt: data.shipped_at,
    deliveredAt: data.delivered_at,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };

  return NextResponse.json({ order });
}
