/** Public remittance details. Both checkout and server notifications use this source. */
export const BANK_ACCOUNT = {
  bankName: '카카오뱅크',
  accountNumber: '3333-09-2834969',
  accountHolder: '백형석',
} as const;

export function formatBankTransferAmount(value: number) {
  return `${Math.round(value).toLocaleString('ko-KR')}원`;
}

export function getOrderBankAccount(order: { bank_name?: string | null; bank_account_number?: string | null }) {
  return {
    ...BANK_ACCOUNT,
    bankName: order.bank_name?.trim() || BANK_ACCOUNT.bankName,
    accountNumber: order.bank_account_number?.trim() || BANK_ACCOUNT.accountNumber,
  };
}
