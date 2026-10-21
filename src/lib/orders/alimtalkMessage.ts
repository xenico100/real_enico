import { getOrderBankAccount } from './bankAccount';
import type { NotificationMessageOrder, OrderNotificationEvent } from './notificationMessage';

// These exact bodies must be approved in SOLAPI before their IDs are enabled.
// Shipping uses the channel's existing approved template without changing copy.
export const ORDER_ALIMTALK_TEMPLATES = {
  order_received: `[ENICO VECK]
#{고객명}님, 주문이 접수되었습니다.
현재 입금 대기 상태입니다.

주문번호: #{주문번호}
주문상품: #{주문상품}
입금할 금액: #{입금액}
입금계좌: #{입금계좌}

입금자명은 주문자 이름과 동일하게 입력해 주세요.
단품 재고는 주문 접수만으로 예약되지 않습니다. 송금 전에 주문 상태와 재고를 확인해 주세요.
주문조회: https://enicoveck.com/orders
문의: morba9850@gmail.com`,
  payment_confirmed: `[ENICO VECK]
#{고객명}님, 주문 결제가 확인되었습니다.

주문번호: #{주문번호}
주문상품: #{주문상품}
결제금액: #{결제금액}

추가 입금은 필요하지 않습니다.
상품 발송 시 배송 정보를 별도로 안내드립니다.
주문조회: https://enicoveck.com/orders
문의: morba9850@gmail.com`,
  shipping_started: `[ENICO VECK]
#{고객명}님, 안녕하세요. 에니코벡입니다.
주문하신 상품이 발송되어 배송 정보를 안내드립니다.

주문번호: #{주문번호}
주문상품: #{주문상품}
택배사: #{택배사}
송장번호: #{송장번호}

배송 조회는 택배사에 운송장 정보가 반영된 후 가능합니다.
감사합니다.`,
} as const;

function line(value: unknown, max: number): string {
  return typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max) : '';
}

/** Only real order fields become variables. No promised date or tracking is invented. */
export function buildOrderAlimtalk(order: NotificationMessageOrder, event: OrderNotificationEvent) {
  if (event !== 'order_received' && event !== 'payment_confirmed' && event !== 'shipping_started') return null;
  const items = Array.isArray(order.items) ? order.items : [];
  const products = items.slice(0, 5).map(item => {
    if (!item || typeof item !== 'object') return '';
    const quantity = Number(item.quantity);
    return `${line(item.name, 65) || '상품'} × ${Number.isSafeInteger(quantity) && quantity > 0 ? quantity : 1}`;
  }).filter(Boolean).join(', ') + (items.length > 5 ? ` 외 ${items.length - 5}개 품목` : '');
  const variables: Record<string, string> = {
    '#{고객명}': line(order.customer_name, 80),
    '#{주문번호}': line(order.order_code, 80),
    '#{주문상품}': products,
  };
  if (event === 'shipping_started') {
    variables['#{택배사}'] = line(order.shipping_company, 80);
    variables['#{송장번호}'] = line(order.tracking_number, 200);
  } else {
    const total = Number(order.amount_total);
    if (!Number.isFinite(total) || total < 0 || !/^[A-Z]{3}$/.test(order.currency.toUpperCase())) return null;
    const amount = order.currency.toUpperCase() === 'KRW' ? `${Math.round(total).toLocaleString('ko-KR')}원`
      : `${order.currency.toUpperCase()} ${total.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}`;
    if (event === 'order_received') {
      const bank = getOrderBankAccount(order);
      variables['#{입금액}'] = amount;
      variables['#{입금계좌}'] = `${bank.bankName} ${bank.accountNumber} (예금주: ${bank.accountHolder})`;
    } else variables['#{결제금액}'] = amount;
  }
  if (Object.values(variables).some(value => !value)) return null;
  const text = ORDER_ALIMTALK_TEMPLATES[event].replace(/#\{[^{}]+\}/g, key => variables[key]);
  return { text, alimtalk: { event, variables } };
}
