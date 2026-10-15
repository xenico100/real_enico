import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { requestBudget } from '@/lib/security/requestBudget';
import { readJsonObject } from '@/lib/security/requestBody';
import { assertExpectedSupabaseProject } from '@/lib/supabase/projectGuard';
import {
  generateGuestOrderNumber,
  hashGuestLookupPassword,
} from '@/lib/orders/guestLookup';
import { parseOrderRawPayload } from '@/lib/orders/rawPayload';
import { BANK_ACCOUNT } from '@/lib/orders/bankAccount';
import { dispatchOrderNotifications } from '@/lib/orders/notifications';
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
  customerUserId: string | null;
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
  const url = assertExpectedSupabaseProject(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  );
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

function normalizePaymentReceiptUrl(value: string | null) {
  if (value) throw new OrderValidationError('이체 증빙 이미지 업로드는 지원하지 않습니다. 입금 확인은 고객센터로 문의해 주세요.', 403);
  return null;
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
  const { data, error } = await serviceClient.from('orders').insert({
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
  }).select('id').single();

  if (!error && data?.id) return data.id as string;
  if (!error) throw new OrderValidationError('주문 저장 결과를 확인하지 못했습니다. 주문내역을 확인해 주세요.', 503);
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
  const blocked = await requestBudget(request, 'bank-transfer', 15, 600);
  if (blocked) return blocked;
  try {
    const parsed = parseRequestBody(await readJsonObject(request));
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
      customerUserId: authentication.user?.id || null,
      paymentReceiptUrl: normalizePaymentReceiptUrl(parsed.paymentReceiptUrl),
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

    const orderId = await persistOrder(serviceClient, payload, { guestOrderNumber, guestPasswordHash });

    const notificationResult = await dispatchOrderNotifications(serviceClient, orderId, 'order_received').catch((error) => {
      console.error('Bank order notification needs attention', { orderId, error: error instanceof Error ? error.message : 'unknown' });
      return null;
    });

    return NextResponse.json({
      ok: true,
      message: '주문이 접수되었습니다. 아직 입금 대기 상태입니다.',
      orderCode: payload.transactionId,
      guestOrderNumber,
      bankAccount: BANK_ACCOUNT,
      pricing: payload.pricing,
      items: payload.items,
      paymentStatus: 'pending_transfer',
      notifications: notificationResult ? Object.fromEntries(Object.entries(notificationResult.channels).map(([key, value]) => [key, { status: value.status }])) : null,
      mailSent: notificationResult?.channels.adminEmail?.status === 'sent',
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
