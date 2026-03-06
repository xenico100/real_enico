import App from './App';
import {
  getCachedStorefrontCollections,
  getCachedStorefrontProducts,
} from '@/lib/storefront/server';

export default async function Home() {
  const [initialProductRows, initialCollectionRows] = await Promise.all([
    getCachedStorefrontProducts(),
    getCachedStorefrontCollections(),
  ]);

  return (
    <App
      initialProductRows={initialProductRows}
      initialCollectionRows={initialCollectionRows}
    />
  );
}
