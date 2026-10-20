import { formatBankTransferAmount, getOrderBankAccount } from './bankAccount';
import { isCurrentTrackingCorrection } from './shippingWorkflow';

export type OrderNotificationEvent = 'order_received' | 'payment_confirmed' | 'shipping_started' | 'delivered' | 'cancelled' | 'refund_pending' | 'refunded';
export type NotificationMessageOrder = {
  id: string; order_code: string; guest_order_number: string | null; channel: string;
  payment_method: string; payment_status: string; amount_total: number; currency: string;
  customer_name: string; customer_email: string; customer_phone: string;
  bank_name: string | null; bank_account_number: string | null; items: unknown;
  shipping_status: string | null; shipping_company: string | null; tracking_number: string | null;
  raw_payload: unknown;
};
const LABELS: Record<OrderNotificationEvent, string> = {
  order_received: '주문 접수 · 입금 대기', payment_confirmed: '입금·결제 확인',
  shipping_started: '배송 시작', delivered: '배송 완료', cancelled: '주문 취소',
  refund_pending: '환불 진행 중', refunded: '환불 완료',
};

function productText(items: unknown) {
  return Array.isArray(items) ? items.slice(0, 5).map(item => {
    if (!item || typeof item !== 'object') return '';
    return `${String(item.name || '상품').replace(/[\r\n]/g, ' ').slice(0, 65)} × ${Number(item.quantity) || 1}`;
  }).filter(Boolean).join(', ') : '';
}

export function buildOrderNotificationMessage(order: NotificationMessageOrder, event: OrderNotificationEvent, admin: boolean) {
  const bank = getOrderBankAccount(order);
  const paymentMethod = order.payment_method.trim().toLowerCase();
  const correctedTracking = (event === 'shipping_started' || event === 'delivered') && isCurrentTrackingCorrection(order);
  const label = correctedTracking ? '배송 정보 정정' : event === 'payment_confirmed'
    ? paymentMethod === 'bank_transfer' ? '입금 확인 완료'
      : paymentMethod === 'nicepay' ? '카드 결제 완료'
        : paymentMethod === 'paypal' ? 'PayPal 결제 완료' : '결제 완료'
    : LABELS[event];
  const amount = order.currency.toUpperCase() === 'KRW'
    ? formatBankTransferAmount(Number(order.amount_total))
    : `${order.currency.toUpperCase()} ${Number(order.amount_total).toLocaleString('ko-KR', { maximumFractionDigits: 2 })}`;
  const lines = [`[ENICO VECK] ${label}`, `주문번호: ${order.order_code}`];
  if (order.guest_order_number) lines.push(`비회원 조회번호: ${order.guest_order_number}`);
  if (admin) lines.push(`주문자: ${order.customer_name}`, `연락처: ${order.customer_phone}`);
  lines.push(`상품: ${productText(order.items)}`, `${event === 'order_received' ? '입금할 금액' : '금액'}: ${amount}`);
  if (event === 'order_received') lines.push(`${bank.bankName} ${bank.accountNumber}`, `예금주: ${bank.accountHolder}`,
    '입금자명은 주문자 이름과 동일하게 입력해 주세요.', '현재 입금 대기 상태이며, 운영자가 입금을 확인한 뒤 처리합니다.',
    '단품 재고는 주문 접수만으로 예약되지 않습니다. 송금 전에 주문 상태와 재고를 확인해 주세요.');
  if (event === 'payment_confirmed') lines.push(paymentMethod === 'bank_transfer'
    ? '입금이 확인되었습니다. 추가 입금은 필요하지 않습니다.'
    : paymentMethod === 'nicepay' ? '카드 결제가 승인되었습니다. 추가 입금은 필요하지 않습니다.'
      : '결제가 완료되었습니다. 추가 입금은 필요하지 않습니다.');
  if (event === 'shipping_started' || event === 'delivered') lines.push(`택배사: ${order.shipping_company || '우체국'}`, `운송장: ${order.tracking_number || '관리자 확인 필요'}`);
  if (correctedTracking) lines.push('배송 정보가 정정되었습니다. 위의 최신 택배사와 운송장 번호를 확인해 주세요.');
  if (event === 'refund_pending') lines.push('환불 요청이 접수되었습니다. 실제 환불 완료와는 구분됩니다.');
  if (event === 'cancelled') lines.push('취소된 주문에는 입금하지 마세요. 이미 입금했다면 고객센터로 연락해 주세요.');
  lines.push(admin ? '관리자에서 주문과 실제 입금 내역을 확인해 주세요.' : '주문조회: https://enicoveck.com/orders',
    ...(admin ? [] : ['문의: morba9850@gmail.com']));
  return { subject: `[ENICO VECK] ${label} ${order.order_code}`, text: lines.join('\n') };
}
