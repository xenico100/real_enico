export const BANK_ATTEMPT_STORAGE_KEY = 'enicoveck_bank_checkout_attempt_v1';
export type BankCheckoutAttempt = { transactionId: string; pending: boolean; channel: 'member' | 'guest' };
let memoryAttempt: BankCheckoutAttempt | null = null;

export function readBankCheckoutAttempt(storage?: Pick<Storage, 'getItem'>): BankCheckoutAttempt | null {
  try {
    const raw = storage?.getItem(BANK_ATTEMPT_STORAGE_KEY);
    if (raw) {
      const value = JSON.parse(raw);
      if (typeof value.transactionId === 'string' && /^bank_[a-zA-Z0-9_-]{20,59}$/.test(value.transactionId) && typeof value.pending === 'boolean' && ['member', 'guest'].includes(value.channel)) {
        memoryAttempt = { transactionId: value.transactionId, pending: value.pending, channel: value.channel };
      }
    }
  } catch { /* Use the current tab's memory when storage is unavailable. */ }
  return memoryAttempt;
}

export function saveBankCheckoutAttempt(attempt: BankCheckoutAttempt, storage?: Pick<Storage, 'setItem'>) {
  // Never persist the request body, contact details, password, or access token.
  memoryAttempt = { transactionId: attempt.transactionId, pending: attempt.pending, channel: attempt.channel };
  try { storage?.setItem(BANK_ATTEMPT_STORAGE_KEY, JSON.stringify(memoryAttempt)); } catch { /* Memory-only fallback. */ }
  return memoryAttempt;
}

export function clearBankCheckoutAttempt(storage?: Pick<Storage, 'removeItem'>) {
  memoryAttempt = null;
  try { storage?.removeItem(BANK_ATTEMPT_STORAGE_KEY); } catch { /* Memory already cleared. */ }
}
