import { getStorefrontCatalogRows } from '@/lib/storefront/server';
import { buildPublicStorefrontCatalog } from '@/lib/storefront/publicCatalog';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';
const CACHE_HEADERS = { 'Cache-Control': 'no-store, max-age=0' };

export async function GET() {
  try {
    const { productRows, collectionRows } = await getStorefrontCatalogRows();
    const catalog = buildPublicStorefrontCatalog(productRows, collectionRows);
    return Response.json(
      { ...catalog, updatedAt: new Date().toISOString() },
      { headers: CACHE_HEADERS },
    );
  } catch {
    return Response.json(
      { error: 'STOREFRONT_UNAVAILABLE', message: '최신 상품 정보를 불러오지 못했습니다.' },
      { status: 503, headers: { ...CACHE_HEADERS, 'Retry-After': '10' } },
    );
  }
}
