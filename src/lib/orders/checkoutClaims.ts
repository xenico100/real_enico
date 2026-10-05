import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { extractPersistentProductIds } from '@/lib/storefront/productAvailability';
import { OrderValidationError } from '@/lib/orders/serverOrderValidation';

type CheckoutPaymentMethod = 'paypal' | 'nicepay';
type CheckoutItem = { id: string };

/**
 * Atomically claims each one-of-a-kind product before the payment provider is
 * asked to approve/capture money. A claim is deliberately retained when the
 * provider or database outcome is uncertain; only a known-safe path releases it.
 */
export async function claimCheckoutProducts(
  serviceClient: SupabaseClient,
  items: CheckoutItem[],
  paymentMethod: CheckoutPaymentMethod,
  orderCode: string,
  holdSeconds = 24 * 60 * 60,
) {
  const productIds = extractPersistentProductIds(items);
  if (productIds.length === 0) return;

  const { data, error } = await serviceClient.rpc('claim_checkout_products', {
    p_order_code: orderCode,
    p_payment_method: paymentMethod,
    p_product_ids: productIds,
    p_hold_seconds: holdSeconds,
  });

  if (error) {
    if (error.code === 'P0001') {
      throw new OrderValidationError(
        '선택한 상품이 다른 결제에서 처리 중이거나 품절되었습니다. 잠시 후 다시 확인해 주세요.',
        409,
      );
    }
    console.error('Checkout product claim failed', { code: error.code, message: error.message });
    throw new OrderValidationError('상품 결제 가능 여부를 확인하지 못했습니다.', 503);
  }
  if (data !== true) {
    throw new OrderValidationError('상품 결제 가능 여부를 확인하지 못했습니다.', 503);
  }
}

export async function releaseCheckoutProducts(
  serviceClient: SupabaseClient,
  paymentMethod: CheckoutPaymentMethod,
  orderCode: string,
) {
  const { error } = await serviceClient.rpc('release_checkout_products', {
    p_order_code: orderCode,
    p_payment_method: paymentMethod,
  });
  if (error) {
    console.error('Checkout product claim release failed', { code: error.code, message: error.message });
    throw new Error('상품 결제 선점 해제에 실패했습니다.');
  }
}
