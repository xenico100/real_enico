import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { parseOrderRawPayload } from './rawPayload';
import { getPhoneRelayDeliveryMetadata, PHONE_RELAY_DELIVERY_COLUMNS, type PhoneRelayDeliveryRow } from './phoneRelayDelivery';
import { isStorefrontProductVisible } from '../storefront/productDisplay';

export type CustomerOrderItem = {
  id: string;
  name: string;
  category: string;
  selectedSize: string | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  image: string;
};

const CUSTOMER_CHANNELS = ['customerSms', 'customerEmail'] as const;
const EVENTS = ['order_received', 'payment_confirmed', 'shipping_started', 'delivered', 'cancelled', 'refund_pending', 'refunded'] as const;
const STATUSES = ['queued', 'claimed', 'submitted', 'stale', 'sent', 'failed', 'not_configured', 'skipped', 'unknown', 'sending'] as const;
type CustomerChannel = typeof CUSTOMER_CHANNELS[number];
type CustomerStatus = typeof STATUSES[number];
export type CustomerNotificationSummary = Partial<Record<CustomerChannel, {
  status: CustomerStatus;
  event: typeof EVENTS[number];
  updatedAt: string | null;
}>>;
type NotificationCandidate = {
  event: typeof EVENTS[number];
  eventKey: string;
  createdAt: string;
  channels: Record<string, unknown>;
};

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function text(value: unknown, maxLength = 300): string {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}
function amount(value: unknown): number {
  const numeric = typeof value === 'number' || typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : 0;
}
function timestamp(value: unknown): string | null {
  return typeof value === 'string' && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;
}

/** A customer never receives arbitrary JSON attached to an order line. */
export function getCustomerOrderItems(value: unknown): CustomerOrderItem[] {
  let items = value;
  if (typeof items === 'string') {
    try { items = JSON.parse(items); } catch { return []; }
  }
  if (!Array.isArray(items)) return [];
  return items.slice(0, 100).flatMap(value => {
    const item = object(value);
    if (!item) return [];
    const quantity = amount(item.quantity);
    return [{
      id: text(item.id, 100), name: text(item.name) || '주문 상품', category: text(item.category, 80),
      selectedSize: text(item.selectedSize, 80) || null,
      quantity: Number.isInteger(quantity) ? quantity : 0,
      unitPrice: amount(item.unitPrice), lineTotal: amount(item.lineTotal), image: '',
    }];
  });
}

function publicImage(value: unknown): string {
  const candidate = text(value, 2048);
  if (!candidate || /[\u0000-\u0020\u007f\\]/.test(candidate)) return '';
  if (candidate.startsWith('/') && !candidate.startsWith('//')) return candidate;
  try {
    const url = new URL(candidate);
    return url.protocol === 'https:' && !url.username && !url.password ? url.toString() : '';
  } catch { return ''; }
}

/** Enrich only a purchased ID with an image already eligible for the public catalog. */
export async function attachCustomerOrderImages<T extends { items: CustomerOrderItem[] }>(client: SupabaseClient, orders: T[]): Promise<T[]> {
  const ids = [...new Set(orders.flatMap(order => order.items.map(item => item.id)))]
    .filter(id => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id));
  const images = new Map<string, string>();
  for (let offset = 0; offset < ids.length; offset += 100) {
    const chunk = ids.slice(offset, offset + 100);
    try {
      const { data, error } = await client.from('products').select('id, thumbnail_url, images, is_published').in('id', chunk);
      if (error) continue; // Order history remains usable when the catalog is unavailable.
      for (const value of data || []) {
        const row = object(value);
        if (!row || typeof row.id !== 'string' || !chunk.includes(row.id)
          || !isStorefrontProductVisible({ id: row.id, is_published: row.is_published === true ? true : false })) continue;
        const candidates = [row.thumbnail_url, ...(Array.isArray(row.images) ? row.images : [])];
        const image = candidates.map(publicImage).find(Boolean);
        if (image) images.set(row.id, image);
      }
    } catch { /* No database or catalog details belong in a customer response. */ }
  }
  return orders.map(order => ({ ...order, items: order.items.map(item => ({ ...item, image: images.get(item.id) || '' })) }));
}

function notificationCandidates(rawPayload: unknown): NotificationCandidate[] {
  const notifications = object(parseOrderRawPayload(rawPayload)?.notifications);
  const events = object(notifications?.events);
  if (!events) return [];
  return Object.values(events).flatMap(value => {
    const event = object(value);
    const createdAt = timestamp(event?.createdAt);
    if (!event || !createdAt || typeof event.event !== 'string' || !EVENTS.includes(event.event as typeof EVENTS[number])
      || typeof event.eventKey !== 'string' || !/^[a-f0-9]{64}$/.test(event.eventKey)) return [];
    return [{ event: event.event as typeof EVENTS[number], eventKey: event.eventKey, createdAt, channels: object(event.channels) || {} }];
  }).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 200);
}

function isRelay(record: Record<string, unknown>): boolean {
  return record.provider === 'phone_relay' || ['queued', 'claimed', 'submitted', 'stale'].includes(String(record.status))
    || (record.status === 'unknown' && typeof record.errorCode === 'string' && record.errorCode.startsWith('PHONE_RELAY_'));
}

/** Read-only, owner-scoped projection. It never dispatches or marks a manual email sent. */
export async function attachCustomerOrderNotifications<T extends { id: string; raw_payload: unknown }>(client: SupabaseClient, orders: T[]): Promise<Map<string, CustomerNotificationSummary>> {
  const eventsByOrder = new Map(orders.map(order => [order.id, notificationCandidates(order.raw_payload)]));
  const expectedJobs = new Map<string, { orderId: string; providerId: unknown }>();
  for (const order of orders) {
    // Only the latest customer SMS is displayed. Looking up older jobs would
    // add cost and disclose unnecessary metadata to this read model.
    const event = (eventsByOrder.get(order.id) || []).find(event => object(event.channels.customerSms));
    const record = object(event?.channels.customerSms);
    if (event && record && isRelay(record)) expectedJobs.set(`${event.eventKey}:customerSms`, { orderId: order.id, providerId: record.providerId });
  }
  const keys = [...expectedJobs.keys()];
  const jobs = new Map<string, PhoneRelayDeliveryRow>();
  for (let offset = 0; offset < keys.length; offset += 100) {
    const chunk = keys.slice(offset, offset + 100);
    try {
      const { data, error } = await client.from('phone_relay_jobs').select(PHONE_RELAY_DELIVERY_COLUMNS)
        .in('event_key', chunk).in('order_id', [...new Set(chunk.map(key => expectedJobs.get(key)!.orderId))]).eq('kind', 'customer_sms');
      if (error) continue;
      for (const job of (data || []) as PhoneRelayDeliveryRow[]) {
        const expected = expectedJobs.get(job.event_key);
        if (chunk.includes(job.event_key) && expected?.orderId === job.order_id
          && (!expected.providerId || expected.providerId === job.id)) jobs.set(job.event_key, job);
      }
    } catch { /* Unavailable delivery metadata remains unknown, never a success. */ }
  }
  const summaries = new Map<string, CustomerNotificationSummary>();
  for (const order of orders) {
    const summary: CustomerNotificationSummary = {};
    for (const event of eventsByOrder.get(order.id) || []) for (const channel of CUSTOMER_CHANNELS) {
      if (summary[channel]) continue;
      const record = object(event.channels[channel]);
      if (!record) continue;
      let status: CustomerStatus = STATUSES.includes(record.status as CustomerStatus) ? record.status as CustomerStatus : 'unknown';
      let updatedAt = timestamp(record.attemptedAt) || event.createdAt;
      if (channel === 'customerSms' && isRelay(record)) {
        const candidate = jobs.get(`${event.eventKey}:customerSms`);
        const job = candidate?.order_id === order.id && (!record.providerId || record.providerId === candidate.id) ? candidate : null;
        const metadata = job ? getPhoneRelayDeliveryMetadata(job) : null;
        status = metadata?.status || 'unknown';
        updatedAt = metadata?.resultUpdatedAt || updatedAt;
      }
      // Provider acceptance (sent) and local phone submission (submitted) do not
      // prove delivery. No current provider writes verified delivery receipts.
      summary[channel] = { status, event: event.event, updatedAt };
    }
    summaries.set(order.id, summary);
  }
  return summaries;
}
