import 'server-only';
import { createHash, randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { BANK_ACCOUNT, formatBankTransferAmount, getOrderBankAccount } from './bankAccount';
import { parseOrderRawPayload } from './rawPayload';
import { sendOrderNotificationMessage, type OrderNotificationResult } from './notificationProviders';
import { enqueuePhoneRelayMessage, getPhoneRelayHealth, getPhoneRelayOrderRevision } from './phoneRelay';

export type NotificationChannel = 'adminEmail' | 'customerEmail' | 'customerSms' | 'adminSms';
export type OrderNotificationEvent = 'order_received' | 'payment_confirmed' | 'shipping_started' | 'delivered' | 'cancelled' | 'refund_pending' | 'refunded';
type ChannelRecord = Omit<OrderNotificationResult, 'status'> & { status: OrderNotificationResult['status'] | 'sending'; attemptedAt?: string; attemptId?: string };
export type NotificationSummary = { event: OrderNotificationEvent; eventKey: string; createdAt: string; channels: Partial<Record<NotificationChannel, ChannelRecord>> };
type NotificationOrder = {
  id: string; order_code: string; guest_order_number: string | null; channel: string;
  payment_method: string; payment_status: string; amount_total: number; currency: string;
  customer_name: string; customer_email: string; customer_phone: string;
  bank_name: string | null; bank_account_number: string | null; items: unknown;
  shipping_status: string | null; shipping_company: string | null; tracking_number: string | null;
  raw_payload: unknown;
};
const ORDER_COLUMNS = 'id,order_code,guest_order_number,channel,payment_method,payment_status,amount_total,currency,customer_name,customer_email,customer_phone,bank_name,bank_account_number,items,shipping_status,shipping_company,tracking_number,raw_payload';
const CHANNELS: NotificationChannel[] = ['adminEmail', 'customerEmail', 'customerSms', 'adminSms'];
const DEFAULT_CHANNELS: NotificationChannel[] = ['customerSms', 'adminEmail', 'customerEmail', 'adminSms'];
const LABELS: Record<OrderNotificationEvent, string> = {
  order_received: '주문 접수 · 입금 대기', payment_confirmed: '입금·결제 확인',
  shipping_started: '배송 시작', delivered: '배송 완료', cancelled: '주문 취소',
  refund_pending: '환불 진행 중', refunded: '환불 완료',
};

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
          ...(record.providerId ? { providerId: record.providerId } : {}), ...(record.errorCode ? { errorCode: record.errorCode } : {}) }])) }));
}

export function getOrderNotificationSummary(raw: unknown) {
  return getOrderNotificationHistory(raw)[0] || null;
}

/** Project the phone's latest outcome without ever rewriting financial JSON. */
export async function projectPhoneRelayOrderNotifications<T extends {
  notifications: NotificationSummary | null; notificationHistory: NotificationSummary[];
}>(client: SupabaseClient, orders: T[]): Promise<T[]> {
  const jobIds = [...new Set(orders.flatMap(order => order.notificationHistory.flatMap(summary => {
    const message = summary.channels.customerSms;
    return message?.status === 'queued' && typeof message.providerId === 'string'
      && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(message.providerId)
      ? [message.providerId] : [];
  })))];
  if (!jobIds.length) return orders;
  const statuses = new Map<string, OrderNotificationResult['status']>();
  try {
    const { data, error } = await client.from('phone_relay_jobs').select('id,status').in('id', jobIds).eq('kind', 'customer_sms');
    if (!error) for (const job of data || []) {
      if (typeof job.id === 'string' && jobIds.includes(job.id)
        && ['queued', 'claimed', 'submitted', 'unknown', 'stale'].includes(job.status)) statuses.set(job.id, job.status);
    }
  } catch { /* Show unavailable metadata below; retain the durable queue claim. */ }
  function project(summary: NotificationSummary | null): NotificationSummary | null {
    const message = summary?.channels.customerSms;
    if (!summary || message?.status !== 'queued' || !message.providerId || !jobIds.includes(message.providerId)) return summary;
    const status = statuses.get(message.providerId);
    return { ...summary, channels: { ...summary.channels, customerSms: { ...message,
      status: status || 'unknown', ...(!status ? { errorCode: 'PHONE_RELAY_STATUS_UNAVAILABLE' } : {}) } } };
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
  if (!['transfer_confirmed', 'paid', 'captured', 'completed'].includes(payment)) return null;
  if (shipping === 'delivered') return 'delivered';
  if (shipping === 'shipping') return 'shipping_started';
  return 'payment_confirmed';
}

function eventApplies(order: NotificationOrder, event: OrderNotificationEvent) {
  if (event === 'refunded') return order.payment_status.toLowerCase() === 'cancelled' &&
    parseOrderRawPayload(order.raw_payload)?.refundStatus === 'completed';
  return getCurrentOrderNotificationEvent(order) === event;
}

function notificationEventKey(order: NotificationOrder, event: OrderNotificationEvent) {
  const shipment = event === 'shipping_started' || event === 'delivered'
    ? `${order.shipping_company}:${order.tracking_number}` : '';
  return createHash('sha256').update(`${order.id}:${event}:${shipment}`).digest('hex');
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

function productText(items: unknown) {
  return Array.isArray(items) ? items.slice(0, 5).map(item => {
    if (!item || typeof item !== 'object') return '';
    return `${String(item.name || '상품').replace(/[\r\n]/g, ' ').slice(0, 65)} × ${Number(item.quantity) || 1}`;
  }).filter(Boolean).join(', ') : '';
}

function buildMessage(order: NotificationOrder, event: OrderNotificationEvent, admin: boolean) {
  const bank = getOrderBankAccount(order);
  const lines = [`[ENICO VECK] ${LABELS[event]}`, `주문번호: ${order.order_code}`];
  if (order.guest_order_number) lines.push(`비회원 조회번호: ${order.guest_order_number}`);
  if (admin) lines.push(`주문자: ${order.customer_name}`, `연락처: ${order.customer_phone}`);
  lines.push(`상품: ${productText(order.items)}`, `금액: ${formatBankTransferAmount(Number(order.amount_total))}`);
  if (event === 'order_received') lines.push(`${bank.bankName} ${bank.accountNumber}`, `예금주: ${bank.accountHolder}`,
    '입금자명은 주문자 이름과 동일하게 입력해 주세요.', '현재 입금 대기 상태이며, 운영자가 입금을 확인한 뒤 처리합니다.',
    '단품 재고는 주문 접수만으로 예약되지 않습니다. 송금 전에 주문 상태와 재고를 확인해 주세요.');
  if (event === 'shipping_started' || event === 'delivered') lines.push(`택배사: ${order.shipping_company || '우체국'}`, `운송장: ${order.tracking_number || '관리자 확인 필요'}`);
  if (event === 'refund_pending') lines.push('환불 요청이 접수되었습니다. 실제 환불 완료와는 구분됩니다.');
  if (event === 'cancelled') lines.push('취소된 주문에는 입금하지 마세요. 이미 입금했다면 고객센터로 연락해 주세요.');
  lines.push(admin ? '관리자에서 주문과 실제 입금 내역을 확인해 주세요.' : '주문조회: https://enicoveck.com/orders',
    ...(admin ? [] : ['문의: morba9850@gmail.com']));
  return { subject: `[ENICO VECK] ${LABELS[event]} ${order.order_code}`, text: lines.join('\n') };
}

export async function dispatchOrderNotifications(client: SupabaseClient, orderId: string, event: OrderNotificationEvent,
  options: { channels?: NotificationChannel[]; retry?: boolean } = {}): Promise<NotificationSummary> {
  const initial = await readOrder(client, orderId);
  const eventKey = notificationEventKey(initial, event);
  const base: NotificationSummary = readEvents(initial.raw_payload)[eventKey] || { event, eventKey, createdAt: new Date().toISOString(), channels: {} };
  if (!eventApplies(initial, event)) return { ...base, channels: Object.fromEntries(CHANNELS.map(c => [c, { status: 'skipped', errorCode: 'order_state_changed' }])) };
  const selectedChannels = [...new Set(options.channels || DEFAULT_CHANNELS)].filter(c => CHANNELS.includes(c));
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
    const message = buildMessage(beforeSend, event, isAdmin);
    // The email is a wake-up signal, never an instruction containing a recipient
    // to parse. The phone must fetch and claim the authenticated server queue.
    if (channel === 'adminEmail' && readEvents(beforeSend.raw_payload)[eventKey]?.channels.customerSms?.status === 'queued') {
      message.subject = `[ENICO PHONE] ${message.subject}`;
    }
    let result: OrderNotificationResult = { status: 'skipped', errorCode: 'order_state_changed' };
    if (stillApplies) {
      if (channel === 'customerSms') {
        try {
          result = await enqueuePhoneRelayMessage(client, { channel, eventKey: `${eventKey}:${channel}`, to,
            ...message, orderId, event, eventRevision: getPhoneRelayOrderRevision(beforeSend) });
        } catch {
          // An insert can commit before the network fails. Never fall back to a
          // second SMS provider after an uncertain queue outcome.
          result = { status: 'unknown', errorCode: 'PHONE_RELAY_ENQUEUE_OUTCOME_UNKNOWN' };
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
      if (result.status === 'not_configured') {
        result = await sendOrderNotificationMessage({ channel, eventKey: `${eventKey}:${channel}`, to,
          ...message, replyTo: isAdmin ? beforeSend.customer_email : 'morba9850@gmail.com' });
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
