import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const DEFAULT_ORDER_RECEIVER_EMAIL = 'morba9850@gmail.com';
const RESEND_API_ENDPOINT = 'https://api.resend.com/emails';

type OrderChannel = 'member' | 'guest';

type OrderItem = {
  id: string;
  name: string;
  category: string;
  selectedSize: string | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
};

type BankTransferOrderPayload = {
  transactionId: string;
  channel: OrderChannel;
  customer: {
    name: string;
    email: string;
    phone: string;
    country: string;
    address: string;
  };
  bankAccount: {
    bankName: string;
    accountNumber: string;
  };
  pricing: {
    subtotal: number;
    shipping: number;
    tax: number;
    total: number;
    currency: string;
  };
  items: OrderItem[];
};

function getServerConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    return null;
  }
  return { url, serviceRoleKey };
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function toNumber(value: unknown) {
  return typeof value === 'number' ? value : Number(value);
}

function formatKrw(value: number) {
  return `${Math.round(value).toLocaleString('ko-KR')}원`;
}

function validatePayload(body: unknown): BankTransferOrderPayload | null {
  if (!body || typeof body !== 'object') return null;

  const payload = body as Partial<BankTransferOrderPayload>;
  if (
    !isNonEmptyString(payload.transactionId) ||
    (payload.channel !== 'member' && payload.channel !== 'guest')
  ) {
    return null;
  }

  const customer = payload.customer;
  const bankAccount = payload.bankAccount;
  const pricing = payload.pricing;
  const items = payload.items;

  if (
    !customer ||
    !bankAccount ||
    !pricing ||
    !Array.isArray(items) ||
    items.length === 0 ||
    !isNonEmptyString(customer.name) ||
    !isNonEmptyString(customer.email) ||
    !isNonEmptyString(customer.phone) ||
    !isNonEmptyString(customer.country) ||
    !isNonEmptyString(customer.address) ||
    !isNonEmptyString(bankAccount.bankName) ||
    !isNonEmptyString(bankAccount.accountNumber) ||
    !isNonEmptyString(pricing.currency)
  ) {
    return null;
  }

  const subtotal = toNumber(pricing.subtotal);
  const shipping = toNumber(pricing.shipping);
  const tax = toNumber(pricing.tax);
  const total = toNumber(pricing.total);

  if (
    Number.isNaN(subtotal) ||
    Number.isNaN(shipping) ||
    Number.isNaN(tax) ||
    Number.isNaN(total)
  ) {
    return null;
  }

  const normalizedItems: OrderItem[] = [];
  for (const item of items) {
    if (!item || typeof item !== 'object') return null;
    const target = item as Partial<OrderItem>;
    if (
      !isNonEmptyString(target.id) ||
      !isNonEmptyString(target.name) ||
      !isNonEmptyString(target.category)
    ) {
      return null;
    }

    const quantity = toNumber(target.quantity);
    const unitPrice = toNumber(target.unitPrice);
    const lineTotal = toNumber(target.lineTotal);

    if (
      Number.isNaN(quantity) ||
      Number.isNaN(unitPrice) ||
      Number.isNaN(lineTotal) ||
      quantity <= 0
    ) {
      return null;
    }

    normalizedItems.push({
      id: target.id,
      name: target.name,
      category: target.category,
      selectedSize: typeof target.selectedSize === 'string' ? target.selectedSize : null,
      quantity,
      unitPrice,
      lineTotal,
    });
  }

  return {
    transactionId: payload.transactionId.trim(),
    channel: payload.channel,
    customer: {
      name: customer.name.trim(),
      email: customer.email.trim(),
      phone: customer.phone.trim(),
      country: customer.country.trim(),
      address: customer.address.trim(),
    },
    bankAccount: {
      bankName: bankAccount.bankName.trim(),
      accountNumber: bankAccount.accountNumber.trim(),
    },
    pricing: {
      subtotal,
      shipping,
      tax,
      total,
      currency: pricing.currency.trim().toUpperCase(),
    },
    items: normalizedItems,
  };
}

function buildEmailText(payload: BankTransferOrderPayload) {
  const lines = payload.items.map((item, index) => {
    const sizeText = item.selectedSize ? ` / 사이즈 ${item.selectedSize}` : '';
    return `${index + 1}. ${item.name} (${item.category}${sizeText}) x${item.quantity} = ${formatKrw(item.lineTotal)}`;
  });

  return [
    '[계좌이체 주문 접수]',
    `거래번호: ${payload.transactionId}`,
    `구매유형: ${payload.channel === 'member' ? '회원 구매' : '비회원 구매'}`,
    '',
    '[주문자 정보]',
    `이름: ${payload.customer.name}`,
    `이메일: ${payload.customer.email}`,
    `핸드폰: ${payload.customer.phone}`,
    `국가/구역: ${payload.customer.country}`,
    `주소: ${payload.customer.address}`,
    '',
    '[계좌 정보]',
    `${payload.bankAccount.bankName} ${payload.bankAccount.accountNumber}`,
    '',
    '[결제 금액]',
    `상품합계: ${formatKrw(payload.pricing.subtotal)}`,
    `배송비: ${formatKrw(payload.pricing.shipping)}`,
    `세금: ${formatKrw(payload.pricing.tax)}`,
    `총액: ${formatKrw(payload.pricing.total)} (${payload.pricing.currency})`,
    '',
    '[주문 상품]',
    ...lines,
  ].join('\n');
}

async function sendOrderEmail(payload: BankTransferOrderPayload) {
  const resendApiKey = process.env.RESEND_API_KEY;
  if (!resendApiKey) {
    throw new Error('서버에 RESEND_API_KEY가 설정되어 있지 않습니다.');
  }

  const to = (process.env.ORDER_NOTIFICATION_EMAIL || DEFAULT_ORDER_RECEIVER_EMAIL).trim();
  const from = (process.env.ORDER_FROM_EMAIL || 'Enico Veck Orders <onboarding@resend.dev>').trim();
  const subject = `[주문접수] ${payload.channel === 'member' ? '회원' : '비회원'} ${payload.transactionId}`;

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
      text: buildEmailText(payload),
      reply_to: payload.customer.email,
    }),
  });

  const responsePayload = (await emailResponse.json().catch(() => null)) as
    | { error?: { message?: string } }
    | null;

  if (!emailResponse.ok) {
    const detail = responsePayload?.error?.message || '메일 발송 API 응답 오류';
    throw new Error(`주문 메일 발송 실패: ${detail}`);
  }
}

async function persistOrder(payload: BankTransferOrderPayload) {
  const config = getServerConfig();
  if (!config) {
    throw new Error(
      '주문 저장용 Supabase 서버 설정이 없습니다. NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY를 확인하세요.',
    );
  }

  const serviceClient = createClient(config.url, config.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { error } = await serviceClient.from('orders').insert({
    order_code: payload.transactionId,
    channel: payload.channel,
    payment_method: 'bank_transfer',
    payment_status: 'pending_transfer',
    currency: payload.pricing.currency,
    amount_subtotal: Math.round(payload.pricing.subtotal),
    amount_shipping: Math.round(payload.pricing.shipping),
    amount_tax: Math.round(payload.pricing.tax),
    amount_total: Math.round(payload.pricing.total),
    customer_name: payload.customer.name,
    customer_email: payload.customer.email,
    customer_phone: payload.customer.phone,
    customer_country: payload.customer.country,
    customer_address: payload.customer.address,
    bank_name: payload.bankAccount.bankName,
    bank_account_number: payload.bankAccount.accountNumber,
    items: payload.items,
    raw_payload: payload,
  });

  if (error) {
    if (error.code === '42P01') {
      throw new Error('orders 테이블이 없습니다. sql/orders_setup.sql을 먼저 실행하세요.');
    }
    throw new Error(`주문 저장 실패: ${error.message}`);
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as unknown;
    const payload = validatePayload(body);
    if (!payload) {
      return NextResponse.json(
        { message: '주문 요청 형식이 올바르지 않습니다.' },
        { status: 400 },
      );
    }

    await persistOrder(payload);
    await sendOrderEmail(payload);

    return NextResponse.json({ ok: true, message: '주문 접수 및 메일 발송 완료' });
  } catch (error) {
    return NextResponse.json(
      {
        message: error instanceof Error ? error.message : '주문 접수 중 서버 오류가 발생했습니다.',
      },
      { status: 500 },
    );
  }
}
