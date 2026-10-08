import { getCachedStorefrontProductsStrict } from '@/lib/storefront/server';
import {
  buildProductCatalog,
  NICEPAY_TEST_PRODUCT_ID,
} from '@/lib/storefront/productCatalog';

export const revalidate = 300;

const SOURCE_URL = 'https://enicoveck.com';
const TEST_PRODUCT_TITLE = /(?:nice\s*payments?|nicepay).*\btest\b|테스트\s*상품/i;

function publicImageUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      url.hostname !== 'dummyimage.com'
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

export async function GET() {
  try {
    const rows = await getCachedStorefrontProductsStrict();
    const publishedRows = rows.filter(
      (row) => row.is_published === true && row.id && row.title?.trim(),
    );
    const rowsById = new Map(publishedRows.map((row) => [row.id, row]));
    const products = buildProductCatalog(publishedRows)
      .filter(
        (product) =>
          rowsById.has(product.id) &&
          product.id !== NICEPAY_TEST_PRODUCT_ID &&
          !TEST_PRODUCT_TITLE.test(product.name) &&
          !product.isSoldOut &&
          Number.isSafeInteger(product.price) &&
          product.price > 0,
      )
      .map((product) => ({
        id: product.id,
        title: product.name,
        price: product.price,
        currency: 'KRW',
        images: product.images
          .map(publicImageUrl)
          .filter((url): url is string => url !== null),
        // Catalog descriptions also merge raw/specs; only expose the public description.
        description: rowsById.get(product.id)?.description?.trim() || '',
        category: product.category,
        purchaseUrl: `${SOURCE_URL}/?product=${encodeURIComponent(product.id)}`,
      }));

    return Response.json(
      { products, updatedAt: new Date().toISOString(), sourceUrl: SOURCE_URL },
      { headers: { 'Cache-Control': 'public, max-age=0, s-maxage=300' } },
    );
  } catch {
    return Response.json(
      { error: 'STOREFRONT_UNAVAILABLE', message: '상품 정보를 불러오지 못했습니다.' },
      { status: 503, headers: { 'Cache-Control': 'no-store', 'Retry-After': '60' } },
    );
  }
}
