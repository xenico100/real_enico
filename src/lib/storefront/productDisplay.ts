// Sold garments may remain visible as archive pieces without becoming purchasable.
// Keep this explicit: unpublished drafts must never enter the public catalog.
export const SOLD_OUT_DISPLAY_PRODUCT_IDS = [
  '7cd29c56-20a4-4677-813e-adbf1043b256', // Re: flower of evil jacket
] as const;

type ProductDisplayRow = {
  id: string;
  is_published?: boolean | null;
};

export function isSoldOutDisplayProductId(id: string) {
  return SOLD_OUT_DISPLAY_PRODUCT_IDS.some((productId) => productId === id);
}

export function isArchivedSoldOutProduct(row: ProductDisplayRow) {
  return row.is_published === false && isSoldOutDisplayProductId(row.id);
}

export function isStorefrontProductVisible(row: ProductDisplayRow) {
  return row.is_published === true || isArchivedSoldOutProduct(row);
}
