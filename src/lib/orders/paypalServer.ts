import 'server-only';

import {
  getPayPalOrderAmount,
  normalizeKrwPerUsd,
  normalizePayPalCurrency,
} from '@/lib/orders/paypalPricing';
import { OrderValidationError } from '@/lib/orders/serverOrderValidation';

type PayPalCapture = {
  id?: string;
  status?: string;
  amount?: {
    currency_code?: string;
    value?: string;
  };
};

type PayPalOrderResponse = {
  id?: string;
  status?: string;
  purchase_units?: Array<{
    amount?: {
      currency_code?: string;
      value?: string;
    };
    payments?: {
      captures?: PayPalCapture[];
    };
  }>;
};

type PayPalSession = {
  accessToken: string;
  baseUrl: string;
};

const ALLOWED_PAYPAL_API_ORIGINS = new Set([
  'https://api-m.paypal.com',
  'https://api-m.sandbox.paypal.com',
]);

function getPayPalConfig() {
  const clientId = (
    process.env.PAYPAL_CLIENT_ID || process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID || ''
  ).trim();
  const clientSecret = (process.env.PAYPAL_CLIENT_SECRET || '').trim();
  const configuredBaseUrl = (process.env.PAYPAL_API_BASE_URL || '').trim().replace(/\/+$/, '');
  const fallbackBaseUrl =
    process.env.NODE_ENV === 'production'
      ? 'https://api-m.paypal.com'
      : 'https://api-m.sandbox.paypal.com';
  const baseUrl = configuredBaseUrl || fallbackBaseUrl;

  if (!clientId || !clientSecret) {
    throw new OrderValidationError(
      'PayPal 서버 결제 설정이 없습니다. PAYPAL_CLIENT_ID와 PAYPAL_CLIENT_SECRET을 확인하세요.',
      503,
    );
  }
  if (!ALLOWED_PAYPAL_API_ORIGINS.has(baseUrl)) {
    throw new OrderValidationError('PAYPAL_API_BASE_URL이 허용된 PayPal API 주소가 아닙니다.', 500);
  }

  return { clientId, clientSecret, baseUrl };
}

function getExpectedPayment(expectedTotalKrw: number) {
  const currency = normalizePayPalCurrency(
    process.env.PAYPAL_CURRENCY || process.env.NEXT_PUBLIC_PAYPAL_CURRENCY,
  );
  const publicRate = normalizeKrwPerUsd(process.env.NEXT_PUBLIC_PAYPAL_KRW_PER_USD);
  const serverRate = normalizeKrwPerUsd(
    process.env.PAYPAL_KRW_PER_USD || process.env.NEXT_PUBLIC_PAYPAL_KRW_PER_USD,
  );

  if (process.env.PAYPAL_KRW_PER_USD && Math.abs(publicRate - serverRate) > 0.000001) {
    throw new OrderValidationError(
      'PAYPAL_KRW_PER_USD와 NEXT_PUBLIC_PAYPAL_KRW_PER_USD를 동일하게 설정하세요.',
      500,
    );
  }

  return {
    currency,
    value: getPayPalOrderAmount(expectedTotalKrw, currency, publicRate),
  };
}

async function getAccessToken(): Promise<PayPalSession> {
  const config = getPayPalConfig();
  const response = await fetch(`${config.baseUrl}/v1/oauth2/token`, {
    method: 'POST',
    cache: 'no-store',
    headers: {
      Authorization: `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
    signal: AbortSignal.timeout(10_000),
  });
  const payload = (await response.json().catch(() => null)) as { access_token?: string } | null;
  if (!response.ok || !payload?.access_token) {
    throw new OrderValidationError('PayPal 결제 인증에 실패했습니다.', 502);
  }

  return { accessToken: payload.access_token, baseUrl: config.baseUrl };
}

async function fetchOrder(session: PayPalSession, orderId: string) {
  const response = await fetch(
    `${session.baseUrl}/v2/checkout/orders/${encodeURIComponent(orderId)}`,
    {
      method: 'GET',
      cache: 'no-store',
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(10_000),
    },
  );
  const order = (await response.json().catch(() => null)) as PayPalOrderResponse | null;
  if (!response.ok || !order) {
    throw new OrderValidationError('PayPal 주문을 서버에서 확인하지 못했습니다.', 502);
  }
  return order;
}

function amountsMatch(actual: string, expected: string) {
  const actualNumber = Number(actual);
  const expectedNumber = Number(expected);
  return (
    Number.isFinite(actualNumber) &&
    Number.isFinite(expectedNumber) &&
    Math.abs(actualNumber - expectedNumber) < 0.005
  );
}

function assertAmount(
  amount: { currency_code?: string; value?: string } | undefined,
  expected: { currency: string; value: string },
) {
  const actualCurrency = amount?.currency_code?.toUpperCase() || '';
  const actualValue = amount?.value || '';
  if (actualCurrency !== expected.currency || !amountsMatch(actualValue, expected.value)) {
    throw new OrderValidationError('PayPal 결제 금액 또는 통화가 주문 금액과 일치하지 않습니다.', 409);
  }
  return actualValue;
}

function getCompletedPayment(
  order: PayPalOrderResponse,
  orderId: string,
  expected: { currency: string; value: string },
) {
  if (order.id !== orderId || order.status?.toUpperCase() !== 'COMPLETED') {
    throw new OrderValidationError('완료된 PayPal 결제가 아닙니다.', 409);
  }

  const captures = (order.purchase_units || []).flatMap(
    (unit) => unit.payments?.captures || [],
  );
  const capture = captures.find(
    (candidate) => candidate.status?.toUpperCase() === 'COMPLETED' && candidate.id,
  );
  if (!capture?.id) {
    throw new OrderValidationError('완료된 PayPal capture를 확인하지 못했습니다.', 409);
  }

  return {
    orderId,
    captureId: capture.id,
    status: 'COMPLETED',
    currency: expected.currency,
    value: assertAmount(capture.amount, expected),
  };
}

function assertReadyForCapture(
  order: PayPalOrderResponse,
  orderId: string,
  expected: { currency: string; value: string },
) {
  if (order.id !== orderId) {
    throw new OrderValidationError('PayPal 주문 ID가 일치하지 않습니다.', 409);
  }
  if (order.status?.toUpperCase() !== 'APPROVED') {
    throw new OrderValidationError('승인된 PayPal 주문이 아닙니다.', 409);
  }
  if (order.purchase_units?.length !== 1) {
    throw new OrderValidationError('PayPal 주문의 결제 단위 구성이 올바르지 않습니다.', 409);
  }
  assertAmount(order.purchase_units[0]?.amount, expected);
}

export async function capturePayPalOrder(
  input: {
    orderId: string;
    expectedTotalKrw: number;
  },
  beforeCapture: () => Promise<void>,
) {
  const orderId = input.orderId.trim();
  if (!/^[A-Za-z0-9_-]{6,64}$/.test(orderId)) {
    throw new OrderValidationError('PayPal 주문 ID 형식이 올바르지 않습니다.');
  }

  const expected = getExpectedPayment(input.expectedTotalKrw);
  const session = await getAccessToken();
  const currentOrder = await fetchOrder(session, orderId);

  if (currentOrder.status?.toUpperCase() === 'COMPLETED') {
    const completedPayment = getCompletedPayment(currentOrder, orderId, expected);
    await beforeCapture();
    return completedPayment;
  }

  assertReadyForCapture(currentOrder, orderId, expected);
  await beforeCapture();

  const captureResponse = await fetch(
    `${session.baseUrl}/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`,
    {
      method: 'POST',
      cache: 'no-store',
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
        'PayPal-Request-Id': `enico-${orderId}`.slice(0, 38),
      },
      body: '{}',
      signal: AbortSignal.timeout(15_000),
    },
  );
  const capturedOrder = (await captureResponse.json().catch(() => null)) as
    | PayPalOrderResponse
    | null;

  if (captureResponse.ok && capturedOrder) {
    return getCompletedPayment(capturedOrder, orderId, expected);
  }

  // A timed-out/retried request may have completed at PayPal even when this response failed.
  const recoveredOrder = await fetchOrder(session, orderId);
  if (recoveredOrder.status?.toUpperCase() === 'COMPLETED') {
    return getCompletedPayment(recoveredOrder, orderId, expected);
  }

  throw new OrderValidationError('PayPal 결제 승인에 실패했습니다. 결제 상태를 확인해 주세요.', 502);
}
