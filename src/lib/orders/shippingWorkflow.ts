import { parseOrderRawPayload } from './rawPayload';

export type ShippingStatus = 'preparing' | 'shipping' | 'delivered';
type ShippingOrder = {
  payment_method: string | null; payment_status: string | null;
  shipping_status: string | null; shipping_company?: string | null; tracking_number?: string | null;
  shipping_note?: string | null; shipped_at?: string | null; delivered_at?: string | null; raw_payload: unknown;
};
type ShippingPatch = {
  shippingStatus?: ShippingStatus | null; shippingCompany?: string;
  trackingNumber?: string; shippingNote?: string;
};
export type ShippingHistoryEntry = {
  changedAt: string; actor: 'admin'; kind: 'status_changed' | 'tracking_corrected' | 'details_changed';
  from: ShippingStatus; to: ShippingStatus;
  previousCompany: string | null; shippingCompany: string | null;
  previousTrackingNumber: string | null; trackingNumber: string | null;
};
const NEXT_STATUS: Record<ShippingStatus, ShippingStatus | null> = {
  preparing: 'shipping', shipping: 'delivered', delivered: null,
};
const text = (value: unknown) => typeof value === 'string' && value.trim() ? value.trim() : null;

export function normalizeShippingState(value: unknown): ShippingStatus | null {
  const normalized = text(value)?.toLowerCase();
  return normalized === 'preparing' || normalized === 'shipping' || normalized === 'delivered' ? normalized : null;
}
export function getShippingNotificationRevision(raw: unknown): number {
  const value = parseOrderRawPayload(raw)?.shippingNotificationRevision;
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : 0;
}
export function getShippingHistory(raw: unknown): ShippingHistoryEntry[] {
  const history = parseOrderRawPayload(raw)?.shippingHistory;
  if (!Array.isArray(history)) return [];
  return history.filter((entry): entry is ShippingHistoryEntry => Boolean(entry && typeof entry === 'object'
    && !Array.isArray(entry) && typeof entry.changedAt === 'string' && Number.isFinite(Date.parse(entry.changedAt))
    && entry.actor === 'admin' && ['status_changed', 'tracking_corrected', 'details_changed'].includes(entry.kind)
    && normalizeShippingState(entry.from) && normalizeShippingState(entry.to)))
    .map(entry => ({ changedAt: entry.changedAt, actor: 'admin', kind: entry.kind,
      from: entry.from, to: entry.to, previousCompany: text(entry.previousCompany), shippingCompany: text(entry.shippingCompany),
      previousTrackingNumber: text(entry.previousTrackingNumber), trackingNumber: text(entry.trackingNumber) }));
}
export function isCurrentTrackingCorrection(order: {
  shipping_status: string | null; shipping_company: string | null; tracking_number: string | null; raw_payload: unknown;
}) {
  const latest = getShippingHistory(order.raw_payload).filter(entry => entry.kind !== 'details_changed').at(-1);
  return latest?.kind === 'tracking_corrected' && latest.to === order.shipping_status
    && latest.shippingCompany === text(order.shipping_company) && latest.trackingNumber === text(order.tracking_number);
}
export function hasConfirmedPayment(order: Pick<ShippingOrder, 'payment_method' | 'payment_status'>) {
  const method = text(order.payment_method)?.toLowerCase();
  const status = text(order.payment_status)?.toLowerCase();
  return method === 'bank_transfer' ? status === 'transfer_confirmed'
    : method === 'nicepay' ? status === 'paid'
      : method === 'paypal' && (status === 'captured' || status === 'completed');
}

/** Pure, fixture-testable policy. Timestamps and audit history never regress. */
export function prepareShippingUpdate(order: ShippingOrder, patch: ShippingPatch, now: string,
  effectivePaymentStatus = order.payment_status): { ok: false; message: string } | {
    ok: true; update: Record<string, unknown>; changed: boolean; notifyShipment: boolean;
  } {
  const current = normalizeShippingState(order.shipping_status) || (order.shipping_status == null ? 'preparing' : null);
  if (!current) return { ok: false, message: '현재 배송 상태를 확인할 수 없습니다. 새로고침 후 확인해 주세요.' };
  const next = patch.shippingStatus || current;
  if (next !== current && NEXT_STATUS[current] !== next) {
    return { ok: false, message: '배송은 준비중 → 배송중 → 배송완료 순서로만 변경할 수 있습니다. 이전 단계로 되돌릴 수 없습니다.' };
  }
  const company = patch.shippingCompany === undefined ? text(order.shipping_company) : text(patch.shippingCompany);
  const tracking = patch.trackingNumber === undefined ? text(order.tracking_number) : text(patch.trackingNumber);
  const note = patch.shippingNote === undefined ? text(order.shipping_note) : text(patch.shippingNote);
  const trackingChanged = company !== text(order.shipping_company) || tracking !== text(order.tracking_number);
  const changed = next !== current || trackingChanged || note !== text(order.shipping_note);
  if (changed && next !== 'preparing') {
    if (!hasConfirmedPayment({ ...order, payment_status: effectivePaymentStatus })) {
      return { ok: false, message: '결제가 확인된 주문만 출고하거나 배송 정보를 변경할 수 있습니다.' };
    }
    if (!company || !tracking) return { ok: false, message: '배송중·배송완료 주문에는 택배사와 운송장 번호가 필요합니다.' };
  }
  if (!changed) return { ok: true, update: {}, changed: false, notifyShipment: false };
  const update: Record<string, unknown> = { shipping_status: next, shipping_company: company, tracking_number: tracking, shipping_note: note };
  if (next !== current) {
    if (next === 'shipping') update.shipped_at = order.shipped_at || now;
    if (next === 'delivered') update.delivered_at = order.delivered_at || now;
  }
  const raw = parseOrderRawPayload(order.raw_payload) || {};
  const history = Array.isArray(raw.shippingHistory) ? raw.shippingHistory : [];
  const entry: ShippingHistoryEntry = { changedAt: now, actor: 'admin',
    kind: next !== current ? 'status_changed' : current !== 'preparing' && trackingChanged ? 'tracking_corrected' : 'details_changed',
    from: current, to: next, previousCompany: text(order.shipping_company), shippingCompany: company,
    previousTrackingNumber: text(order.tracking_number), trackingNumber: tracking };
  update.raw_payload = { ...raw, shippingHistory: [...history, entry],
    ...(current !== 'preparing' && trackingChanged ? { shippingNotificationRevision: getShippingNotificationRevision(raw) + 1 } : {}) };
  return { ok: true, update, changed: true, notifyShipment: next !== 'preparing' && (next !== current || trackingChanged) };
}
