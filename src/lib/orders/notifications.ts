import 'server-only';
import { createHash, randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { buildOrderAlimtalk } from './alimtalkMessage';
import { BANK_ACCOUNT } from './bankAccount';
import { buildOrderNotificationMessage, type NotificationMessageOrder, type OrderNotificationEvent } from './notificationMessage';
export type { OrderNotificationEvent } from './notificationMessage';
import { parseOrderRawPayload } from './rawPayload';
import { getShippingNotificationRevision } from './shippingWorkflow';
import { sendOrderNotificationMessage, type OrderNotificationResult } from './notificationProviders';
import type { PhoneRelayDeliveryMetadata } from './phoneRelayDelivery';

export type NotificationChannel = 'adminEmail' | 'customerEmail' | 'customerSms' | 'adminSms' | 'customerKakao';
type ChannelRecord = Omit<OrderNotificationResult, 'status'> & Partial<Omit<PhoneRelayDeliveryMetadata, 'status'>> & {
  status: OrderNotificationResult['status'] | 'sending'; attemptedAt?: string; attemptId?: string;
};
export type NotificationSummary = { event: OrderNotificationEvent; eventKey: string; createdAt: string; shipment?: { company: string | null; trackingNumber: string | null; revision: number }; channels: Partial<Record<NotificationChannel, ChannelRecord>> };
type NotificationOrder = NotificationMessageOrder;
const ORDER_COLUMNS = 'id,order_code,guest_order_number,channel,payment_method,payment_status,amount_total,currency,customer_name,customer_email,customer_phone,bank_name,bank_account_number,items,shipping_status,shipping_company,tracking_number,raw_payload';
const CHANNELS: NotificationChannel[] = ['adminEmail', 'customerEmail', 'customerSms', 'adminSms', 'customerKakao'];
// customerSms is a legacy selector mapped to Kakao only when explicitly configured.
const DEFAULT_CHANNELS: NotificationChannel[] = ['customerSms', 'adminEmail', 'customerEmail'];


function readEvents(raw: unknown): Record<string, NotificationSummary> {
  const value = parseOrderRawPayload(raw)?.notifications;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const events = (value as { events?: unknown }).events;
  return events && typeof events === 'object' && !Array.isArray(events)
    ? events as Record<string, NotificationSummary> : {};
}

/** Status metadata only; never return the raw payment payload or message text. */
export function getOrderNotificationHistory(raw: unknown): NotificationSummary[] {
  return Object.values(readEvents(raw)).filter(e => e && typeof e.eventKey === 'string')
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    .map(e => ({ event: e.event, eventKey: e.eventKey, createdAt: e.createdAt,
      channels: Object.fromEntries(Object.entries(e.channels || {}).filter(([key]) => CHANNELS.includes(key as NotificationChannel))
        .map(([key, record]) => [key, { status: record.status, attemptedAt: record.attemptedAt,
          ...(key === 'customerSms' || key === 'adminSms' || key === 'customerKakao' ? { deliveryConfirmed: false } : {}),
          ...(['phone_relay', 'solapi_alimtalk'].includes(record.provider || '') ? { provider: record.provider } : {}),
          ...(record.providerId ? { providerId: record.providerId } : {}), ...(record.errorCode ? { errorCode: record.errorCode } : {}) }])) }));
}

export function getOrderNotificationSummary(raw: unknown) {
  return getOrderNotificationHistory(raw)[0] || null;
}

/** Project the consumer's latest outcome without ever rewriting financial JSON. */
export async function projectPhoneRelayOrderNotifications<T extends {
  id: string; notifications: NotificationSummary | null; notificationHistory: NotificationSummary[];
}>(_client: SupabaseClient, orders: T[]): Promise<T[]> {
  function relayCandidate(summary: NotificationSummary) {
    const message = summary.channels.customerSms;
    return message && (message.provider === 'phone_relay'
      || ['queued', 'claimed', 'submitted', 'stale', 'sending'].includes(message.status)
      || (message.status === 'unknown' && message.errorCode?.startsWith('PHONE_RELAY_')));
  }
  function project(summary: NotificationSummary | null): NotificationSummary | null {
    const message = summary?.channels.customerSms;
    if (!summary || !message || !relayCandidate(summary)) return summary;
    // The retired queue is never queried. Preserve terminal history without
    // implying receipt; old pending work cannot remain advertised as active.
    return { ...summary, channels: { ...summary.channels, customerSms: { ...message,
      ...(['queued', 'claimed', 'sending'].includes(message.status)
        ? { status: message.status === 'queued' ? 'skipped' : 'unknown', errorCode: 'PHONE_RELAY_RETIRED', reasonCode: 'PHONE_RELAY_RETIRED' } : {}),
      deliveryConfirmed: false } } };
  }
  return orders.map(order => ({ ...order, notifications: project(order.notifications),
    notificationHistory: order.notificationHistory.map(summary => project(summary) as NotificationSummary) }));
}

export function getCurrentOrderNotificationEvent(order: { payment_method: string | null; payment_status: string | null; shipping_status: string | null; raw_payload?: unknown }): OrderNotificationEvent | null {
  const payment = (order.payment_status || '').trim().toLowerCase();
  const method = (order.payment_method || '').trim().toLowerCase();
  const shipping = (order.shipping_status || '').trim().toLowerCase();
  if (payment === 'refund_pending') return 'refund_pending';
  if (payment === 'cancelled') return parseOrderRawPayload(order.raw_payload)?.refundStatus === 'completed' ? 'refunded' : 'cancelled';
  if (method === 'bank_transfer' && payment === 'pending_transfer') return 'order_received';
  const confirmed = method === 'bank_transfer' ? payment === 'transfer_confirmed'
    : method === 'nicepay' ? payment === 'paid'
      : method === 'paypal' && ['captured', 'completed'].includes(payment);
  if (!confirmed) return null;
  if (shipping === 'delivered') return 'delivered';
  if (shipping === 'shipping') return 'shipping_started';
  return 'payment_confirmed';
}

function eventApplies(order: NotificationOrder, event: OrderNotificationEvent) {
  if (event === 'refunded') return order.payment_status.toLowerCase() === 'cancelled' &&
    parseOrderRawPayload(order.raw_payload)?.refundStatus === 'completed';
  return getCurrentOrderNotificationEvent(order) === event;
}

function shipmentEventKey(order: NotificationOrder, event: OrderNotificationEvent, revision: number) {
  const shipment = event === 'shipping_started' || event === 'delivered'
    ? `${order.shipping_company}:${order.tracking_number}${revision ? `:revision:${revision}` : ''}` : '';
  return createHash('sha256').update(`${order.id}:${event}:${shipment}`).digest('hex');
}
function notificationEventKey(order: NotificationOrder, event: OrderNotificationEvent) {
  return shipmentEventKey(order, event, getShippingNotificationRevision(order.raw_payload));
}

async function readOrder(client: SupabaseClient, id: string) {
  const { data, error } = await client.from('orders').select(ORDER_COLUMNS).eq('id', id).maybeSingle();
  if (error || !data) throw new Error('notification_order_unavailable');
  return data as NotificationOrder;
}

/** Compare the complete JSON value to avoid overwriting concurrent refund/payment metadata. */
async function writeEvent(client: SupabaseClient, order: NotificationOrder, event: NotificationSummary) {
  const raw = parseOrderRawPayload(order.raw_payload) || {};
  const payload = { ...raw, notifications: { version: 1, events: { ...readEvents(raw), [event.eventKey]: event } } };
  let query = client.from('orders').update({ raw_payload: payload, updated_at: new Date().toISOString() })
    .eq('id', order.id).eq('payment_status', order.payment_status);
  for (const field of ['shipping_status', 'shipping_company', 'tracking_number'] as const) {
    query = order[field] === null ? query.is(field, null) : query.eq(field, order[field]);
  }
  query = order.raw_payload === null ? query.is('raw_payload', null)
    : query.eq('raw_payload', JSON.stringify(order.raw_payload));
  const { data, error } = await query.select('id').maybeSingle();
  if (error) throw new Error('notification_status_save_failed');
  return Boolean(data);
}


export async function dispatchOrderNotifications(client: SupabaseClient, orderId: string, event: OrderNotificationEvent,
  options: { channels?: NotificationChannel[]; retry?: boolean } = {}): Promise<NotificationSummary> {
  const initial = await readOrder(client, orderId);
  const eventKey = notificationEventKey(initial, event);
  const base: NotificationSummary = readEvents(initial.raw_payload)[eventKey] || { event, eventKey, createdAt: new Date().toISOString(),
    ...(['shipping_started', 'delivered'].includes(event) ? { shipment: { company: initial.shipping_company,
      trackingNumber: initial.tracking_number, revision: getShippingNotificationRevision(initial.raw_payload) } } : {}), channels: {} };
  if (!eventApplies(initial, event)) return { ...base, channels: Object.fromEntries(CHANNELS.map(c => [c, { status: 'skipped', errorCode: 'order_state_changed' }])) };
  const alimtalkMode = process.env.ORDER_CUSTOMER_MESSAGE_CHANNEL === 'alimtalk';
  // Retired SMS selectors may only resolve to the existing configured Kakao channel.
  // SMS retries and old clients cannot enqueue or fall back to a paid provider.
  const channels = [...new Set((options.channels || DEFAULT_CHANNELS)
    .map(c => alimtalkMode && c === 'customerSms' ? 'customerKakao' as const : c))]
    .filter(c => CHANNELS.includes(c) && c !== 'customerSms' && c !== 'adminSms');
  for (const channel of channels) {
    const attemptId = randomUUID();
    let claimed: NotificationOrder | null = null;
    for (let attempt = 0; attempt < 6; attempt++) {
      const current = await readOrder(client, orderId);
      // A new carrier/tracking number is a different shipment event. Never
      // claim its message under the older event's idempotency key.
      if (!eventApplies(current, event) || notificationEventKey(current, event) !== eventKey) break;
      const existing = readEvents(current.raw_payload)[eventKey] || base;
      const previous = existing.channels[channel];
      if (channel === 'customerKakao' || channel === 'customerSms') {
        const other = existing.channels[channel === 'customerKakao' ? 'customerSms' : 'customerKakao'];
        // Switching providers/retrying an old event never repeats a message
        // that was already accepted or whose outcome remains uncertain.
        if (other && ['queued', 'claimed', 'submitted', 'stale', 'sent', 'unknown', 'sending'].includes(other.status)) break;
      }
      // An unknown provider result can have incurred a charge/delivered a message.
      // Never blindly repeat it, including from the administrator retry button.
      if (previous && ['queued', 'claimed', 'submitted', 'stale', 'sent', 'unknown', 'sending'].includes(previous.status)) break;
      const next: NotificationSummary = { ...existing, channels: { ...existing.channels,
        [channel]: { status: 'sending' as OrderNotificationResult['status'], attemptedAt: new Date().toISOString(), attemptId } } };
      if (await writeEvent(client, current, next)) { claimed = current; break; }
    }
    if (!claimed) continue;
    const beforeSend = await readOrder(client, orderId);
    if (readEvents(beforeSend.raw_payload)[eventKey]?.channels[channel]?.attemptId !== attemptId) continue;
    const stillApplies = eventApplies(beforeSend, event) && notificationEventKey(beforeSend, event) === eventKey;
    const isAdmin = channel.startsWith('admin');
    const to = channel === 'adminEmail' ? process.env.ORDER_NOTIFICATION_EMAIL || 'morba9850@gmail.com'
      : channel === 'adminSms' ? process.env.ADMIN_NOTIFICATION_PHONE || ''
      : channel === 'customerEmail' ? beforeSend.customer_email : beforeSend.customer_phone;
    const message = buildOrderNotificationMessage(beforeSend, event, isAdmin);
    let result: OrderNotificationResult = { status: 'skipped', errorCode: 'order_state_changed' };
    if (stillApplies) {
      if (channel === 'customerKakao') {
        const kakao = buildOrderAlimtalk(beforeSend, event);
        try {
          result = kakao ? await sendOrderNotificationMessage({ channel, eventKey: `${eventKey}:${channel}`, to,
            subject: message.subject, ...kakao })
            : { status: 'skipped', errorCode: 'ALIMTALK_EVENT_OR_CONTENT_UNAVAILABLE' };
        } catch {
          result = { status: 'unknown', provider: 'solapi_alimtalk', errorCode: 'notification_provider_outcome_unknown' };
        }
      } else {
        result = { status: 'not_configured' };
      }
      // Only email channels reach this adapter; Kakao never falls back to SMS.
      if (result.status === 'not_configured' && channel !== 'customerKakao') {
        try {
          result = await sendOrderNotificationMessage({ channel, eventKey: `${eventKey}:${channel}`, to,
            ...message, replyTo: isAdmin ? beforeSend.customer_email : 'morba9850@gmail.com' });
        } catch {
          // The provider may have accepted before the connection failed. Record
          // an uncertain result and never automatically duplicate that message.
          result = { status: 'unknown', errorCode: 'notification_provider_outcome_unknown' };
        }
      }
    }
    let saved = false;
    for (let attempt = 0; attempt < 6; attempt++) {
      const current = await readOrder(client, orderId);
      const existing = readEvents(current.raw_payload)[eventKey];
      if (!existing || existing.channels[channel]?.attemptId !== attemptId) break;
      saved = await writeEvent(client, current, { ...existing, channels: { ...existing.channels,
        [channel]: { ...result, attemptedAt: existing.channels[channel]?.attemptedAt, attemptId } } });
      if (saved) break;
    }
    if (!saved) console.error('Order notification result needs reconciliation', { orderId, eventKey, channel });
  }
  return readEvents((await readOrder(client, orderId)).raw_payload)[eventKey] || base;
}

export { BANK_ACCOUNT };
