'use client';

import { useState } from 'react';
import { CustomerOrderCard, type CustomerOrderCardData } from '@/app/components/subculture/CustomerOrderCard';
import { CustomerOrderListState } from '@/app/components/subculture/CustomerOrderListState';
import { getCustomerOrderProgress, formatCustomerOrderMoney } from '@/lib/orders/customerOrderPresentation';
import myPageStyles from '@/app/components/subculture/MyPagePanel.module.css';
import styles from './OrderPreview.module.css';

const fixture: CustomerOrderCardData = {
  id: 'synthetic-order-preview', orderCode: 'FIXTURE-0001', guestOrderNumber: '',
  paymentMethod: 'bank_transfer', paymentStatus: 'pending_transfer', currency: 'KRW', amountTotal: 128000,
  customerAddress: '테스트 배송지 · 실제 주소가 아닙니다', shippingNote: '개인정보 없는 개발용 예시',
  shippingStatus: 'preparing', shippingCompany: '우체국', trackingNumber: '',
  bankAccount: { bankName: '테스트 은행', accountNumber: '000-0000-0000', accountHolder: '개발용 예시' },
  shippedAt: null, deliveredAt: null, createdAt: '2026-01-01T00:00:00.000Z',
  items: [
    { id: 'synthetic-jacket', name: 'Archive sample jacket', category: '아우터', selectedSize: 'M', quantity: 1, unitPrice: 98000, lineTotal: 98000, image: '/dev/order-preview/fixture-image.svg?piece=jacket' },
    { id: 'synthetic-object', name: 'Studio sample object', category: '오브제', selectedSize: null, quantity: 2, unitPrice: 15000, lineTotal: 30000, image: '/dev/order-preview/fixture-image.svg?piece=object' },
  ],
  notifications: { customerSms: { status: 'queued', event: 'order_received' }, customerEmail: { status: 'sent', event: 'order_received' } },
};

const MODES = [
  ['pending', '입금 대기'], ['confirmed', '입금 확인'], ['shipping', '배송중'], ['delivered', '배송 완료'],
  ['failed', '알림 실패'], ['cancelled', '취소'], ['unknown-carrier', '기타 택배사'], ['loading', '로딩'], ['error', '오류'], ['empty', '빈 상태'],
] as const;
type PreviewMode = typeof MODES[number][0];

function getFixture(mode: PreviewMode): CustomerOrderCardData {
  const order = { ...fixture };
  if (mode !== 'pending') order.paymentStatus = 'transfer_confirmed';
  if (['shipping', 'delivered', 'unknown-carrier'].includes(mode)) {
    order.shippingStatus = mode === 'delivered' ? 'delivered' : 'shipping';
    order.shippedAt = '2026-01-02T00:00:00.000Z';
    order.trackingNumber = '0000000000000';
    order.notifications = { customerSms: { status: 'sent', event: 'shipping_started' } };
  }
  if (mode === 'delivered') order.deliveredAt = '2026-01-03T00:00:00.000Z';
  if (mode === 'unknown-carrier') {
    order.shippingCompany = '지원 외 택배사';
    order.trackingNumber = '0000000000001';
  }
  if (mode === 'failed') order.notifications = { customerSms: { status: 'failed', event: 'payment_confirmed' }, customerEmail: { status: 'queued', event: 'payment_confirmed' } };
  if (mode === 'cancelled') order.paymentStatus = 'cancelled';
  return order;
}

export function OrderPreview() {
  const [mode, setMode] = useState<PreviewMode>('pending');
  const order = getFixture(mode);
  const referenceStatus = ['loading', 'error', 'empty'].includes(mode)
    ? MODES.find(([value]) => value === mode)?.[1] : getCustomerOrderProgress(order).label;
  return <main className={styles.page}>
    <div className={styles.wrap}>
      <header className={styles.header}><p>ENICO VECK / COMPONENT STUDY</p><h1>주문에서 도착까지.</h1><p className={styles.fixture}>개발용 FIXTURE · 가상 주문 · 실제 고객 화면이 아닙니다</p></header>
      <div className={styles.controls} role="group" aria-label="개발용 주문 상태 선택">{MODES.map(([value, label]) => <button type="button" key={value} aria-pressed={mode === value} onClick={() => setMode(value)}>{label}</button>)}</div>
      <div className={`${myPageStyles.shell} ${styles.preview}`}>
        <section data-color-reference className={`${myPageStyles.contentShell} ${styles.reference}`} aria-label="기존 마이페이지 색상 비교 기준">
          <p className={myPageStyles.eyebrow}>기존 MyPagePanel CSS · 동일 fixture 상태</p>
          <h2 className={myPageStyles.contentHeading}>{referenceStatus}</h2>
          <p className={myPageStyles.meta}>{order.orderCode} · {formatCustomerOrderMoney(order.amountTotal, order.currency)} · 개인정보 없는 비교 기준</p>
        </section>
        {mode === 'loading' || mode === 'error' || mode === 'empty' ? <CustomerOrderListState state={mode} onRetry={() => setMode('pending')} /> : <CustomerOrderCard order={order} cancelState={{ visible: true, enabled: false, title: '개발용 예시', label: 'fixture · 변경 불가', description: '개발용 예시입니다. 실제 취소나 고객 알림을 실행하지 않습니다.' }} />}
      </div>
      <p className={styles.footnote}>실제 고객용 컴포넌트를 사용합니다. 상태 선택은 브라우저 안에서만 바뀌며 주문 API를 호출하지 않습니다.</p>
    </div>
  </main>;
}
