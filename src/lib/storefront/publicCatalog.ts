import { buildProductCatalog, NICEPAY_TEST_PRODUCT_ID } from '@/lib/storefront/productCatalog';
import { buildCollectionCatalog } from '@/lib/storefront/collectionCatalog';
import { isStorefrontProductVisible } from '@/lib/storefront/productDisplay';
import type { StorefrontCollectionRow, StorefrontProductRow } from '@/lib/storefront/shared';

const TEST_TITLE = /\btest\b|nice\s*pay(?:ments?)?|테스트/i;
const PUBLIC_RAW_KEYS = [
  'sold_out', 'soldOut', 'stock', 'inventory', 'quantity', 'status',
  'modelUrl', 'model_url', 'clo3dUrl', '3dUrl', 'modelVariants', 'model_variants', '3dVariants',
  'images', 'image_urls', 'imageUrls', 'productImages', 'additionalImages', 'optionalImages', 'detailImages',
  'thumbnail_url', 'thumbnailUrl', 'representImageUrl', 'represent_image_url', 'imageUrl', 'image_url', 'originImageUrl',
  'category', 'category_name', 'categoryName', 'wholeCategoryName', 'firstCategoryName', 'secondCategoryName', 'leafCategoryName',
] as const;

// Raw order provenance and free-form internal notes are never copied into the response
// or merged into public descriptions. Only catalog media and inventory fields are read.
function publicProductRow(row: StorefrontProductRow): StorefrontProductRow {
  const source = row.raw && typeof row.raw === 'object' ? row.raw as Record<string, unknown> : {};
  return { ...row, raw: Object.fromEntries(PUBLIC_RAW_KEYS.filter((key) => key in source).map((key) => [key, source[key]])) };
}

function publicAssetUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  if (value.startsWith('/') && !value.startsWith('//') && !value.includes('\\')) return value;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

export function buildPublicStorefrontCatalog(productRows: StorefrontProductRow[], collectionRows: StorefrontCollectionRow[]) {
  const visibleRows = productRows.filter((row) =>
    isStorefrontProductVisible(row) && Boolean(row.id && row.title?.trim()) &&
    row.id !== NICEPAY_TEST_PRODUCT_ID && !TEST_TITLE.test(row.title || ''),
  );
  const visibleIds = new Set(visibleRows.map((row) => row.id));
  const products = buildProductCatalog(visibleRows.map(publicProductRow))
    .filter((product) => visibleIds.has(product.id) &&
      product.id !== NICEPAY_TEST_PRODUCT_ID && !TEST_TITLE.test(product.name) &&
      Number.isSafeInteger(product.price) && product.price > 0)
    .map((product) => ({
      ...product,
      isSoldOut: Boolean(product.isSoldOut),
      image: publicAssetUrl(product.image) || '',
      images: product.images.map(publicAssetUrl).filter((url): url is string => Boolean(url)),
      detailImageUrl: publicAssetUrl(product.detailImageUrl),
      smartstoreUrl: publicAssetUrl(product.smartstoreUrl),
      modelUrl: publicAssetUrl(product.modelUrl),
      modelVariants: product.modelVariants ? Object.fromEntries(Object.entries(product.modelVariants)
        .map(([key, value]) => [key, publicAssetUrl(value)])
        .filter(([, value]) => Boolean(value))) : undefined,
    }));
  const collections = buildCollectionCatalog(collectionRows.filter((row) =>
    row.is_published === true && Boolean(row.id && row.title?.trim()) && !TEST_TITLE.test(row.title || ''),
  )).map((collection) => ({
    ...collection,
    image: publicAssetUrl(collection.image) || '',
    images: collection.images.map(publicAssetUrl).filter((url): url is string => Boolean(url)),
  }));
  return { products, collections };
}
