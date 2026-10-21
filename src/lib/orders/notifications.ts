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
import { enqueuePhoneRelayMessage, getPhoneRelayHealth, getPhoneRelayOrderRevision } from './phoneRelay';
import { getPhoneRelayDeliveryMetadata, unavailablePhoneRelayDelivery, PHONE_RELAY_DELIVERY_COLUMNS,
  type PhoneRelayDeliveryMetadata, type PhoneRelayDeliveryRow } from './phoneRelayDelivery';

export type NotificationChannel = 'adminEmail' | 'customerEmail' | 'customerSms' | 'adminSms' | 'customerKakao';
type ChannelRecord = Omit<OrderNotificationResult, 'status'> & Partial<Omit<PhoneRelayDeliveryMetadata, 'status'>> & {
  status: OrderNotificationResult['status'] | 'sending'; attemptedAt?: string; attemptId?: string;
};
export type NotificationSummary = { event: OrderNotificationEvent; eventKey: string; createdAt: string; shipment?: { company: string | null; trackingNumber: string | null; revision: number }; channels: Partial<Record<NotificationChannel, ChannelRecord>> };
type NotificationOrder = NotificationMessageOrder;
const ORDER_COLUMNS = 'id,order_code,guest_order_number,channel,payment_method,payment_status,amount_total,currency,customer_name,customer_email,customer_phone,bank_name,bank_account_number,items,shipping_status,shipping_company,tracking_number,raw_payload';
const CHANNELS: NotificationChannel[] = ['adminEmail', 'customerEmail', 'customerSms', 'adminSms', 'customerKakao'];
const DEFAULT_CHANNELS: NotificationChannel[] = ['customerSms', 'adminEmail', 'customerEmail', 'adminSms'];


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
}>(client: SupabaseClient, orders: T[]): Promise<T[]> {
  function relayCandidate(summary: NotificationSummary) {
    const message = summary.channels.customerSms;
    return message && (message.provider === 'phone_relay'
      || ['queued', 'claimed', 'submitted', 'stale', 'sending'].includes(message.status)
      || (message.status === 'unknown' && message.errorCode?.startsWith('PHONE_RELAY_')));
  }
  const eventKeys = [...new Set(orders.flatMap(order => order.notificationHistory
    .filter(relayCandidate).filter(summary => /^[a-f0-9]{64}$/.test(summary.eventKey))
    .map(summary => `${summary.eventKey}:customerSms`)))];
  if (!eventKeys.length) return orders;
  const jobs = new Map<string, PhoneRelayDeliveryRow>();
  // event_key is globally UNIQUE. A bounded chunk cannot be silently truncated
  // by PostgREST's default row limit, even for a long order history.
  for (let offset = 0; offset < eventKeys.length; offset += 100) {
    const chunk = eventKeys.slice(offset, offset + 100);
    try {
      const { data, error } = await client.from('phone_relay_jobs').select(PHONE_RELAY_DELIVERY_COLUMNS)
        .in('event_key', chunk).eq('kind', 'customer_sms');
      if (!error) for (const job of data || []) {
        if (typeof job.event_key === 'string' && chunk.includes(job.event_key)) jobs.set(job.event_key, job as PhoneRelayDeliveryRow);
      }
    } catch { /* Missing rows remain explicit unknowns; never trigger delivery. */ }
  }
  function project(orderId: string, summary: NotificationSummary | null): NotificationSummary | null {
    const message = summary?.channels.customerSms;
    if (!summary || !message || !relayCandidate(summary)) return summary;
    const job = jobs.get(`${summary.eventKey}:customerSms`);
    // A capability-like provider ID in raw JSON never grants access to another
    // order's queue metadata. Match both immutable order and event identifiers.
    const matches = job && job.order_id === orderId
      && (!message.providerId || message.providerId === job.id);
    if (!matches && message.status === 'sending' && message.provider !== 'phone_relay') return summary;
    const metadata = matches ? getPhoneRelayDeliveryMetadata(job)
      : unavailablePhoneRelayDelivery(message.providerId);
    return { ...summary, channels: { ...summary.channels, customerSms: { ...message, ...metadata,
      ...(matches ? { providerId: job.id } : {}), errorCode: metadata.reasonCode || undefined } } };
  }
  return orders.map(order => ({ ...order, notifications: project(order.id, order.notifications),
    notificationHistory: order.notificationHistory.map(summary => project(order.id, summary) as NotificationSummary) }));
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

/** Existing relay SQL compares shipment fields, not this application's audit
 * revision. A→B→A can therefore make an older A job eligible again. Until an
 * atomic SQL revision upgrade is available, an unresolved older A must own the
 * SMS outcome: save the correction, send email, and require reconciliation.
 * This read-only check never cancels jobs or repeats an uncertain message. */
async function hasUnresolvedPriorShipment(client: SupabaseClient, order: NotificationOrder,
  event: OrderNotificationEvent, currentKey: string) {
  if (!['shipping_started', 'delivered'].includes(event) || !getShippingNotificationRevision(order.raw_payload)) return false;
  const previousKeys = new Set(Object.values(readEvents(order.raw_payload)).filter(summary => summary
    && summary.event === event && summary.eventKey !== currentKey && summary.channels?.customerSms
    && (summary.eventKey === shipmentEventKey(order, event, 0)
      || (summary.shipment?.company === order.shipping_company && summary.shipment?.trackingNumber === order.tracking_number)))
    .map(summary => summary.eventKey));
  if (!previousKeys.size) return false;
  const history = getOrderNotificationHistory(order.raw_payload).filter(summary => previousKeys.has(summary.eventKey));
  try {
    const [projected] = await projectPhoneRelayOrderNotifications(client,
      [{ id: order.id, notifications: null, notificationHistory: history }]);
    return projected.notificationHistory.some(summary => {
      const status = summary.channels.customerSms?.status;
      return !status || ['queued', 'claimed', 'sending', 'unknown'].includes(status);
    });
  } catch { return true; }
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
  // The transport choice is explicit and sticky: missing Kakao configuration or
  // a failed Kakao request must never silently become a phone relay/LMS send.
  const selectedChannels = [...new Set((options.channels || DEFAULT_CHANNELS)
    .map(c => alimtalkMode && c === 'customerSms' ? 'customerKakao' as const : c))].filter(c => CHANNELS.includes(c));
  const unresolvedPriorShipment = selectedChannels.includes('customerSms')
    && await hasUnresolvedPriorShipment(client, initial, event, eventKey);
  // Persist a customer job before the owner's wake-up email can reach Mail.
  // Keep every other channel's requested relative order unchanged.
  const channels = selectedChannels.includes('customerSms')
    ? ['customerSms' as const, ...selectedChannels.filter(c => c !== 'customerSms')]
    : selectedChannels;
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
      // Another dispatcher may be enqueuing the phone job. Let that claimant
      // finish and send the wake-up mail; sending here could consume the email
      // idempotency claim before a durable queued job exists.
      if (channel === 'adminEmail' && existing.channels.customerSms?.status === 'sending') break;
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
    // The email is a wake-up signal, never an instruction containing a recipient
    // to parse. The phone must fetch and claim the authenticated server queue.
    if (channel === 'adminEmail' && readEvents(beforeSend.raw_payload)[eventKey]?.channels.customerSms?.status === 'queued') {
      message.subject = `[ENICO PHONE] ${message.subject}`;
    }
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
      } else if (channel === 'customerSms') {
        if (unresolvedPriorShipment) {
          result = { status: 'unknown', errorCode: 'SHIPMENT_CORRECTION_RECONCILIATION_REQUIRED' };
        } else try {
          result = await enqueuePhoneRelayMessage(client, { channel, eventKey: `${eventKey}:${channel}`, to,
            ...message, orderId, event, eventRevision: getPhoneRelayOrderRevision(beforeSend) });
          if (result.status !== 'not_configured') result = { ...result, provider: 'phone_relay' };
        } catch {
          // An insert can commit before the network fails. Never fall back to a
          // second SMS provider after an uncertain queue outcome.
          result = { status: 'unknown', provider: 'phone_relay', errorCode: 'PHONE_RELAY_ENQUEUE_OUTCOME_UNKNOWN' };
        }
      } else if (channel === 'adminSms') {
        try {
          // The paired phone shows the owner's local Shortcut notification. Do
          // not also pay for an SMS back to that same device.
          result = (await getPhoneRelayHealth(client)).ready
            ? { status: 'skipped', errorCode: 'PHONE_RELAY_OWNER_LOCAL_NOTIFICATION' }
            : { status: 'not_configured' };
        } catch {
          result = { status: 'unknown', errorCode: 'PHONE_RELAY_HEALTH_UNAVAILABLE' };
        }
      } else {
        result = { status: 'not_configured' };
      }
      // A disabled/unpaired relay explicitly yields not_configured. All other
      // queue results own this delivery and must not invoke SOLAPI as well.
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
