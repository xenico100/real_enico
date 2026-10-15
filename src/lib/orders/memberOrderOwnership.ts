import { parseOrderRawPayload } from '@/lib/orders/rawPayload';

export const LEGACY_MEMBER_ORDER_LINK_MESSAGE = '이전 주문은 계정 연결 확인이 필요합니다. 고객센터로 문의해 주세요.';

/** Email addresses can be changed or reused; they never prove order ownership. */
export function getOrderCustomerUserId(rawPayload: unknown): string | null {
  const id = parseOrderRawPayload(rawPayload)?.customerUserId;
  return typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
    ? id.toLowerCase() : null;
}

export function isMemberOrderOwner(order: { channel: string | null; raw_payload: unknown }, userId: string) {
  return order.channel === 'member' && getOrderCustomerUserId(order.raw_payload) === userId.toLowerCase();
}
