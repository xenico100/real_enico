type ProductLike = {
  id: string;
};

type OrderItemLike = ProductLike & {
  quantity: number;
};

type SoldOutMeta = {
  orderCode: string;
  paymentMethod: string;
};

type RestockMeta = {
  orderCode: string;
  paymentMethod: string;
};

type InventoryMeta = {
  quantity: number;
  isSoldOut: boolean;
  source?: string;
};

const SOLD_OUT_PRODUCT_TITLES = [
  'EVA-JACEKT',
  'Akira Jacket',
  'Flannel double-label shirt',
  'eco bag',
  'Blue Flower Shoulder bag',
  '퍼펙트 블루의 가면',
  'enico MIX shirts',
  'enico veck 2025 denim jacket',
  'enico veck’s denim hood jacket',
  'enico damm denim jacket',
  '가치아쿠타의 장갑',
  'enico MIX pants',
  'Mononoke Bolero',
  'INFINITY CASTLE Shorts',
  'INFINITY CASTLE Crop Shirts',
  'Mononoke Pants',
  'Ben’s Shirts',
  'Mononoke Jacket',
  'INFINITY CASTLE Kimono',
  'BOMB DEVIL Dress+Choker',
  'Ben’s Cago Pants',
  'BERSERK Jacket',
  'BERSERK Pants',
  'Night Face',
  'Check Shark',
  'Desert Bat',
  'Desert Dee',
  'Desert Angry Shark',
  '2Face Shark',
  'Enico Dee',
  'Enico Veck 1st Linen Jacket',
] as const;

function normalizeSoldOutTitleKey(value: string) {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/['’`"“”]/g, '')
    .replace(/[^a-z0-9가-힣]+/g, '');
}

const SOLD_OUT_PRODUCT_TITLE_KEY_SET = new Set(
  SOLD_OUT_PRODUCT_TITLES.map((title) => normalizeSoldOutTitleKey(title)),
);

function asRecord(value: unknown) {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function readNumericInventoryValue(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.trunc(value));
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed)) {
      return Math.max(0, Math.trunc(parsed));
    }
  }

  return null;
}

function isTruthyFlag(value: unknown) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value <= 0;
  if (typeof value !== 'string') return false;

  const normalized = value.trim().toLowerCase();
  return normalized === 'true' || normalized === 'yes' || normalized === 'soldout' || normalized === 'sold_out' || normalized === 'out_of_stock' || normalized === '0';
}

function isFalseySoldOutFlag(value: unknown) {
  if (typeof value === 'boolean') return value === false;
  if (typeof value === 'number') return value > 0;
  if (typeof value !== 'string') return false;

  const normalized = value.trim().toLowerCase();
  return (
    normalized === 'false' ||
    normalized === 'no' ||
    normalized === 'available' ||
    normalized === 'in_stock' ||
    normalized === 'instock' ||
    normalized === '1'
  );
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

export function getSingleStockOrderViolation(items: OrderItemLike[]) {
  const seenProductIds = new Set<string>();

  for (const item of items) {
    const normalizedId = item.id.trim().toLowerCase();
    if (!normalizedId) continue;

    if (!Number.isFinite(item.quantity) || item.quantity !== 1) {
      return '모든 상품은 재고 1개만 판매하므로 수량은 1개만 주문할 수 있습니다.';
    }

    if (seenProductIds.has(normalizedId)) {
      return '같은 상품은 중복 주문할 수 없습니다.';
    }

    seenProductIds.add(normalizedId);
  }

  return null;
}

export function getProductInventoryQuantity(raw: unknown) {
  const target = asRecord(raw);
  if (!target) return null;

  const stock = readNumericInventoryValue(target.stock);
  if (stock !== null) return stock;

  const inventory = readNumericInventoryValue(target.inventory);
  if (inventory !== null) return inventory;

  return readNumericInventoryValue(target.quantity);
}

export function isProductMarkedAvailable(raw: unknown) {
  const target = asRecord(raw);
  if (!target) return false;

  if (isTruthyFlag(target.sold_out) || isTruthyFlag(target.soldOut)) {
    return false;
  }

  const status = typeof target.status === 'string' ? target.status.trim().toLowerCase() : '';
  if (status === 'soldout' || status === 'sold_out' || status === 'out_of_stock') {
    return false;
  }

  const inventoryQuantity = getProductInventoryQuantity(raw);
  if (inventoryQuantity !== null) {
    return inventoryQuantity > 0;
  }

  return (
    isFalseySoldOutFlag(target.sold_out) ||
    isFalseySoldOutFlag(target.soldOut) ||
    status === 'available' ||
    status === 'in_stock' ||
    status === 'instock'
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

export function isProductTitleMarkedSoldOut(title: unknown) {
  return (
    typeof title === 'string' &&
    SOLD_OUT_PRODUCT_TITLE_KEY_SET.has(normalizeSoldOutTitleKey(title))
  );
}

export function getSoldOutOrderItemName(items: Array<{ name?: unknown }>) {
  const soldOutItem = items.find((item) => isProductTitleMarkedSoldOut(item.name));
  return typeof soldOutItem?.name === 'string' && soldOutItem.name.trim()
    ? soldOutItem.name.trim()
    : null;
}

export function buildInventoryRaw(raw: unknown, meta: InventoryMeta) {
  const base = asRecord(raw) ?? {};
  const quantity = Math.max(0, Math.trunc(meta.quantity));
  const now = new Date().toISOString();
  const isSoldOut = meta.isSoldOut || quantity <= 0;

  return {
    ...base,
    sold_out: isSoldOut,
    soldOut: isSoldOut,
    stock: isSoldOut ? 0 : quantity,
    inventory: isSoldOut ? 0 : quantity,
    quantity: isSoldOut ? 0 : quantity,
    status: isSoldOut ? 'out_of_stock' : 'available',
    inventory_updated_at: now,
    inventoryUpdatedAt: now,
    inventory_update_source: meta.source ?? 'admin',
    inventoryUpdateSource: meta.source ?? 'admin',
    ...(isSoldOut
      ? {
          sold_out_at: now,
          soldOutAt: now,
        }
      : {
          restocked_at: now,
          restockedAt: now,
        }),
  };
}

export function buildSoldOutRaw(raw: unknown, meta: SoldOutMeta) {
  const base = buildInventoryRaw(raw, {
    quantity: 0,
    isSoldOut: true,
    source: `order:${meta.paymentMethod}`,
  });
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
  const currentQuantity = getProductInventoryQuantity(raw);
  const base = buildInventoryRaw(raw, {
    quantity: currentQuantity !== null && currentQuantity > 0 ? currentQuantity : 1,
    isSoldOut: false,
    source: `restock:${meta.paymentMethod}`,
  });
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
