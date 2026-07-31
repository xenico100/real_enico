import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import {
  generateGuestOrderNumber,
  hashGuestLookupPassword,
} from '@/lib/orders/guestLookup';
import { parseOrderRawPayload } from '@/lib/orders/rawPayload';
import {
  authenticateOrderRequest,
  buildCanonicalOrder,
  getOrderErrorStatus,
  normalizeTransactionId,
  OrderValidationError,
  type CanonicalOrderItem,
  type CanonicalOrderPricing,
  type ClientOrderItem,
  type ServerOrderChannel,
} from '@/lib/orders/serverOrderValidation';

const DEFAULT_ORDER_RECEIVER_EMAIL = 'morba9850@gmail.com';
const RESEND_API_ENDPOINT = 'https://api.resend.com/emails';
const BANK_ACCOUNT = {
  bankName: '카카오뱅크',
  accountNumber: '3333-09-2834969',
  accountHolder: '백형석',
} as const;

type CustomerDetails = {
  name: string;
  email: string;
  phone: string;
  country: string;
  address: string;
};

type BankTransferOrderPayload = {
  transactionId: string;
  channel: ServerOrderChannel;
  paymentReceiptUrl: string | null;
  customer: CustomerDetails;
  bankAccount: typeof BANK_ACCOUNT;
  pricing: CanonicalOrderPricing;
  items: CanonicalOrderItem[];
};

type ParsedBankTransferRequest = {
  transactionId: string;
  channel: ServerOrderChannel;
  guestLookupPassword: string | null;
  paymentReceiptUrl: string | null;
  customer: CustomerDetails;
  clientTotal: number;
  items: ClientOrderItem[];
};

type PersistGuestMeta = {
  guestOrderNumber: string | null;
  guestPasswordHash: string | null;
};

function createOrderServiceClient() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new OrderValidationError(
      '주문 저장용 Supabase 서버 설정이 없습니다. SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY를 확인하세요.',
      500,
    );
  }

  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function normalizeRequiredText(value: unknown, label: string, maxLength: number) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized || normalized.length > maxLength) {
    throw new OrderValidationError(`${label} 형식이 올바르지 않습니다.`);
  }
  return normalized;
}

function parseItems(value: unknown): ClientOrderItem[] {
  if (!Array.isArray(value)) {
    throw new OrderValidationError('주문 상품 구성이 올바르지 않습니다.');
  }

  return value.map((valueItem) => {
    if (!valueItem || typeof valueItem !== 'object') {
      throw new OrderValidationError('주문 상품 구성이 올바르지 않습니다.');
    }
    const item = valueItem as Record<string, unknown>;
    return {
      id: normalizeRequiredText(item.id, '상품 ID', 100),
      selectedSize:
        typeof item.selectedSize === 'string' ? item.selectedSize.trim().slice(0, 40) || null : null,
      quantity: Number(item.quantity),
    };
  });
}

function parseRequestBody(body: unknown): ParsedBankTransferRequest {
  if (!body || typeof body !== 'object') {
    throw new OrderValidationError('주문 요청 형식이 올바르지 않습니다.');
  }

  const payload = body as Record<string, unknown>;
  const customer = payload.customer as Record<string, unknown> | null;
  const pricing = payload.pricing as Record<string, unknown> | null;
  if (!customer || !pricing) {
    throw new OrderValidationError('주문 요청 형식이 올바르지 않습니다.');
  }

  const channel = payload.channel;
  if (channel !== 'member' && channel !== 'guest') {
    throw new OrderValidationError('주문 유형이 올바르지 않습니다.');
  }

  const email = normalizeRequiredText(customer.email, '이메일', 320);
  if (!email.includes('@')) {
    throw new OrderValidationError('이메일 형식이 올바르지 않습니다.');
  }

  const clientTotal = Number(pricing.total);
  if (!Number.isFinite(clientTotal) || clientTotal < 0) {
    throw new OrderValidationError('주문 금액 형식이 올바르지 않습니다.');
  }

  const guestLookupPassword =
    channel === 'guest' && typeof payload.guestLookupPassword === 'string'
      ? payload.guestLookupPassword.trim()
      : null;
  if (channel === 'guest' && (!guestLookupPassword || guestLookupPassword.length < 4 || guestLookupPassword.length > 128)) {
    throw new OrderValidationError('비회원 주문조회 비밀번호는 4자 이상 128자 이하로 입력해 주세요.');
  }

  return {
    transactionId: normalizeTransactionId(payload.transactionId),
    channel,
    guestLookupPassword,
    paymentReceiptUrl:
      typeof payload.paymentReceiptUrl === 'string' && payload.paymentReceiptUrl.trim()
        ? payload.paymentReceiptUrl.trim()
        : null,
    customer: {
      name: normalizeRequiredText(customer.name, '이름', 100),
      email,
      phone: normalizeRequiredText(customer.phone, '핸드폰 번호', 50),
      country: normalizeRequiredText(customer.country, '국가/구역', 100),
      address: normalizeRequiredText(customer.address, '주소', 500),
    },
    clientTotal,
    items: parseItems(payload.items),
  };
}

function normalizePaymentReceiptUrl(
  value: string | null,
  user: User | null,
  transactionId: string,
) {
  if (!value) return null;
  if (!user) {
    throw new OrderValidationError('이체확인 이미지는 로그인한 회원만 첨부할 수 있습니다.', 403);
  }
  if (process.env.PAYMENT_RECEIPT_UPLOAD_ENABLED !== 'true') {
    throw new OrderValidationError('이체확인 이미지 업로드가 비활성화되어 있습니다.', 403);
  }

  const publicBaseUrl = (
    process.env.CLOUDFLARE_R2_PUBLIC_BASE_URL || process.env.R2_PUBLIC_BASE_URL || ''
  ).trim();
  if (!publicBaseUrl) {
    throw new OrderValidationError('이체확인 이미지 저장소 설정이 없습니다.', 500);
  }

  try {
    const baseUrl = new URL(publicBaseUrl);
    const receiptUrl = new URL(value);
    const basePath = baseUrl.pathname.replace(/\/+$/, '');
    const expectedPrefix = `${basePath}/payment-receipts/${user.id}/${transactionId}/`.replace(
      /\/{2,}/g,
      '/',
    );
    if (
      baseUrl.protocol !== 'https:' ||
      receiptUrl.protocol !== 'https:' ||
      receiptUrl.origin !== baseUrl.origin ||
      !receiptUrl.pathname.startsWith(expectedPrefix) ||
      receiptUrl.username ||
      receiptUrl.password ||
      receiptUrl.search ||
      receiptUrl.hash
    ) {
      throw new Error('invalid receipt URL');
    }
    return receiptUrl.toString();
  } catch {
    throw new OrderValidationError('허용되지 않은 이체확인 이미지 주소입니다.');
  }
}

function formatKrw(value: number) {
  return `${Math.round(value).toLocaleString('ko-KR')}원`;
}

function buildRawPayload(payload: BankTransferOrderPayload) {
  const rawPayload = parseOrderRawPayload({
    ...payload,
    bankAccount: {
      bankName: payload.bankAccount.bankName,
      accountHolder: payload.bankAccount.accountHolder,
    },
  }) || {};
  rawPayload.paymentReceiptUrl = payload.paymentReceiptUrl;
  return rawPayload;
}

function buildEmailText(payload: BankTransferOrderPayload, guestOrderNumber: string | null) {
  const lines = payload.items.map((item, index) => {
    const sizeText = item.selectedSize ? ` / 사이즈 ${item.selectedSize}` : '';
    return `${index + 1}. ${item.name} (${item.category}${sizeText}) x${item.quantity} = ${formatKrw(item.lineTotal)}`;
  });

  return [
    '[계좌이체 주문 접수]',
    `거래번호: ${payload.transactionId}`,
    `구매유형: ${payload.channel === 'member' ? '회원 구매' : '비회원 구매'}`,
    ...(guestOrderNumber ? [`비회원 주문조회 번호: ${guestOrderNumber}`] : []),
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
    `예금주: ${payload.bankAccount.accountHolder}`,
    ...(payload.paymentReceiptUrl ? [`이체확인 이미지: ${payload.paymentReceiptUrl}`] : []),
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

async function sendOrderEmail(payload: BankTransferOrderPayload, guestOrderNumber: string | null) {
  const resendApiKey = process.env.RESEND_API_KEY;
  if (!resendApiKey) {
    throw new Error('RESEND_API_KEY가 설정되어 있지 않습니다.');
  }

  const to = (process.env.ORDER_NOTIFICATION_EMAIL || DEFAULT_ORDER_RECEIVER_EMAIL).trim();
  const from = (process.env.ORDER_FROM_EMAIL || 'Enico Veck Orders <onboarding@resend.dev>').trim();
  const response = await fetch(RESEND_API_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: `[주문접수] ${payload.channel === 'member' ? '회원' : '비회원'} ${payload.transactionId}`,
      text: buildEmailText(payload, guestOrderNumber),
      reply_to: payload.customer.email,
    }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    const responsePayload = (await response.json().catch(() => null)) as
      | { error?: { message?: string } }
      | null;
    throw new Error(responsePayload?.error?.message || '주문 메일 발송 API 응답 오류');
  }
}

async function ensureOrderNotRecorded(
  serviceClient: SupabaseClient,
  transactionId: string,
) {
  const result = await serviceClient
    .from('orders')
    .select('id')
    .eq('payment_method', 'bank_transfer')
    .eq('order_code', transactionId)
    .limit(1);
  if (result.error) {
    if (result.error.code === '42P01') return;
    console.error('Bank transfer duplicate check failed', result.error);
    throw new OrderValidationError('기존 계좌이체 주문 확인 중 오류가 발생했습니다.', 500);
  }
  if ((result.data?.length || 0) > 0) {
    throw new OrderValidationError('이미 접수된 계좌이체 주문입니다.', 409);
  }
}

async function persistOrder(
  serviceClient: SupabaseClient,
  payload: BankTransferOrderPayload,
  guestMeta: PersistGuestMeta,
) {
  const { error } = await serviceClient.from('orders').insert({
    order_code: payload.transactionId,
    channel: payload.channel,
    payment_method: 'bank_transfer',
    payment_status: 'pending_transfer',
    currency: payload.pricing.currency,
    amount_subtotal: payload.pricing.subtotal,
    amount_shipping: payload.pricing.shipping,
    amount_tax: payload.pricing.tax,
    amount_total: payload.pricing.total,
    customer_name: payload.customer.name,
    customer_email: payload.customer.email,
    customer_phone: payload.customer.phone,
    customer_country: payload.customer.country,
    customer_address: payload.customer.address,
    bank_name: payload.bankAccount.bankName,
    bank_account_number: payload.bankAccount.accountNumber,
    guest_order_number: guestMeta.guestOrderNumber,
    guest_password_hash: guestMeta.guestPasswordHash,
    shipping_status: 'preparing',
    items: payload.items,
    raw_payload: buildRawPayload(payload),
  });

  if (!error) return;
  if (error.code === '23505') {
    throw new OrderValidationError('이미 접수된 계좌이체 주문입니다.', 409);
  }
  if (error.code === '42P01') {
    throw new OrderValidationError('orders 테이블이 없습니다. sql/orders_setup.sql을 먼저 실행하세요.', 500);
  }
  if (error.code === '42703') {
    throw new OrderValidationError(
      'orders 테이블 컬럼이 최신이 아닙니다. sql/orders_setup.sql을 다시 실행해 주세요.',
      500,
    );
  }

  console.error('Bank transfer order insert failed', error);
  throw new OrderValidationError('계좌이체 주문 저장 중 오류가 발생했습니다.', 500);
}

export async function POST(request: Request) {
  try {
    const parsed = parseRequestBody(await request.json());
    const authentication = await authenticateOrderRequest(request, parsed.channel);
    const serviceClient = createOrderServiceClient();
    const canonical = await buildCanonicalOrder(serviceClient, {
      items: parsed.items,
      customerCountry: parsed.customer.country,
      user: authentication.user,
      clientTotal: parsed.clientTotal,
    });

    const authenticatedEmail = authentication.user?.email?.trim();
    if (parsed.channel === 'member' && !authenticatedEmail) {
      throw new OrderValidationError('회원 계정 이메일을 확인할 수 없습니다.', 400);
    }

    const payload: BankTransferOrderPayload = {
      transactionId: parsed.transactionId,
      channel: parsed.channel,
      paymentReceiptUrl: normalizePaymentReceiptUrl(
        parsed.paymentReceiptUrl,
        authentication.user,
        parsed.transactionId,
      ),
      customer: {
        ...parsed.customer,
        email: authenticatedEmail || parsed.customer.email,
      },
      bankAccount: BANK_ACCOUNT,
      pricing: canonical.pricing,
      items: canonical.items,
    };

    await ensureOrderNotRecorded(serviceClient, payload.transactionId);

    const guestOrderNumber = payload.channel === 'guest' ? generateGuestOrderNumber() : null;
    const guestPasswordHash =
      payload.channel === 'guest' && parsed.guestLookupPassword
        ? hashGuestLookupPassword(parsed.guestLookupPassword)
        : null;

    await persistOrder(serviceClient, payload, { guestOrderNumber, guestPasswordHash });

    const emailResult = await sendOrderEmail(payload, guestOrderNumber).then(
      () => ({ sent: true as const }),
      (error) => {
        console.error('Bank transfer order email failed', error);
        return { sent: false as const };
      },
    );

    return NextResponse.json({
      ok: true,
      message: emailResult.sent
        ? '주문 접수 및 메일 발송 완료'
        : '주문은 접수되었지만 알림 메일 발송에 실패했습니다.',
      guestOrderNumber,
      bankAccount: BANK_ACCOUNT,
      mailSent: emailResult.sent,
      inventoryReserved: false,
    });
  } catch (error) {
    if (!(error instanceof OrderValidationError)) {
      console.error('Bank transfer order processing failed', error);
    }
    return NextResponse.json(
      {
        message: error instanceof Error ? error.message : '주문 접수 중 서버 오류가 발생했습니다.',
      },
      { status: getOrderErrorStatus(error) },
    );
  }
}
