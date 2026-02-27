import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const PRIMARY_ADMIN_EMAIL = 'morba9850@gmail.com';

type AdminAuthResult =
  | {
      ok: true;
      serviceClient: any;
    }
  | {
      ok: false;
      response: NextResponse;
    };

type OrderRow = {
  id: string;
  order_code: string | null;
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
    .select(
      'id, order_code, channel, payment_method, payment_status, currency, amount_subtotal, amount_shipping, amount_tax, amount_total, customer_name, customer_email, customer_phone, customer_country, customer_address, bank_name, bank_account_number, paypal_order_id, paypal_capture_id, paypal_currency, paypal_value, items, created_at, updated_at',
    )
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    if (error.code === '42P01') {
      return NextResponse.json(
        { message: 'orders 테이블이 없습니다. sql/orders_setup.sql을 실행하세요.' },
        { status: 500 },
      );
    }
    return NextResponse.json(
      { message: `주문 목록 조회 실패: ${error.message}` },
      { status: 500 },
    );
  }

  const orders = ((data || []) as OrderRow[]).map((row) => ({
    id: row.id,
    orderCode: normalizeText(row.order_code),
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
    items: normalizeItems(row.items),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));

  return NextResponse.json({ orders });
}
