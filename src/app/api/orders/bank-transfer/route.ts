import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { requestBudget } from '@/lib/security/requestBudget';
import { readJsonObject } from '@/lib/security/requestBody';
import { assertExpectedSupabaseProject } from '@/lib/supabase/projectGuard';
import {
  generateGuestOrderNumber,
  hashGuestLookupPassword,
  verifyGuestLookupPassword,
} from '@/lib/orders/guestLookup';
import { parseOrderRawPayload } from '@/lib/orders/rawPayload';
import { CHECKOUT_ADDRESS_MAX_LENGTH, CHECKOUT_PHONE_MAX_LENGTH, isValidCheckoutEmail, isValidCheckoutPhone } from '@/lib/orders/checkoutValidation';
import { BANK_ACCOUNT, getOrderBankAccount } from '@/lib/orders/bankAccount';
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
  if (!isValidCheckoutEmail(email)) {
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

  const country = normalizeRequiredText(customer.country, '국가/구역', 100);
  const phone = normalizeRequiredText(customer.phone, '핸드폰 번호', CHECKOUT_PHONE_MAX_LENGTH);
  if (!isValidCheckoutPhone(phone, country)) {
    throw new OrderValidationError('핸드폰 번호 형식이 올바르지 않습니다.');
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
      phone,
      country,
      address: normalizeRequiredText(customer.address, '주소', CHECKOUT_ADDRESS_MAX_LENGTH),
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

type SavedBankOrder = {
  id: string;
  channel: ServerOrderChannel;
  order_code: string;
  payment_status: string;
  guest_order_number: string | null;
  guest_password_hash: string | null;
  raw_payload: unknown;
  items: CanonicalOrderItem[];
  currency: string;
  amount_subtotal: number;
  amount_shipping: number;
  amount_tax: number;
  amount_total: number;
  bank_name: string | null;
  bank_account_number: string | null;
};

async function recoverExistingOrder(
  serviceClient: SupabaseClient,
  parsed: ParsedBankTransferRequest,
  customerUserId: string | null,
) {
  const result = await serviceClient
    .from('orders')
    .select('id, channel, order_code, payment_status, guest_order_number, guest_password_hash, raw_payload, items, currency, amount_subtotal, amount_shipping, amount_tax, amount_total, bank_name, bank_account_number')
    .eq('payment_method', 'bank_transfer')
    .eq('order_code', parsed.transactionId)
    .limit(1);
  if (result.error) {
    console.error('Bank transfer duplicate check failed', result.error);
    throw new OrderValidationError('기존 주문 확인 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.', 503);
  }
  const saved = result.data?.[0] as SavedBankOrder | undefined;
  if (!saved) return null;
  const raw = parseOrderRawPayload(saved.raw_payload);
  const ownsOrder = saved.channel === parsed.channel && (
    parsed.channel === 'member'
      ? !!customerUserId && raw?.customerUserId === customerUserId
      : !!parsed.guestLookupPassword && !!saved.guest_password_hash &&
        verifyGuestLookupPassword(parsed.guestLookupPassword, saved.guest_password_hash)
  );
  // Never disclose a receipt, guest number, or payment status based on an ID alone.
  if (!ownsOrder) {
    throw new OrderValidationError('주문 정보를 확인할 수 없습니다. 주문조회에서 확인해 주세요.', 409);
  }
  const originalCustomer = raw?.customer as CustomerDetails | undefined;
  const customerMatches = originalCustomer &&
    (['name', 'email', 'phone', 'country', 'address'] as const)
      .every(key => originalCustomer[key] === parsed.customer[key]);
  const itemKey = (item: ClientOrderItem) => JSON.stringify([item.id, item.selectedSize || null, item.quantity]);
  const itemsMatch = Array.isArray(saved.items) && saved.items.length === parsed.items.length &&
    JSON.stringify(saved.items.map(itemKey).sort()) === JSON.stringify(parsed.items.map(itemKey).sort());
  if (!customerMatches || !itemsMatch || Number(saved.amount_total) !== parsed.clientTotal) {
    throw new OrderValidationError('같은 거래번호의 주문 내용이 다릅니다. 주문조회에서 기존 주문을 확인해 주세요.', 409);
  }
  if (saved.payment_status !== 'pending_transfer') {
    return NextResponse.json({
      code: 'ORDER_LOOKUP_REQUIRED',
      orderLookupRequired: true,
      orderCode: saved.order_code,
      paymentStatus: saved.payment_status,
      message: '이미 접수된 주문의 상태가 변경되었습니다. 추가 입금하지 말고 주문조회에서 확인해 주세요.',
    }, { status: 409 });
  }
  const savedBank = raw?.bankAccount as { accountHolder?: string } | undefined;
  return NextResponse.json({
    ok: true,
    recovered: true,
    message: '이미 접수된 주문을 확인했습니다. 아직 입금 대기 상태입니다.',
    orderCode: saved.order_code,
    guestOrderNumber: saved.guest_order_number,
    bankAccount: { ...getOrderBankAccount(saved), accountHolder: savedBank?.accountHolder || BANK_ACCOUNT.accountHolder },
    pricing: {
      subtotal: Number(saved.amount_subtotal), shipping: Number(saved.amount_shipping),
      tax: Number(saved.amount_tax), total: Number(saved.amount_total), currency: saved.currency,
    },
    items: saved.items,
    paymentStatus: saved.payment_status,
    notifications: null,
    mailSent: false,
    inventoryReserved: false,
  });
}

class DuplicateBankOrderError extends Error {}

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
    throw new DuplicateBankOrderError();
  }
  console.error('Bank transfer order insert failed', error);
  throw new OrderValidationError('계좌이체 주문 저장 중 오류가 발생했습니다.', 500);
}

export async function POST(request: Request) {
  const blocked = await requestBudget(request, 'bank-transfer', 15, 600);
  if (blocked) return blocked;
  // Only a successful absence check followed by validation can prove that
  // this request did not create (or recover) an existing order.
  let safeToRestart = false;
  try {
    const parsed = parseRequestBody(await readJsonObject(request));
    const authentication = await authenticateOrderRequest(request, parsed.channel);
    const serviceClient = createOrderServiceClient();
    const authenticatedEmail = authentication.user?.email?.trim();
    if (parsed.channel === 'member' && !authenticatedEmail) {
      throw new OrderValidationError('회원 계정 이메일을 확인할 수 없습니다.', 400);
    }

    parsed.customer.email = authenticatedEmail || parsed.customer.email;
    normalizePaymentReceiptUrl(parsed.paymentReceiptUrl);
    const recovered = await recoverExistingOrder(serviceClient, parsed, authentication.user?.id || null);
    if (recovered) return recovered;
    safeToRestart = true;

    const canonical = await buildCanonicalOrder(serviceClient, {
      items: parsed.items,
      customerCountry: parsed.customer.country,
      user: authentication.user,
      clientTotal: parsed.clientTotal,
    });

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

    const guestOrderNumber = payload.channel === 'guest' ? generateGuestOrderNumber() : null;
    const guestPasswordHash =
      payload.channel === 'guest' && parsed.guestLookupPassword
        ? hashGuestLookupPassword(parsed.guestLookupPassword)
        : null;

    let orderId: string;
    safeToRestart = false; // Insert failures may have an uncertain commit outcome.
    try {
      orderId = await persistOrder(serviceClient, payload, { guestOrderNumber, guestPasswordHash });
    } catch (error) {
      if (!(error instanceof DuplicateBankOrderError)) throw error;
      const recovered = await recoverExistingOrder(serviceClient, parsed, authentication.user?.id || null);
      if (recovered) return recovered;
      throw new OrderValidationError('주문 접수 결과를 확인하지 못했습니다. 주문조회에서 확인해 주세요.', 503);
    }

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
    if (getOrderErrorStatus(error) >= 500) {
      console.error('Bank transfer order processing failed', error);
    }
    return NextResponse.json(
      {
        ...(safeToRestart && getOrderErrorStatus(error) >= 400 && getOrderErrorStatus(error) < 500
          ? { code: 'ORDER_NOT_CREATED', safeToRestart: true } : {}),
        message: getOrderErrorStatus(error) < 500 && error instanceof Error
          ? error.message
          : '주문 접수 결과를 확인하지 못했습니다. 주문조회에서 확인하거나 잠시 후 같은 요청으로 다시 시도해 주세요.',
      },
      { status: getOrderErrorStatus(error) },
    );
  }
}

