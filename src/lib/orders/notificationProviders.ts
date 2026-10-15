import 'server-only';

import { createHash, createHmac, randomBytes } from 'node:crypto';

export type OrderNotificationChannel = 'adminEmail' | 'customerEmail' | 'customerSms' | 'adminSms';
export type OrderNotificationResult = {
  // "sent" means the provider accepted the request, not handset/inbox delivery.
  status: 'sent' | 'failed' | 'not_configured' | 'skipped' | 'unknown';
  providerId?: string;
  errorCode?: string;
};
export type OrderNotificationMessage = {
  channel: OrderNotificationChannel;
  eventKey: string;
  to: string;
  subject: string;
  text: string;
  replyTo?: string;
};
export type OrderNotificationConfigHealth = {
  adminEmail: boolean;
  customerEmail: boolean;
  customerSms: boolean;
  adminSms: boolean;
  adminPhone: string | null;
  senderPhone: string | null;
  customerEmailRequiresVerifiedSender: boolean;
  smsProvider: 'solapi' | null;
};

const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const SOLAPI_ENDPOINT = 'https://api.solapi.com/messages/v4/send-many/detail';
const DEFAULT_ADMIN_EMAIL = 'morba9850@gmail.com';
const DEFAULT_FROM_EMAIL = 'ENICO VECK <onboarding@resend.dev>';
const REQUEST_TIMEOUT_MS = 10_000;

function env(name: string): string {
  return (process.env[name] || '').trim();
}

function isEmail(value: string): boolean {
  return value.length <= 254 && /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$/.test(value);
}

function senderAddress(value: string): string | null {
  if (!value || /[\r\n]/.test(value)) return null;
  const wrapped = value.match(/^[^<>]*<([^<>]+)>$/);
  const address = (wrapped ? wrapped[1] : value).trim();
  return isEmail(address) ? address : null;
}

/** Only one modern Korean mobile recipient is accepted; never strip arbitrary text. */
function koreanMobile(value: string): string | null {
  if (!value || !/^[+\d\s()\-]+$/.test(value)) return null;
  let phone = value.replace(/[\s()\-]/g, '');
  if (phone.startsWith('+82')) phone = `0${phone.slice(3).replace(/^0/, '')}`;
  else if (phone.startsWith('82')) phone = `0${phone.slice(2).replace(/^0/, '')}`;
  return /^010\d{8}$/.test(phone) ? phone : null;
}

function maskedPhone(phone: string | null): string | null {
  return phone ? `${phone.slice(0, 3)}-****-${phone.slice(-4)}` : null;
}

function config() {
  const from = env('ORDER_FROM_EMAIL') || DEFAULT_FROM_EMAIL;
  const fromAddress = senderAddress(from);
  const customSender = Boolean(env('ORDER_FROM_EMAIL') && fromAddress && !/@(?:[^@]+\.)?resend\.dev$/i.test(fromAddress));
  return {
    resendKey: env('RESEND_API_KEY'),
    from,
    fromAddress,
    customSender,
    adminEmail: env('ORDER_NOTIFICATION_EMAIL') || DEFAULT_ADMIN_EMAIL,
    solapiKey: env('SOLAPI_API_KEY'),
    solapiSecret: env('SOLAPI_API_SECRET'),
    senderPhone: koreanMobile(env('SMS_SENDER_PHONE')),
    adminPhone: koreanMobile(env('ADMIN_NOTIFICATION_PHONE')),
  };
}

/** Local configuration readiness only; provider verification/balance are not probed. */
export function getNotificationConfigHealth(): OrderNotificationConfigHealth {
  const settings = config();
  const emailReady = Boolean(settings.resendKey && settings.fromAddress);
  const smsReady = Boolean(settings.solapiKey && settings.solapiSecret && settings.senderPhone);
  return {
    adminEmail: emailReady && isEmail(settings.adminEmail),
    customerEmail: emailReady && settings.customSender,
    customerSms: smsReady,
    adminSms: smsReady && Boolean(settings.adminPhone),
    adminPhone: maskedPhone(settings.adminPhone),
    senderPhone: maskedPhone(settings.senderPhone),
    customerEmailRequiresVerifiedSender: !settings.customSender,
    smsProvider: smsReady ? 'solapi' : null,
  };
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function providerId(value: unknown): string | undefined {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,200}$/.test(value) ? value : undefined;
}

function resendIdempotencyKey(message: OrderNotificationMessage): string {
  const key = `order/${message.channel}/${message.eventKey}`;
  return key.length <= 256 && /^[\x21-\x7e]+$/.test(key)
    ? key
    : `order/${message.channel}/${createHash('sha256').update(message.eventKey).digest('hex')}`;
}

function httpFailure(provider: 'RESEND' | 'SOLAPI', status: number): OrderNotificationResult {
  // A timeout/5xx response can follow provider acceptance. Keep it ambiguous so
  // the durable caller never blindly retries and sends a second message.
  return {
    status: status >= 500 || status === 408 ? 'unknown' : 'failed',
    errorCode: `${provider}_HTTP_${status}`,
  };
}

async function sendEmail(message: OrderNotificationMessage): Promise<OrderNotificationResult> {
  const settings = config();
  if (!settings.resendKey || !settings.fromAddress) {
    return { status: 'not_configured', errorCode: 'EMAIL_NOT_CONFIGURED' };
  }
  // Resend's shared onboarding sender only permits the account owner's email.
  // A custom domain must be verified with Resend before enabling customer mail.
  if (message.channel === 'customerEmail' && !settings.customSender) {
    return { status: 'not_configured', errorCode: 'CUSTOMER_EMAIL_REQUIRES_VERIFIED_SENDER' };
  }
  const to = message.to.trim();
  if (!isEmail(to)) return { status: 'skipped', errorCode: 'INVALID_RECIPIENT_EMAIL' };
  if (message.replyTo && !isEmail(message.replyTo.trim())) {
    return { status: 'failed', errorCode: 'INVALID_REPLY_TO_EMAIL' };
  }
  try {
    // This adapter performs exactly one attempt. The caller owns durable state
    // and must not assume Resend keys deduplicate beyond their 24-hour lifetime.
    const response = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      redirect: 'error',
      cache: 'no-store',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: {
        Authorization: `Bearer ${settings.resendKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': resendIdempotencyKey(message),
      },
      body: JSON.stringify({
        from: settings.from,
        to: [to],
        subject: message.subject,
        text: message.text,
        ...(message.replyTo ? { reply_to: message.replyTo.trim() } : {}),
      }),
    });
    if (!response.ok) {
      if (response.status === 409) {
        const body = record(await response.json().catch(() => null));
        if (body?.name === 'concurrent_idempotent_requests') {
          return { status: 'unknown', errorCode: 'RESEND_IDEMPOTENT_REQUEST_IN_PROGRESS' };
        }
      }
      return httpFailure('RESEND', response.status);
    }
    const body = record(await response.json().catch(() => null));
    const id = providerId(body?.id);
    return id
      ? { status: 'sent', providerId: id }
      : { status: 'unknown', errorCode: 'RESEND_INVALID_ACCEPTANCE_RESPONSE' };
  } catch {
    // Do not retain provider messages, recipient addresses, or secrets in errors.
    return { status: 'unknown', errorCode: 'RESEND_NETWORK_OUTCOME_UNKNOWN' };
  }
}

async function sendSms(message: OrderNotificationMessage): Promise<OrderNotificationResult> {
  const settings = config();
  if (!settings.solapiKey || !settings.solapiSecret || !settings.senderPhone) {
    return { status: 'not_configured', errorCode: 'SMS_NOT_CONFIGURED' };
  }
  if (message.channel === 'adminSms' && !settings.adminPhone) {
    return { status: 'not_configured', errorCode: 'ADMIN_NOTIFICATION_PHONE_NOT_CONFIGURED' };
  }
  const to = koreanMobile(message.to);
  if (!to) return { status: 'skipped', errorCode: 'INVALID_RECIPIENT_PHONE' };
  // EUC-KR limits are 2,000 bytes for LMS. UTF-8 is a conservative limit for
  // Korean text; unsupported supplementary characters must never be mangled.
  if (Buffer.byteLength(message.text, 'utf8') > 2_000 || /[\uD800-\uDFFF]/.test(message.text)) {
    return { status: 'failed', errorCode: 'INVALID_SMS_CONTENT' };
  }
  const date = new Date().toISOString();
  const salt = randomBytes(24).toString('hex');
  const signature = createHmac('sha256', settings.solapiSecret).update(date + salt).digest('hex');
  try {
    // SOLAPI does not document request-level idempotency for this endpoint.
    // The caller's durable claim prevents duplicate HTTP requests; this
    // allowDuplicates flag only deduplicates recipients inside this group.
    const response = await fetch(SOLAPI_ENDPOINT, {
      method: 'POST',
      redirect: 'error',
      cache: 'no-store',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: {
        Authorization: `HMAC-SHA256 apiKey=${settings.solapiKey}, date=${date}, salt=${salt}, signature=${signature}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages: [{
          to,
          from: settings.senderPhone,
          text: message.text,
          type: 'LMS',
          // Keep the provider subject short and deterministic, without splitting
          // multibyte characters or including untrusted header content.
          subject: 'ENICO VECK',
          customFields: { notificationId: createHash('sha256').update(message.eventKey).digest('hex') },
        }],
        strict: true,
        allowDuplicates: false,
        showMessageList: true,
      }),
    });
    if (!response.ok) return httpFailure('SOLAPI', response.status);
    const body = record(await response.json().catch(() => null));
    if (!body || !Array.isArray(body.failedMessageList)) {
      return { status: 'unknown', errorCode: 'SOLAPI_INVALID_ACCEPTANCE_RESPONSE' };
    }
    if (body.failedMessageList.length) {
      const rejection = record(body.failedMessageList[0]);
      const code = typeof rejection?.statusCode === 'string' && /^\d{4}$/.test(rejection.statusCode)
        ? rejection.statusCode : 'UNKNOWN';
      return { status: 'failed', errorCode: `SOLAPI_REGISTRATION_REJECTED_${code}` };
    }
    const accepted = Array.isArray(body.messageList) ? record(body.messageList[0]) : null;
    const group = record(body.groupInfo);
    const counts = record(group?.count);
    const id = providerId(accepted?.messageId) || providerId(group?.groupId);
    const code = typeof accepted?.statusCode === 'string' ? accepted.statusCode : '';
    if (/^[34]\d{3}$/.test(code) && code !== '4000') {
      return { status: 'failed', ...(id ? { providerId: id } : {}), errorCode: `SOLAPI_MESSAGE_REJECTED_${code}` };
    }
    if (id && (/^2\d{3}$/.test(code) || code === '4000' || (counts?.registeredSuccess === 1 && counts?.registeredFailed === 0))) {
      return { status: 'sent', providerId: id };
    }
    return { status: 'unknown', ...(id ? { providerId: id } : {}), errorCode: 'SOLAPI_INVALID_ACCEPTANCE_RESPONSE' };
  } catch {
    return { status: 'unknown', errorCode: 'SOLAPI_NETWORK_OUTCOME_UNKNOWN' };
  }
}

export async function sendOrderNotificationMessage(message: OrderNotificationMessage): Promise<OrderNotificationResult> {
  if (typeof message.eventKey !== 'string' || !message.eventKey.trim()) {
    return { status: 'failed', errorCode: 'INVALID_EVENT_KEY' };
  }
  if (typeof message.to !== 'string' || !message.to.trim()) {
    return { status: 'skipped', errorCode: 'MISSING_RECIPIENT' };
  }
  if (typeof message.subject !== 'string' || !message.subject.trim() || /[\r\n]/.test(message.subject)
    || typeof message.text !== 'string' || !message.text.trim()) {
    return { status: 'failed', errorCode: 'INVALID_NOTIFICATION_CONTENT' };
  }
  if (message.channel === 'adminEmail' || message.channel === 'customerEmail') return sendEmail(message);
  if (message.channel === 'customerSms' || message.channel === 'adminSms') return sendSms(message);
  return { status: 'failed', errorCode: 'INVALID_NOTIFICATION_CHANNEL' };
}
