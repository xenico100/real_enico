export type CustomerOrderItem = {
  id: string;
  name: string;
  category?: string;
  selectedSize: string | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  image?: string;
};

export type CustomerOrderState = {
  paymentMethod: string;
  paymentStatus: string;
  shippingStatus: string;
};

export function isCustomerPaymentConfirmed(order: CustomerOrderState) {
  const method = order.paymentMethod.trim().toLowerCase();
  const status = order.paymentStatus.trim().toLowerCase();
  return method === 'bank_transfer' ? status === 'transfer_confirmed'
    : method === 'nicepay' ? status === 'paid'
      : method === 'paypal' ? status === 'captured' || status === 'completed' : false;
}

export function getCustomerOrderProgress(order: CustomerOrderState) {
  const payment = order.paymentStatus.trim().toLowerCase();
  const shipping = order.shippingStatus.trim().toLowerCase();
  if (payment === 'cancelled' || payment === 'partialcancelled') {
    return { label: payment === 'partialcancelled' ? '부분 취소 · 상태 확인' : '주문 취소', detail: '취소 내역을 확인해 주세요.', step: -1, paid: false, stopped: true };
  }
  if (payment === 'refund_pending' || payment === 'cancel_processing') {
    return { label: payment === 'refund_pending' ? '환불 진행중' : '결제 취소 확인중', detail: '처리 결과가 확인되면 상태가 변경됩니다.', step: -1, paid: false, stopped: true };
  }
  if (!isCustomerPaymentConfirmed(order)) {
    return {
      label: payment === 'pending_transfer' ? '입금 확인 후 준비' : '결제 확인중',
      detail: payment === 'pending_transfer' ? '입금이 확인되면 상품 준비를 시작합니다.' : '결제 확인이 끝나면 다음 단계를 안내합니다.',
      step: 0, paid: false, stopped: false,
    };
  }
  if (shipping === 'delivered') return { label: '배송 완료', detail: '주문하신 상품의 배송이 완료되었습니다.', step: 3, paid: true, stopped: false };
  if (shipping === 'shipping') return { label: '배송중', detail: '상품을 발송했습니다. 운송장으로 이동 현황을 확인하세요.', step: 2, paid: true, stopped: false };
  if (shipping === 'preparing') return { label: '배송 준비중', detail: '결제가 확인되었습니다. 상품을 정성껏 준비하고 있습니다.', step: 1, paid: true, stopped: false };
  return { label: '배송 상태 확인중', detail: '결제는 확인되었습니다. 정확한 배송 상태를 확인하고 있습니다.', step: -1, paid: true, stopped: true };
}

export function getCustomerPaymentLabel(order: CustomerOrderState) {
  const status = order.paymentStatus.trim().toLowerCase();
  if (status === 'pending_transfer') return '입금 대기';
  if (order.paymentMethod.trim().toLowerCase() === 'bank_transfer' && status === 'transfer_confirmed') return '입금 확인';
  if (isCustomerPaymentConfirmed(order)) return '결제 완료';
  if (status === 'cancelled') return '취소 완료';
  if (status === 'refund_pending') return '환불 진행중';
  if (status === 'cancel_processing') return '취소 확인중';
  if (status === 'partialcancelled') return '부분 취소';
  return '결제 확인중';
}

export function getCustomerNotificationLabel(status: string | undefined) {
  if (status === 'delivered') return '전달 확인';
  if (status === 'sent') return '발송 완료 · 수신 확인 전';
  if (status === 'queued') return '발송 대기';
  if (status === 'claimed' || status === 'sending') return '발송 처리중';
  if (status === 'submitted' || status === 'accepted') return '발송 요청 완료 · 결과 확인중';
  if (status === 'failed') return '발송 실패 · 주문 내역은 이 화면에서 확인해 주세요.';
  if (status === 'not_configured' || status === 'skipped') return '발송되지 않음';
  return '발송 결과 확인중';
}

export function getCustomerNotificationEventLabel(event: string | undefined) {
  if (event === 'payment_confirmed') return '결제 확인';
  if (event === 'shipping_started') return '배송 안내';
  if (event === 'delivered') return '배송 완료 안내';
  if (event === 'cancelled') return '취소 안내';
  if (event === 'refund_pending') return '환불 접수';
  if (event === 'refunded') return '환불 완료 안내';
  if (event === 'order_received') return '입금 안내';
  return '주문 안내';
}

export function formatCustomerOrderDate(value: string | null, includeTime = false) {
  if (!value) return '확인 전';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '확인 전';
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    ...(includeTime ? { hour: '2-digit', minute: '2-digit' } as const : {}),
    timeZone: 'Asia/Seoul',
  }).format(date);
}

export function formatCustomerOrderMoney(amount: number, currency = 'KRW') {
  const safeAmount = Number.isFinite(amount) ? amount : 0;
  if (currency === 'KRW') return `${Math.round(safeAmount).toLocaleString('ko-KR')}원`;
  // The API allows historic currencies; avoid throwing for an unknown code.
  if (!/^[A-Z]{3}$/.test(currency)) return `${safeAmount.toLocaleString('ko-KR')}`;
  return new Intl.NumberFormat('ko-KR', { style: 'currency', currency }).format(safeAmount);
}
