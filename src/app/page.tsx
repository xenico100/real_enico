import type { Metadata } from 'next';
import App from './App';
import {
  getCachedStorefrontCollections,
  getCachedStorefrontProducts,
} from '@/lib/storefront/server';
import { resolveInitialCollectionCatalog } from '@/lib/storefront/collectionCatalog';
import { resolveInitialProductCatalog } from '@/lib/storefront/productCatalog';

export const metadata: Metadata = {
  alternates: {
    canonical: '/',
  },
};

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
      />
    </>
  );
}
