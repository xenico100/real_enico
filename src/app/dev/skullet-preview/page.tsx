import { notFound } from 'next/navigation';
import {
  getCachedStorefrontCollections,
  getCachedStorefrontProducts,
} from '@/lib/storefront/server';
import { resolveInitialCollectionCatalog } from '@/lib/storefront/collectionCatalog';
import { resolveInitialProductCatalog } from '@/lib/storefront/productCatalog';
import {
  STOREFRONT_COLLECTION_SAMPLES,
  STOREFRONT_PRODUCT_SAMPLES,
} from '@/lib/storefront/skulletSamples';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'ENICO VECK Skullet Storefront Preview',
  robots: { index: false, follow: false },
};

export default async function StorefrontSkulletPreviewPage() {
  if (process.env.NODE_ENV !== 'development') notFound();

  const [productRows, collectionRows] = await Promise.all([
    getCachedStorefrontProducts().catch(() => []),
    getCachedStorefrontCollections().catch(() => []),
  ]);
  const productCatalog = resolveInitialProductCatalog(productRows);
  const collectionCatalog = resolveInitialCollectionCatalog(collectionRows);
  const products =
    productCatalog.products.length > 0 ? productCatalog.products : STOREFRONT_PRODUCT_SAMPLES;
  const collections =
    collectionCatalog.collections.length > 0
      ? collectionCatalog.collections
      : STOREFRONT_COLLECTION_SAMPLES;

  const { StorefrontSkulletPreview } = await import('./StorefrontSkulletPreview');
  return <StorefrontSkulletPreview products={products} collections={collections} />;
}
