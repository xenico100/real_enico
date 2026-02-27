export const PRODUCT_CATEGORIES = [
  '아우터',
  '셔츠',
  '팬츠',
  '가방',
  '인형',
  '드레스',
] as const;

export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number];

export const DEFAULT_PRODUCT_CATEGORY: ProductCategory = PRODUCT_CATEGORIES[0];

export function isProductCategory(value: string): value is ProductCategory {
  return PRODUCT_CATEGORIES.includes(value as ProductCategory);
}
