import App from './App';
import {
  getCachedStorefrontCollections,
  getCachedStorefrontProducts,
} from '@/lib/storefront/server';
import { resolveInitialCollectionCatalog } from '@/lib/storefront/collectionCatalog';
import { resolveInitialProductCatalog } from '@/lib/storefront/productCatalog';

export default async function Home() {
  const [initialProductRows, initialCollectionRows] = await Promise.all([
    getCachedStorefrontProducts(),
    getCachedStorefrontCollections(),
  ]);
  const productCatalog = resolveInitialProductCatalog(initialProductRows);
  const collectionCatalog = resolveInitialCollectionCatalog(initialCollectionRows);

  return (
    <App
      initialProducts={productCatalog.products}
      usingFallbackProducts={productCatalog.usingFallbackCatalog}
      initialCollections={collectionCatalog.collections}
      usingFallbackCollections={collectionCatalog.usingFallbackCatalog}
    />
  );
}
