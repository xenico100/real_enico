type ProductLike = {
  id: string;
};

type SoldOutMeta = {
  orderCode: string;
  paymentMethod: string;
};

type RestockMeta = {
  orderCode: string;
  paymentMethod: string;
};

function asRecord(value: unknown) {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function isTruthyFlag(value: unknown) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value <= 0;
  if (typeof value !== 'string') return false;

  const normalized = value.trim().toLowerCase();
  return normalized === 'true' || normalized === 'yes' || normalized === 'soldout' || normalized === 'sold_out' || normalized === 'out_of_stock' || normalized === '0';
}

export function isUuidLike(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value.trim(),
  );
}

export function extractPersistentProductIds(items: ProductLike[]) {
  return Array.from(
    new Set(
      items
        .map((item) => item.id.trim())
        .filter((id) => id.length > 0 && isUuidLike(id)),
    ),
  );
}

export function isProductMarkedSoldOut(raw: unknown) {
  const target = asRecord(raw);
  if (!target) return false;

  if (isTruthyFlag(target.sold_out) || isTruthyFlag(target.soldOut)) {
    return true;
  }

  if (isTruthyFlag(target.stock) || isTruthyFlag(target.inventory) || isTruthyFlag(target.quantity)) {
    return true;
  }

  const status = typeof target.status === 'string' ? target.status.trim().toLowerCase() : '';
  return status === 'soldout' || status === 'sold_out' || status === 'out_of_stock';
}

export function buildSoldOutRaw(raw: unknown, meta: SoldOutMeta) {
  const base = asRecord(raw) ?? {};
  const soldOutAt = new Date().toISOString();

  return {
    ...base,
    sold_out: true,
    soldOut: true,
    stock: 0,
    inventory: 0,
    quantity: 0,
    sold_out_at: soldOutAt,
    soldOutAt,
    sold_out_order_code: meta.orderCode,
    soldOutOrderCode: meta.orderCode,
    sold_out_payment_method: meta.paymentMethod,
    soldOutPaymentMethod: meta.paymentMethod,
  };
}

export function buildAvailableRaw(raw: unknown, meta: RestockMeta) {
  const base = asRecord(raw) ?? {};
  const restockedAt = new Date().toISOString();

  return {
    ...base,
    sold_out: false,
    soldOut: false,
    stock: 1,
    inventory: 1,
    quantity: 1,
    restocked_at: restockedAt,
    restockedAt,
    restocked_order_code: meta.orderCode,
    restockedOrderCode: meta.orderCode,
    restocked_payment_method: meta.paymentMethod,
    restockedPaymentMethod: meta.paymentMethod,
  };
}
