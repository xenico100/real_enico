import 'server-only';

import { createHash, randomBytes } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { revalidateTag } from 'next/cache';
import { getNicepayApiBaseUrl, verifyNicepayApprovalSignature } from '@/lib/orders/nicepay';
import { releaseCheckoutProducts } from '@/lib/orders/checkoutClaims';
import { parseOrderRawPayload } from '@/lib/orders/rawPayload';
import { dispatchOrderNotifications } from '@/lib/orders/notifications';
import {
  extractPersistentProductIds,
} from '@/lib/storefront/productAvailability';
import {
  fetchProductAvailabilitySnapshot,
  restoreProductsAvailability,
} from '@/lib/storefront/productAvailabilityDb';

type CancelActor = 'member' | 'admin';

type CancelableOrderRow = {
  id: string;
  order_code: string | null;
  payment_method: string | null;
  payment_status: string | null;
  shipping_status: string | null;
  amount_total: number | string | null;
  raw_payload: unknown;
  items: unknown;
};

type NicepayCancelSource = {
  rawPayload: Record<string, unknown>;
  tid: string;
  paymentOrderId: string;
};

function normalizeText(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeNumber(value: unknown) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function normalizeObject(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function normalizeItems(value: unknown) {
  if (Array.isArray(value)) {
    return value;
  }

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  return [];
}

function sha256Hex(value: string) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function truncateUtf8(value: string, maxBytes: number) {
  let truncated = '';
  let byteLength = 0;
  for (const character of value) {
    const nextLength = Buffer.byteLength(character, 'utf8');
    if (byteLength + nextLength > maxBytes) break;
    truncated += character;
    byteLength += nextLength;
  }
  return truncated;
}

function getNicepayCancelConfig() {
  const clientKey = process.env.NICEPAY_CLIENT_KEY?.trim() || '';
  const secretKey = process.env.NICEPAY_SECRET_KEY?.trim() || '';

  if (!clientKey || !secretKey) {
    throw new Error('NICEPAY_CLIENT_KEY / NICEPAY_SECRET_KEY 설정이 필요합니다.');
  }

  return { clientKey, secretKey };
}

function extractNicepayCancelSource(rawPayloadValue: unknown): NicepayCancelSource {
  const rawPayload = parseOrderRawPayload(rawPayloadValue) ?? {};
  const nicepay = normalizeObject(rawPayload.nicepay);
  const approval = normalizeObject(nicepay?.approval);
  const tid = normalizeText(nicepay?.tid) || normalizeText(approval?.tid);
  const paymentOrderId =
    normalizeText(nicepay?.orderId) || normalizeText(approval?.orderId);

  if (!tid) {
    throw new Error('NICE 거래키(tid)가 없어 결제 취소를 진행할 수 없습니다.');
  }

  if (!paymentOrderId) {
    throw new Error('NICE 주문번호(orderId)가 없어 결제 취소를 진행할 수 없습니다.');
  }

  return { rawPayload, tid, paymentOrderId };
}

function buildCancelRequestOrderId(baseOrderCode: string) {
  const fallback = baseOrderCode || 'nicepay-order';
  const suffix = `${Date.now()}-${randomBytes(3).toString('hex')}`;
  const ending = `-cancel-${suffix}`;
  return `${fallback.slice(0, 64 - ending.length)}${ending}`;
}

function validateCancelResponse(
  payload: Record<string, unknown> | null,
  options: {
    tid: string;
    secretKey: string;
    originalAmount: number;
  },
) {
  const resultCode = normalizeText(payload?.resultCode);
  const resultMsg = normalizeText(payload?.resultMsg);
  const tid = normalizeText(payload?.tid);
  const status = normalizeText(payload?.status).toLowerCase();
  const ediDate = normalizeText(payload?.ediDate);
  const signature = normalizeText(payload?.signature);
  const amount = Number(payload?.amount);
  const balanceAmount = Number(payload?.balanceAmt);

  if (resultCode !== '0000') {
    throw new Error(resultMsg || 'NICE 결제 취소 응답의 resultCode가 0000이 아닙니다.');
  }

  if (!tid || tid !== options.tid) {
    throw new Error('NICE 결제 취소 응답의 tid가 원거래와 일치하지 않습니다.');
  }

  if (status !== 'cancelled') {
    throw new Error('NICE 결제가 전액 취소됐는지 확인이 필요합니다. 재요청하지 말고 관리자에게 문의해 주세요.');
  }

  if (!Number.isSafeInteger(amount) || amount !== options.originalAmount) {
    throw new Error('NICE 결제 취소 응답의 원거래 금액이 주문 금액과 일치하지 않습니다.');
  }

  if (
    payload?.balanceAmt === null ||
    payload?.balanceAmt === undefined ||
    !Number.isSafeInteger(balanceAmount) ||
    balanceAmount !== 0
  ) {
    throw new Error('NICE 결제 취소 후 잔여 금액이 0원으로 확인되지 않았습니다.');
  }

  if (!ediDate || !verifyNicepayApprovalSignature({ tid, amount, ediDate, signature }, options.secretKey)) {
    throw new Error('NICE 결제 취소 응답의 signature 검증에 실패했습니다.');
  }
}

function buildUnconfirmedCancelError(orderCode: string) {
  return new Error(
    `NICE 주문 ${orderCode}의 취소 결과를 확인해야 합니다. 결제 취소를 다시 요청하지 말고 관리자에게 문의해 주세요.`,
  );
}

async function restoreOrderStatusAfterRejectedCancel(
  serviceClient: SupabaseClient,
  order: CancelableOrderRow,
) {
  let result: { data: { id: string } | null; error: { message: string } | null };
  try {
    result = (await serviceClient
      .from('orders')
      .update({
        payment_status: order.payment_status,
        updated_at: new Date().toISOString(),
      })
      .eq('id', order.id)
      .eq('payment_status', 'cancel_processing')
      .select('id')
      .maybeSingle()) as typeof result;
  } catch (error) {
    console.error('NICE cancel rejection status restoration request failed', {
      orderCode: order.order_code,
      error,
    });
    throw buildUnconfirmedCancelError(normalizeText(order.order_code));
  }

  const { data, error } = result;

  if (error || !data?.id) {
    console.error('NICE cancel rejection status restoration failed', {
      orderCode: order.order_code,
      error,
    });
    throw buildUnconfirmedCancelError(normalizeText(order.order_code));
  }
}

function buildCancelledRawPayload(
  rawPayloadValue: unknown,
  cancelPayload: Record<string, unknown> | null,
  meta: {
    actor: CancelActor;
    reason: string;
    cancelledAt: string;
  },
) {
  const rawPayload = parseOrderRawPayload(rawPayloadValue) ?? {};
  const nicepay = normalizeObject(rawPayload.nicepay) ?? {};
  const existingCancels = Array.isArray(nicepay.cancels) ? nicepay.cancels : [];

  return {
    ...rawPayload,
    cancelledAt: meta.cancelledAt,
    cancelledBy: meta.actor,
    cancelReason: meta.reason,
    nicepay: {
      ...nicepay,
      cancelReason: meta.reason,
      cancelledAt: meta.cancelledAt,
      cancelledBy: meta.actor,
      latestCancel: cancelPayload,
      cancels: [...existingCancels, cancelPayload],
    },
  };
}

async function restorePurchasedProducts(
  serviceClient: SupabaseClient,
  orderCode: string,
  items: unknown,
) {
  const normalizedItems = normalizeItems(items) as Array<{ id?: string }>;
  const productIds = extractPersistentProductIds(
    normalizedItems.filter((item): item is { id: string } => typeof item?.id === 'string'),
  );

  if (productIds.length === 0) return;

  const snapshot = await fetchProductAvailabilitySnapshot(serviceClient, productIds);
  if (!snapshot.hasRawColumn) {
    // is_published has no order provenance. Republishing it here could expose
    // an item deliberately unpublished by an administrator or another sale.
    console.warn('NICE cancellation requires manual inventory review before republishing', { orderCode });
    return;
  }
  if (snapshot.rows.length !== productIds.length) {
    throw new Error('취소 주문의 상품 재고 정보를 모두 찾지 못했습니다.');
  }
  await restoreProductsAvailability(serviceClient, snapshot.rows, {
    hasRawColumn: snapshot.hasRawColumn,
    orderCode,
    paymentMethod: 'nicepay',
  });

  revalidateTag('storefront-products', 'max');
}

export async function cancelNicepayOrder<TRow>({
  serviceClient,
  order,
  actor,
  reason,
  selectQuery,
}: {
  serviceClient: SupabaseClient;
  order: CancelableOrderRow;
  actor: CancelActor;
  reason: string;
  selectQuery: string;
}) {
  const paymentMethod = normalizeText(order.payment_method).toLowerCase();
  const paymentStatus = normalizeText(order.payment_status).toLowerCase();
  const shippingStatus = normalizeText(order.shipping_status).toLowerCase();
  const orderCode = normalizeText(order.order_code);

  if (paymentMethod !== 'nicepay') {
    throw new Error('NICE Payments 주문만 온라인 결제 취소를 지원합니다.');
  }

  if (paymentStatus === 'cancelled') {
    throw new Error('이미 결제취소가 완료된 주문입니다.');
  }

  if (paymentStatus === 'cancel_processing') {
    throw new Error('이미 NICE 취소 결과를 확인 중입니다. 다시 요청하지 말고 관리자에게 문의해 주세요.');
  }

  if (paymentStatus !== 'paid' && paymentStatus !== 'completed') {
    throw new Error('결제완료 상태의 NICE 주문만 취소할 수 있습니다.');
  }

  if (shippingStatus !== 'preparing') {
    throw new Error('배송이 시작된 주문은 온라인에서 취소할 수 없습니다.');
  }

  if (!orderCode) {
    throw new Error('주문번호가 없어 NICE 결제 취소를 진행할 수 없습니다.');
  }

  const { clientKey, secretKey } = getNicepayCancelConfig();
  const { tid } = extractNicepayCancelSource(order.raw_payload);
  const originalAmount = normalizeNumber(order.amount_total);
  if (!Number.isSafeInteger(originalAmount) || originalAmount <= 0) {
    throw new Error('NICE 원거래 금액을 확인할 수 없어 결제 취소를 진행하지 않았습니다.');
  }
  const cancelReason = truncateUtf8(reason.trim() || 'customer_cancel', 100);
  const cancelOrderId = buildCancelRequestOrderId(orderCode);
  const ediDate = new Date().toISOString();
  const signData = sha256Hex(`${tid}${ediDate}${secretKey}`);

  const { data: claimedOrder, error: claimError } = await serviceClient
    .from('orders')
    .update({
      payment_status: 'cancel_processing',
      updated_at: new Date().toISOString(),
    })
    .eq('id', order.id)
    .eq('payment_method', 'nicepay')
    .eq('payment_status', order.payment_status)
    .eq('shipping_status', 'preparing')
    .select('id')
    .maybeSingle();

  if (claimError) {
    throw new Error(`NICE 취소 처리 상태 선점에 실패했습니다: ${claimError.message}`);
  }
  if (!claimedOrder?.id) {
    throw new Error('이미 다른 취소 요청이나 배송 상태 변경이 진행 중입니다. 주문 상태를 새로 확인해 주세요.');
  }

  let response: Response;
  try {
    response = await fetch(
      `${getNicepayApiBaseUrl(clientKey)}/v1/payments/${encodeURIComponent(tid)}/cancel`,
      {
        method: 'POST',
        cache: 'no-store',
        headers: {
          Authorization: `Basic ${Buffer.from(`${clientKey}:${secretKey}`).toString('base64')}`,
          'Content-Type': 'application/json;charset=utf-8',
        },
        signal: AbortSignal.timeout(10000),
        body: JSON.stringify({
          reason: cancelReason,
          orderId: cancelOrderId,
          ediDate,
          signData,
          returnCharSet: 'utf-8',
        }),
      },
    );
  } catch (error) {
    console.error('NICE cancel response was not received', { orderCode, error });
    throw buildUnconfirmedCancelError(orderCode);
  }

  const cancelPayload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  const resultCode = normalizeText(cancelPayload?.resultCode);
  const responseStatus = normalizeText(cancelPayload?.status).toLowerCase();
  const hasCancelTransaction = Boolean(normalizeText(cancelPayload?.cancelledTid));
  if (
    resultCode &&
    resultCode !== '0000' &&
    responseStatus !== 'cancelled' &&
    responseStatus !== 'partialcancelled' &&
    !hasCancelTransaction
  ) {
    await restoreOrderStatusAfterRejectedCancel(serviceClient, order);
    throw new Error(
      normalizeText(cancelPayload?.resultMsg) ||
        normalizeText(cancelPayload?.message) ||
        'NICE 결제 취소 요청이 거절되었습니다.',
    );
  }
  if (!response.ok || resultCode !== '0000') {
    console.error('NICE cancel returned an ambiguous response', {
      orderCode,
      httpStatus: response.status,
      resultCode,
    });
    throw buildUnconfirmedCancelError(orderCode);
  }

  try {
    validateCancelResponse(cancelPayload, { tid, secretKey, originalAmount });
  } catch (error) {
    console.error('NICE cancel success response could not be verified', { orderCode, error });
    throw buildUnconfirmedCancelError(orderCode);
  }

  const cancelledAt = new Date().toISOString();
  let cancelledOrder: TRow | null = null;
  try {
    // Only retry local persistence after the provider's verified cancellation.
    // Notification workers may update raw_payload while the provider is running.
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const latest = await serviceClient.from('orders')
        .select('id, payment_status, shipping_status, raw_payload')
        .eq('id', order.id)
        .maybeSingle();
      if (latest.error || !latest.data || latest.data.payment_status !== 'cancel_processing' ||
          latest.data.shipping_status !== order.shipping_status) {
        throw new Error('NICE 취소 후 저장할 주문 상태를 확인하지 못했습니다.');
      }
      let query = serviceClient.from('orders').update({
        payment_status: 'cancelled',
        updated_at: cancelledAt,
        raw_payload: buildCancelledRawPayload(latest.data.raw_payload, cancelPayload, {
          actor, reason: cancelReason, cancelledAt,
        }),
      }).eq('id', order.id).eq('payment_status', 'cancel_processing')
        .eq('shipping_status', order.shipping_status);
      query = latest.data.raw_payload === null ? query.is('raw_payload', null)
        : query.eq('raw_payload', JSON.stringify(latest.data.raw_payload));
      const persisted = await query.select(selectQuery).maybeSingle();
      if (persisted.error) throw new Error(persisted.error.message);
      if (persisted.data) {
        cancelledOrder = persisted.data as TRow;
        break;
      }
    }
  } catch (error) {
    console.error('NICE cancel succeeded but order persistence request failed', { orderCode, error });
    throw buildUnconfirmedCancelError(orderCode);
  }

  if (!cancelledOrder) {
    console.error('NICE cancel succeeded but order persistence conflicted', { orderCode });
    throw buildUnconfirmedCancelError(orderCode);
  }

  try {
    await restorePurchasedProducts(serviceClient, orderCode, order.items);
  } catch (error) {
    console.error('Failed to restore product availability after NICE cancel', error);
  }

  try {
    await releaseCheckoutProducts(serviceClient, 'nicepay', orderCode);
  } catch (error) {
    console.error('Failed to release product claim after verified NICE cancellation', { orderCode, error });
  }

  try {
    await dispatchOrderNotifications(serviceClient, order.id, 'cancelled');
  } catch (error) {
    console.error('Failed to send NICE cancel notifications', error);
  }

  return cancelledOrder;
}
