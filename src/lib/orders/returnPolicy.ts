import { parseOrderRawPayload } from './rawPayload';
import { hasConfirmedPayment, normalizeShippingState } from './shippingWorkflow';

const RETURN_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export type ReturnPolicyOrder = {
  payment_method: string | null;
  payment_status: string | null;
  shipping_status: string | null;
  delivered_at: string | null;
  raw_payload: unknown;
};

export type ReturnEligibility = {
  eligible: boolean;
  reason: 'eligible' | 'not_delivered' | 'payment_unconfirmed' | 'delivery_time_missing' | 'window_elapsed' | 'already_requested';
  deadline: string | null;
  request: { status: 'requested'; requestedAt: string } | null;
};

/** Safe customer projection: no payment payload, internal actor IDs or request text. */
export function getReturnEligibility(order: ReturnPolicyOrder, now = Date.now()): ReturnEligibility {
  const existing = parseOrderRawPayload(order.raw_payload)?.returnRequest;
  if (existing != null) {
    const record = typeof existing === 'object' && !Array.isArray(existing)
      ? existing as Record<string, unknown> : null;
    const requestedAt = typeof record?.requestedAt === 'string' && Number.isFinite(Date.parse(record.requestedAt))
      ? record.requestedAt : null;
    return { eligible: false, reason: 'already_requested', deadline: null,
      request: record?.status === 'requested' && requestedAt ? { status: 'requested', requestedAt } : null };
  }
  if (!hasConfirmedPayment(order)) return { eligible: false, reason: 'payment_unconfirmed', deadline: null, request: null };
  if (normalizeShippingState(order.shipping_status) !== 'delivered') {
    return { eligible: false, reason: 'not_delivered', deadline: null, request: null };
  }
  const deliveredAt = typeof order.delivered_at === 'string' ? Date.parse(order.delivered_at) : Number.NaN;
  if (!Number.isFinite(deliveredAt) || !Number.isFinite(now) || deliveredAt > now) {
    return { eligible: false, reason: 'delivery_time_missing', deadline: null, request: null };
  }
  const deadlineDate = new Date(deliveredAt + RETURN_WINDOW_MS);
  if (!Number.isFinite(deadlineDate.getTime())) return { eligible: false, reason: 'delivery_time_missing', deadline: null, request: null };
  const deadline = deadlineDate.toISOString();
  return { eligible: now <= deliveredAt + RETURN_WINDOW_MS,
    reason: now <= deliveredAt + RETURN_WINDOW_MS ? 'eligible' : 'window_elapsed', deadline, request: null };
}

/** Read-only intake for an authenticated admin. Never expose the complete payload. */
export function getAdminReturnRequest(rawPayload: unknown): { status: 'requested'; requestedAt: string; reason: string } | null {
  const request = parseOrderRawPayload(rawPayload)?.returnRequest;
  if (!request || typeof request !== 'object' || Array.isArray(request)) return null;
  const record = request as Record<string, unknown>;
  if (record.status !== 'requested' || typeof record.requestedAt !== 'string'
    || !Number.isFinite(Date.parse(record.requestedAt)) || typeof record.reason !== 'string') return null;
  return { status: 'requested', requestedAt: record.requestedAt, reason: record.reason.slice(0, 1000) };
}
