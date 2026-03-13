import App from './App';
import {
  getCachedStorefrontCollections,
  getCachedStorefrontProducts,
} from '@/lib/storefront/server';
import { resolveInitialCollectionCatalog } from '@/lib/storefront/collectionCatalog';
import { resolveInitialProductCatalog } from '@/lib/storefront/productCatalog';

type HomePageProps = {
  searchParams: Promise<{
    popup?: string;
    tab?: string;
  }>;
};

export default async function Home({ searchParams }: HomePageProps) {
  const params = await searchParams;
  const [initialProductRows, initialCollectionRows] = await Promise.all([
    getCachedStorefrontProducts(),
    getCachedStorefrontCollections(),
  ]);
  const productCatalog = resolveInitialProductCatalog(initialProductRows);
  const collectionCatalog = resolveInitialCollectionCatalog(initialCollectionRows);
  const initialPopup =
    params.popup === 'about' || params.popup === 'contact' || params.popup === 'mypage'
      ? params.popup
      : null;
  const initialMyPageTab =
    params.tab === 'overview' ||
    params.tab === 'orders' ||
    params.tab === 'saved' ||
    params.tab === 'cart' ||
    params.tab === 'profile' ||
    params.tab === 'dailyStats' ||
    params.tab === 'members' ||
    params.tab === 'adminOrders'
      ? params.tab
      : undefined;

  return (
    <App
      initialProducts={productCatalog.products}
      usingFallbackProducts={productCatalog.usingFallbackCatalog}
      initialCollections={collectionCatalog.collections}
      usingFallbackCollections={collectionCatalog.usingFallbackCatalog}
      initialPopup={initialPopup}
      initialMyPageTab={initialMyPageTab}
    />
  );
}
