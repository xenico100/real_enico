export type BankAccountDetails = {
  bankName: string;
  accountNumber: string;
  accountHolder: string;
};

export type OrderNotificationSummary = Partial<Record<
  'customerEmail' | 'customerSms' | 'adminEmail' | 'adminSms',
  { status: string; event?: string; updatedAt?: string }
>>;

export const BANK_RECEIPT_STORAGE_KEY = 'enicoveck_bank_order_receipt';
const RECEIPT_LIFETIME_MS = 24 * 60 * 60 * 1000;

export type BankOrderReceipt = {
  orderCode: string;
  guestOrderNumber: string;
  channel: 'member' | 'guest';
  bankAccount: BankAccountDetails;
  total: number;
  items: Array<{ id: string; name: string; selectedSize: string | null; quantity: number; lineTotal: number }>;
  notifications?: OrderNotificationSummary;
  savedAt: number;
};

// This snapshot only helps restore the confirmation screen. It is never used to
// authorize a lookup, confirm payment, or create another order.
export function readBankOrderReceipt(value: string | null, now = Date.now()): BankOrderReceipt | null {
  if (!value) return null;
  try {
    const receipt: unknown = JSON.parse(value);
    if (!receipt || typeof receipt !== 'object') return null;
    const candidate = receipt as BankOrderReceipt;
    if (
      typeof candidate.orderCode !== 'string' || !/^[A-Z0-9_-]{1,80}$/i.test(candidate.orderCode) ||
      typeof candidate.guestOrderNumber !== 'string' || candidate.guestOrderNumber.length > 80 ||
      !['member', 'guest'].includes(candidate.channel) ||
      !Number.isFinite(candidate.total) || candidate.total < 0 ||
      !Number.isFinite(candidate.savedAt) || candidate.savedAt > now || now - candidate.savedAt > RECEIPT_LIFETIME_MS ||
      !candidate.bankAccount ||
      !['bankName', 'accountNumber', 'accountHolder'].every((key) => typeof candidate.bankAccount[key as keyof BankAccountDetails] === 'string') ||
      !Array.isArray(candidate.items) || candidate.items.length > 100
    ) return null;
    const items = candidate.items.map((item) => {
      if (!item || typeof item.name !== 'string' || typeof item.id !== 'string' || !Number.isFinite(item.quantity) || !Number.isFinite(item.lineTotal)) throw new Error('Invalid receipt');
      return { id: item.id, name: item.name, selectedSize: typeof item.selectedSize === 'string' ? item.selectedSize : null, quantity: item.quantity, lineTotal: item.lineTotal };
    });
    const notifications: OrderNotificationSummary = {};
    for (const key of ['customerEmail', 'customerSms', 'adminEmail', 'adminSms'] as const) {
      const status = candidate.notifications?.[key]?.status;
      if (typeof status === 'string') notifications[key] = { status };
    }
    // Pick fields explicitly so legacy/tampered snapshots cannot retain contact
    // details, an access token, or a guest lookup password when read and saved.
    return {
      orderCode: candidate.orderCode, guestOrderNumber: candidate.guestOrderNumber,
      channel: candidate.channel, total: candidate.total, savedAt: candidate.savedAt,
      bankAccount: { bankName: candidate.bankAccount.bankName, accountNumber: candidate.bankAccount.accountNumber, accountHolder: candidate.bankAccount.accountHolder },
      items, notifications,
    };
  } catch {
    return null;
  }
}
