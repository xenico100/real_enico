import type { Metadata } from 'next';
import App from './App';
import {
  getCachedStorefrontCollections,
  getCachedStorefrontProducts,
} from '@/lib/storefront/server';
import { resolveInitialCollectionCatalog } from '@/lib/storefront/collectionCatalog';
import {
  NICEPAY_TEST_PRODUCT_ID,
  resolveInitialProductCatalog,
} from '@/lib/storefront/productCatalog';
import {
  isSoldOutDisplayProductId,
  isStorefrontProductVisible,
} from '@/lib/storefront/productDisplay';

export const metadata: Metadata = {
  alternates: {
    canonical: '/',
  },
};

type HomePageProps = {
  searchParams: Promise<{
    popup?: string;
    tab?: string;
    product?: string | string[];
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
  const visibleProductIds = new Set(
    initialProductRows.filter(isStorefrontProductVisible).map((row) => row.id),
  );
  const initialProductId =
    !initialPopup && typeof params.product === 'string' && !productCatalog.usingFallbackCatalog
      ? productCatalog.products.find(
          (product) =>
            product.id === params.product &&
            visibleProductIds.has(product.id) &&
            product.id !== NICEPAY_TEST_PRODUCT_ID &&
            (!product.isSoldOut || isSoldOutDisplayProductId(product.id)) &&
            Number.isSafeInteger(product.price) &&
            product.price > 0,
        )?.id
      : undefined;
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

  const websiteStructuredData = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': 'https://enicoveck.com/#website',
    url: 'https://enicoveck.com/',
    name: '에니코 벡',
    alternateName: ['에니코벡', 'ENICO VECK', 'enicoveck'],
    inLanguage: 'ko-KR',
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteStructuredData) }}
      />
      <App
        initialProducts={productCatalog.products}
        usingFallbackProducts={productCatalog.usingFallbackCatalog}
        initialCollections={collectionCatalog.collections}
        usingFallbackCollections={collectionCatalog.usingFallbackCatalog}
        initialPopup={initialPopup}
        initialMyPageTab={initialMyPageTab}
        initialProductId={initialProductId}
      />
    </>
  );
}
