/** Safe read model only. Never include recipients, message bodies or capabilities. */
export type PhoneRelayDeliveryMetadata = {
  provider: 'phone_relay';
  jobId?: string;
  status: 'queued' | 'claimed' | 'submitted' | 'unknown' | 'stale';
  queuedAt: string | null;
  claimedAt: string | null;
  submittedAt: string | null;
  resultUpdatedAt: string | null;
  expiresAt: string | null;
  reasonCode: string | null;
  deliveryConfirmed: false;
};

export const PHONE_RELAY_DELIVERY_COLUMNS = 'id,order_id,event_key,status,created_at,claimed_at,claim_expires_at,acknowledged_at,expires_at';
export type PhoneRelayDeliveryRow = {
  id: string;
  order_id: string;
  event_key: string;
  status: string;
  created_at: string | null;
  claimed_at: string | null;
  claim_expires_at: string | null;
  acknowledged_at: string | null;
  expires_at: string | null;
};

function timestamp(value: unknown): string | null {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) return null;
  return new Date(value).toISOString();
}

export function unavailablePhoneRelayDelivery(jobId?: string): PhoneRelayDeliveryMetadata {
  return { provider: 'phone_relay', ...(jobId ? { jobId } : {}), status: 'unknown',
    queuedAt: null, claimedAt: null, submittedAt: null, resultUpdatedAt: null,
    expiresAt: null, reasonCode: 'PHONE_RELAY_STATUS_UNAVAILABLE', deliveryConfirmed: false };
}

/** Expiry is projected without changing durable financial JSON or queue state. */
export function getPhoneRelayDeliveryMetadata(job: PhoneRelayDeliveryRow, now = Date.now()): PhoneRelayDeliveryMetadata {
  const queuedAt = timestamp(job.created_at);
  const claimedAt = timestamp(job.claimed_at);
  const acknowledgedAt = timestamp(job.acknowledged_at);
  const expiresAt = timestamp(job.expires_at);
  const claimExpiresAt = timestamp(job.claim_expires_at);
  if (!queuedAt || !expiresAt || !['queued', 'claimed', 'submitted', 'unknown', 'stale'].includes(job.status)) {
    return unavailablePhoneRelayDelivery(job.id);
  }
  let status = job.status as PhoneRelayDeliveryMetadata['status'];
  let reasonCode: string | null = null;
  if (status === 'queued' && Date.parse(expiresAt) <= now) {
    status = 'stale';
    reasonCode = 'PHONE_RELAY_EXPIRED';
  } else if (status === 'claimed' && (!claimedAt || !claimExpiresAt || Date.parse(claimExpiresAt) <= now)) {
    status = 'unknown';
    reasonCode = 'PHONE_RELAY_CLAIM_EXPIRED';
  } else if (status === 'submitted' && !acknowledgedAt) {
    status = 'unknown';
    reasonCode = 'PHONE_RELAY_STATUS_UNAVAILABLE';
  } else if (status === 'unknown') {
    reasonCode = 'PHONE_RELAY_RESULT_UNKNOWN';
  } else if (status === 'stale') {
    reasonCode = Date.parse(expiresAt) <= now ? 'PHONE_RELAY_EXPIRED' : 'PHONE_RELAY_STALE';
  }
  return { provider: 'phone_relay', jobId: job.id, status, queuedAt, claimedAt,
    submittedAt: status === 'submitted' ? acknowledgedAt : null,
    resultUpdatedAt: acknowledgedAt || claimedAt || queuedAt, expiresAt, reasonCode,
    deliveryConfirmed: false };
}
