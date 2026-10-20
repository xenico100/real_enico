'use client';

import { useState } from 'react';
import { BANK_ACCOUNT } from '@/lib/orders/bankAccount';
import { getCustomerNotificationEventLabel, getCustomerNotificationLabel } from '@/lib/orders/customerOrderPresentation';
import styles from './BankTransferInstructions.module.css';
import type { BankAccountDetails, OrderNotificationSummary } from '@/lib/orders/bankReceipt';
export type { BankAccountDetails, OrderNotificationSummary } from '@/lib/orders/bankReceipt';

export function CustomerOrderNotifications({ notifications, tone = 'light' }: { notifications?: OrderNotificationSummary | null; tone?: 'light' | 'dark' }) {
  if (!notifications) return null;
  const channels = [['customerSms', '문자'], ['customerEmail', '이메일']] as const;
  const available = channels.filter(([key]) => notifications[key]);
  if (!available.length) return null;
  return (
    <div className={tone === 'dark' ? styles.notificationDark : 'space-y-1 text-xs leading-relaxed text-[#4b5563]'} aria-live="polite" aria-atomic="true">
      {available.map(([key, label]) => {
        const record = notifications[key];
        return <p key={key}>{getCustomerNotificationEventLabel(record?.event)} {label}: {getCustomerNotificationLabel(record?.status)}</p>;
      })}
    </div>
  );
}

export function BankTransferInstructions({
  bankAccount = BANK_ACCOUNT,
  amount,
  tone = 'light',
}: {
  bankAccount?: BankAccountDetails;
  amount: number;
  tone?: 'light' | 'dark';
}) {
  const [copyStatus, setCopyStatus] = useState('');

  const copyAccount = async () => {
    try {
      await navigator.clipboard.writeText(bankAccount.accountNumber);
      setCopyStatus('계좌번호를 복사했습니다.');
    } catch {
      setCopyStatus('복사하지 못했습니다. 계좌번호를 길게 눌러 복사해 주세요.');
    }
  };

  return (
    <section className={tone === 'dark' ? styles.dark : "rounded-xl border border-[#d1d5db] bg-white p-4 text-[#111827]"}>
      <h3 className="text-sm font-bold">무통장입금 안내</h3>
      <p className="mt-2 text-sm leading-relaxed">주문이 접수되었으며 아직 입금 대기 상태입니다. 아래 계좌로 직접 송금해 주세요.</p>
      <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
        <dt className="text-[#6b7280]">입금액</dt><dd className="text-right font-bold">{Math.round(amount).toLocaleString('ko-KR')}원</dd>
        <dt className="text-[#6b7280]">은행</dt><dd className="text-right">{bankAccount.bankName}</dd>
        <dt className="text-[#6b7280]">계좌번호</dt><dd className="select-all break-all text-right font-bold">{bankAccount.accountNumber}</dd>
        <dt className="text-[#6b7280]">예금주</dt><dd className="text-right">{bankAccount.accountHolder}</dd>
      </dl>
      <button type="button" onClick={() => void copyAccount()} className="mt-4 w-full rounded-lg border border-[#d1d5db] px-3 py-2.5 text-sm font-bold hover:border-[#b8001f] hover:text-[#b8001f]">계좌번호 복사</button>
      {copyStatus && <p role="status" className="mt-2 text-xs text-[#4b5563]">{copyStatus}</p>}
      <p className="mt-3 text-xs leading-relaxed text-[#4b5563]">입금자명은 주문 시 입력한 수령인 이름과 같게 입력해 주세요. 운영자가 입금을 확인한 뒤 주문 상태가 변경됩니다.</p>
    </section>
  );
}
