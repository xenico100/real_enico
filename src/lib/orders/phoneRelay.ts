import 'server-only';

import { createHash, randomBytes } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { isPrimaryAdmin } from '@/lib/security/identity';
import { getSupabaseAdminClient } from '@/lib/supabaseAdmin';
import { assertExpectedSupabaseProject } from '@/lib/supabase/projectGuard';
import { parseOrderRawPayload } from './rawPayload';
import { sendOrderNotificationMessage } from './notificationProviders';
import { buildOrderNotificationMessage, type NotificationMessageOrder } from './notificationMessage';
import { getPhoneRelayDeliveryMetadata, type PhoneRelayDeliveryMetadata, type PhoneRelayDeliveryRow } from './phoneRelayDelivery';

export type PhoneRelayEvent = 'order_received' | 'payment_confirmed' | 'shipping_started' | 'delivered' | 'cancelled' | 'refund_pending' | 'refunded';
export type PhoneRelayQueueInput = {
  channel: string; eventKey: string; to: string; subject: string; text: string;
  orderId: string; event: PhoneRelayEvent; eventRevision: string;
};
export type PhoneRelayQueueResult = { status: 'queued' | 'not_configured' | 'skipped'; providerId?: string; errorCode?: string };
type RelayOrder = {
  payment_method?: unknown; payment_status?: unknown; shipping_status?: unknown;
  shipping_company?: unknown; tracking_number?: unknown; customer_phone?: unknown;
  amount_total?: unknown; currency?: unknown; bank_name?: unknown; bank_account_number?: unknown;
  items?: unknown; raw_payload?: unknown;
};
type RelayDevice = { id: string; enabled: boolean; phone: string; created_at: string; expires_at: string; last_seen_at: string | null };
export type PhoneRelayHealth = {
  available: boolean; paired: boolean; enabled: boolean; ready: boolean;
  deviceId: string | null; devicePhone: string | null; createdAt: string | null;
  expiresAt: string | null; lastSeenAt: string | null; selfTestSubmitted: boolean;
  counts: { queued: number; claimed: number; submitted: number; unknown: number; stale: number };
  dailyLimit: number; errorCode?: string;
  recentSelfTests: Array<PhoneRelayDeliveryMetadata & { id: string; testType: 'bank_transfer' | 'card' | 'connection' }>;
};
export const PHONE_RELAY_HEADERS = { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff' };
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DEVICE_COLUMNS = 'id,enabled,phone,created_at,expires_at,last_seen_at';
const ORDER_COLUMNS = 'id,payment_method,payment_status,shipping_status,shipping_company,tracking_number,customer_phone,amount_total,currency,bank_name,bank_account_number,items,raw_payload';
const JOB_LIFETIME_MS = 30 * 60_000;

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function lower(value: unknown) { return typeof value === 'string' ? value.trim().toLowerCase() : ''; }
function string(value: unknown) { return typeof value === 'string' ? value : ''; }
function nullable(value: unknown) { return typeof value === 'string' ? value : null; }
export function normalizePhoneRelayRecipient(value: string): string | null {
  if (!value || !/^[+\d\s()\-]+$/.test(value)) return null;
  let phone = value.replace(/[\s()\-]/g, '');
  if (phone.startsWith('+82')) phone = `0${phone.slice(3).replace(/^0/, '')}`;
  else if (phone.startsWith('82')) phone = `0${phone.slice(2).replace(/^0/, '')}`;
  return /^010\d{8}$/.test(phone) ? phone : null;
}
function tokenHash(token: string) { return createHash('sha256').update(token).digest('hex'); }
function newToken() { return randomBytes(32).toString('base64url'); }
function currentEvent(order: RelayOrder): PhoneRelayEvent | null {
  const payment = lower(order.payment_status);
  if (payment === 'refund_pending') return 'refund_pending';
  if (payment === 'cancelled') return parseOrderRawPayload(order.raw_payload)?.refundStatus === 'completed' ? 'refunded' : 'cancelled';
  if (lower(order.payment_method) === 'bank_transfer' && payment === 'pending_transfer') return 'order_received';
  if (!['transfer_confirmed', 'paid', 'captured', 'completed'].includes(payment)) return null;
  if (lower(order.shipping_status) === 'delivered') return 'delivered';
  if (lower(order.shipping_status) === 'shipping') return 'shipping_started';
  return 'payment_confirmed';
}
/** Exact snapshot persisted as JSONB; SQL rechecks the same fields at claim time. */
export function getPhoneRelayOrderRevision(order: RelayOrder): string {
  return JSON.stringify({ paymentMethod: lower(order.payment_method), paymentStatus: lower(order.payment_status),
    shippingStatus: lower(order.shipping_status), shippingCompany: nullable(order.shipping_company),
    trackingNumber: nullable(order.tracking_number), customerPhone: string(order.customer_phone),
    amountTotal: Number(order.amount_total), currency: string(order.currency),
    bankName: nullable(order.bank_name), bankAccountNumber: nullable(order.bank_account_number),
    items: order.items ?? null, refundStatus: string(parseOrderRawPayload(order.raw_payload)?.refundStatus) });
}
function eventSource(order: RelayOrder, eventKey: string, event: PhoneRelayEvent): string | null {
  const notifications = record(parseOrderRawPayload(order.raw_payload)?.notifications);
  const source = record(record(notifications?.events)?.[eventKey.split(':')[0]]);
  return source?.event === event && typeof source.createdAt === 'string' ? source.createdAt : null;
}
function emptyHealth(errorCode?: string): PhoneRelayHealth {
  return { available: !errorCode, paired: false, enabled: false, ready: false, deviceId: null, devicePhone: null,
    createdAt: null, expiresAt: null, lastSeenAt: null, selfTestSubmitted: false,
    counts: { queued: 0, claimed: 0, submitted: 0, unknown: 0, stale: 0 }, dailyLimit: 20, recentSelfTests: [], ...(errorCode ? { errorCode } : {}) };
}
export async function getPhoneRelayHealth(client: SupabaseClient): Promise<PhoneRelayHealth> {
  try {
    const { data, error } = await client.from('phone_relay_devices').select(DEVICE_COLUMNS).is('revoked_at', null)
      .gt('expires_at', new Date().toISOString()).order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (error) return emptyHealth(error.code === '42P01' || error.code === 'PGRST205' ? 'PHONE_RELAY_NOT_INSTALLED' : 'PHONE_RELAY_UNAVAILABLE');
    if (!data) return emptyHealth();
    const device = data as RelayDevice;
    const [countsResult, testResult, recentTestsResult] = await Promise.all([
      client.from('phone_relay_jobs').select('status').eq('device_id', device.id).gte('created_at', new Date(Date.now() - 24 * 60 * 60_000).toISOString()).limit(1000),
      client.from('phone_relay_jobs').select('id').eq('device_id', device.id).eq('kind', 'self_test').eq('status', 'submitted').limit(1).maybeSingle(),
      client.from('phone_relay_jobs').select('id,event_key,status,created_at,claimed_at,claim_expires_at,acknowledged_at,expires_at')
        .eq('device_id', device.id).eq('kind', 'self_test').order('created_at', { ascending: false }).limit(5),
    ]);
    if (countsResult.error || testResult.error) return emptyHealth('PHONE_RELAY_UNAVAILABLE');
    const counts = emptyHealth().counts;
    for (const job of countsResult.data || []) if (job.status in counts) counts[job.status as keyof typeof counts]++;
    const selfTestSubmitted = Boolean(testResult.data);
    const recentSelfTests = (recentTestsResult.error ? [] : recentTestsResult.data || []).map(job => ({
      id: String(job.id), testType: (String(job.event_key).startsWith('selftest:bank_') ? 'bank_transfer'
        : String(job.event_key).startsWith('selftest:card_') ? 'card' : 'connection') as 'bank_transfer' | 'card' | 'connection',
      ...getPhoneRelayDeliveryMetadata({ ...job, order_id: '' } as PhoneRelayDeliveryRow),
    }));
    return { available: true, paired: true, enabled: device.enabled, ready: device.enabled && selfTestSubmitted,
      deviceId: device.id, devicePhone: `${device.phone.slice(0, 3)}-****-${device.phone.slice(-4)}`,
      createdAt: device.created_at, expiresAt: device.expires_at, lastSeenAt: device.last_seen_at, selfTestSubmitted, counts, dailyLimit: 20, recentSelfTests };
  } catch { return emptyHealth('PHONE_RELAY_UNAVAILABLE'); }
}

export async function enqueuePhoneRelayMessage(client: SupabaseClient, input: PhoneRelayQueueInput): Promise<PhoneRelayQueueResult> {
  if (input.channel !== 'customerSms') return { status: 'skipped', errorCode: 'PHONE_RELAY_CUSTOMER_ONLY' };
  const to = normalizePhoneRelayRecipient(input.to);
  if (!to || !UUID_PATTERN.test(input.orderId) || !/^[a-f0-9]{64}:customerSms$/.test(input.eventKey)
    || !input.text.trim() || Buffer.byteLength(input.text, 'utf8') > 2000 || /[\u0000\uD800-\uDFFF]/.test(input.text)
    || !input.subject.trim() || /[\r\n\u0000]/.test(input.subject) || input.subject.length > 180) {
    return { status: 'skipped', errorCode: 'PHONE_RELAY_INVALID_MESSAGE' };
  }
  const health = await getPhoneRelayHealth(client);
  if (!health.ready) return { status: 'not_configured', errorCode: health.errorCode || 'PHONE_RELAY_NOT_ENABLED' };
  const { data, error } = await client.from('orders').select(ORDER_COLUMNS).eq('id', input.orderId).maybeSingle();
  if (error || !data) return { status: 'skipped', errorCode: 'PHONE_RELAY_ORDER_UNAVAILABLE' };
  const order = data as RelayOrder;
  const sourceAt = eventSource(order, input.eventKey, input.event);
  const sourceMs = sourceAt ? Date.parse(sourceAt) : NaN;
  if (currentEvent(order) !== input.event || getPhoneRelayOrderRevision(order) !== input.eventRevision
    || normalizePhoneRelayRecipient(string(order.customer_phone)) !== to || !Number.isFinite(sourceMs)
    || sourceMs > Date.now() + 30_000 || sourceMs + JOB_LIFETIME_MS <= Date.now()) {
    return { status: 'skipped', errorCode: 'PHONE_RELAY_STALE_ORDER' };
  }
  const result = await client.rpc('phone_relay_enqueue', { p_kind: 'customer_sms', p_event_key: input.eventKey,
    p_to: to, p_title: input.subject, p_message: input.text, p_order_id: input.orderId, p_event: input.event,
    p_revision: JSON.parse(input.eventRevision), p_source_at: sourceAt });
  if (result.error) throw new Error('phone_relay_queue_outcome_unknown');
  const outcome = record(result.data);
  if (outcome?.status === 'queued' && typeof outcome.id === 'string') return { status: 'queued', providerId: outcome.id };
  if (outcome?.status === 'not_configured') return { status: 'not_configured', errorCode: 'PHONE_RELAY_NOT_ENABLED' };
  return { status: 'skipped', errorCode: outcome?.status === 'already_claimed' ? 'PHONE_RELAY_ALREADY_CLAIMED'
    : outcome?.status === 'limited' ? 'PHONE_RELAY_DAILY_LIMIT' : 'PHONE_RELAY_STALE_ORDER' };
}

export async function authorizePhoneRelayOwner(request: Request): Promise<{ client: SupabaseClient } | { response: NextResponse }> {
  const bearer = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (!bearer) return { response: NextResponse.json({ message: 'Unauthorized.' }, { status: 401, headers: PHONE_RELAY_HEADERS }) };
  try {
    const url = assertExpectedSupabaseProject(process.env.NEXT_PUBLIC_SUPABASE_URL);
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!anonKey) throw new Error('auth_unavailable');
    const authClient = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: { user }, error } = await authClient.auth.getUser(bearer);
    if (error || !isPrimaryAdmin(user)) return { response: NextResponse.json({ message: 'Forbidden.' }, { status: 403, headers: PHONE_RELAY_HEADERS }) };
    return { client: getSupabaseAdminClient() };
  } catch { return { response: NextResponse.json({ message: '서버 연결을 확인해 주세요.' }, { status: 503, headers: PHONE_RELAY_HEADERS }) }; }
}
export async function readPhoneRelayBody(request: Request): Promise<Record<string, unknown> | null> {
  if (Number(request.headers.get('content-length') || 0) > 2048) return null;
  try { const body = await request.text(); return body.length <= 2048 ? record(JSON.parse(body)) : null; } catch { return null; }
}
export function readPhoneRelayToken(request: Request): string | null {
  const token = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  return token && TOKEN_PATTERN.test(token) ? token : null;
}
export async function claimPhoneRelayJob(client: SupabaseClient, token: string) {
  const claimToken = newToken();
  const { data, error } = await client.rpc('phone_relay_claim', { p_device_hash: tokenHash(token), p_claim_hash: tokenHash(claimToken) });
  if (error) throw new Error('phone_relay_claim_unavailable');
  const result = record(data);
  if (result?.authorized !== true) return null;
  const job = record(result.job);
  return { job: job ? { id: job.id, claimToken, to: job.to, text: job.text, title: job.title, kind: job.kind } : null };
}
export async function acknowledgePhoneRelayJob(client: SupabaseClient, token: string, body: Record<string, unknown>) {
  if (typeof body.jobId !== 'string' || !UUID_PATTERN.test(body.jobId) || typeof body.claimToken !== 'string'
    || !TOKEN_PATTERN.test(body.claimToken) || !['submitted', 'unknown'].includes(String(body.status))) return { invalid: true };
  const { data, error } = await client.rpc('phone_relay_ack', { p_device_hash: tokenHash(token), p_job_id: body.jobId,
    p_claim_hash: tokenHash(body.claimToken), p_status: body.status });
  if (error) throw new Error('phone_relay_ack_unavailable');
  const result = record(data) || { authorized: false };
  if (result.authorized === true && result.ok === true) console.info('Order SMS relay result', { jobId: body.jobId, status: result.status });
  return result;
}

/** Pure, owner-only template smoke test. Never creates a financial order. */
export function buildPhoneRelayTemplateSelfTest(template: 'bank' | 'card') {
  const sample: NotificationMessageOrder = { id: 'self-test', order_code: `TEST-${template.toUpperCase()}`,
    guest_order_number: null, channel: 'guest', payment_method: template === 'bank' ? 'bank_transfer' : 'nicepay',
    payment_status: template === 'bank' ? 'pending_transfer' : 'paid', amount_total: 123000, currency: 'KRW',
    customer_name: '문자 템플릿 테스트', customer_email: '', customer_phone: '', bank_name: null,
    bank_account_number: null, items: [{ name: '테스트 상품 · 실제 주문 아님', quantity: 1 }],
    shipping_status: 'preparing', shipping_company: null, tracking_number: null, raw_payload: {} };
  const message = buildOrderNotificationMessage(sample, template === 'bank' ? 'order_received' : 'payment_confirmed', false);
  return { subject: `[테스트] ${message.subject}`,
    text: `[테스트 · 실제 주문/결제 없음]\n${message.text}\n테스트 안내입니다. 실제로 입금하지 마세요.` };
}

export async function managePhoneRelay(client: SupabaseClient, action: string) {
  if (action === 'pair') {
    const phone = normalizePhoneRelayRecipient((process.env.ADMIN_NOTIFICATION_PHONE || '').trim());
    if (!phone) return { status: 503, body: { message: '관리자 휴대폰 번호 설정이 필요합니다.' } };
    const deviceToken = newToken();
    const expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60_000).toISOString();
    const { data, error } = await client.rpc('phone_relay_replace_device', { p_token_hash: tokenHash(deviceToken), p_phone: phone, p_expires_at: expiresAt });
    if (error || typeof data !== 'string') return { status: 503, body: { message: '기기 연결 정보를 저장하지 못했습니다. 다시 연결하면 이전 토큰은 폐기됩니다.' } };
    return { status: 200, body: { ...(await getPhoneRelayHealth(client)), deviceToken, deviceId: data, expiresAt } };
  }
  if (['self_test', 'self_test_bank', 'self_test_card'].includes(action)) {
    const phone = normalizePhoneRelayRecipient((process.env.ADMIN_NOTIFICATION_PHONE || '').trim());
    if (!phone) return { status: 503, body: { message: '관리자 휴대폰 번호 설정이 필요합니다.' } };
    const now = new Date().toISOString();
    const template = action === 'self_test_bank' ? buildPhoneRelayTemplateSelfTest('bank')
      : action === 'self_test_card' ? buildPhoneRelayTemplateSelfTest('card') : null;
    // Keep the SQL's exact 43-character alphabet and >200 random bits. Unlike
    // title/message, this harmless type marker survives terminal-state scrubbing.
    const testMarker = action === 'self_test_bank' ? 'bank_' : action === 'self_test_card' ? 'card_' : 'conn_';
    const { data, error } = await client.rpc('phone_relay_enqueue', { p_kind: 'self_test', p_event_key: `selftest:${testMarker}${newToken().slice(5)}`,
      p_to: phone, p_title: template?.subject || '[ENICO VECK] 문자 연결 테스트',
      p_message: template?.text || '[ENICO VECK] 문자 연결 테스트입니다. 이 문자를 실제로 받은 뒤 관리자에서 고객 문자 발송을 켜 주세요. 자동화 실행 완료는 문자 수신 완료를 뜻하지 않습니다.',
      p_order_id: null, p_event: null, p_revision: {}, p_source_at: now });
    const result = record(data);
    if (error || result?.status !== 'queued') return { status: 409, body: { message: '기기를 먼저 연결하거나 기존 테스트 결과를 확인해 주세요.' } };
    const wakeEmail = await sendOrderNotificationMessage({ channel: 'adminEmail', eventKey: `phone-relay-self-test:${result.id}`,
      to: process.env.ORDER_NOTIFICATION_EMAIL || 'morba9850@gmail.com', subject: '[ENICO PHONE] 아이폰 문자 연결 테스트',
      text: '아이폰 문자 연결 테스트가 대기 중입니다. ENICO PHONE 단축어 자동화가 이 메일을 받으면 고정된 관리자 번호로 테스트 문자 한 건을 처리합니다. 자동화가 아직 없으면 단축어를 직접 실행해 주세요. 이 이메일에는 기기 토큰이나 고객 연락처가 없습니다.' });
    return { status: 200, body: { ...(await getPhoneRelayHealth(client)), jobId: result.id, wakeEmail } };
  }
  if (!['enable', 'disable', 'revoke'].includes(action)) return { status: 400, body: { message: '지원하지 않는 요청입니다.' } };
  const { data, error } = await client.rpc('phone_relay_control', { p_action: action });
  if (error || data !== true) return { status: 409, body: { message: action === 'enable' ? '연결 테스트 실행과 실제 문자 수신 확인 후 켤 수 있습니다.' : '현재 연결된 기기를 확인해 주세요.' } };
  return { status: 200, body: await getPhoneRelayHealth(client) };
}
