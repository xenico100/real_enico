import 'server-only';

import { createClient } from '@supabase/supabase-js';
import { unstable_cache } from 'next/cache';
import {
  STOREFRONT_COLLECTION_SELECT,
  STOREFRONT_PRODUCT_SELECT,
  type StorefrontCollectionRow,
  type StorefrontProductRow,
} from '@/lib/storefront/shared';

function getStorefrontServerConfig() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    return null;
  }

  return { url, key };
}

function getStorefrontServerClient() {
  const config = getStorefrontServerConfig();
  if (!config) {
    return null;
  }

  return createClient(config.url, config.key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

async function fetchProductsUncached() {
  const client = getStorefrontServerClient();
  if (!client) {
    return [] as StorefrontProductRow[];
  }

  const query = client
    .from('products')
    .select(STOREFRONT_PRODUCT_SELECT)
    .eq('is_published', true)
    .order('updated_at', { ascending: false });

  let { data, error } = await query.returns<StorefrontProductRow[]>();

  if (error?.message?.toLowerCase().includes('updated_at')) {
    const fallback = await client
      .from('products')
      .select(STOREFRONT_PRODUCT_SELECT)
      .eq('is_published', true)
      .order('created_at', { ascending: false })
      .returns<StorefrontProductRow[]>();
    data = fallback.data;
    error = fallback.error;
  }

  if (error?.message?.toLowerCase().includes('is_published')) {
    const fallback = await client
      .from('products')
      .select(STOREFRONT_PRODUCT_SELECT)
      .order('updated_at', { ascending: false })
      .returns<StorefrontProductRow[]>();
    data = fallback.data;
    error = fallback.error;

    if (error?.message?.toLowerCase().includes('updated_at')) {
      const createdAtFallback = await client
        .from('products')
        .select(STOREFRONT_PRODUCT_SELECT)
        .order('created_at', { ascending: false })
        .returns<StorefrontProductRow[]>();
      data = createdAtFallback.data;
      error = createdAtFallback.error;
    }
  }

  if (error) {
    return [] as StorefrontProductRow[];
  }

  return (data || []) as StorefrontProductRow[];
}

async function fetchCollectionsUncached() {
  const client = getStorefrontServerClient();
  if (!client) {
    return [] as StorefrontCollectionRow[];
  }

  let { data, error } = await client
    .from('collections')
    .select(STOREFRONT_COLLECTION_SELECT)
    .eq('is_published', true)
    .order('created_at', { ascending: false })
    .returns<StorefrontCollectionRow[]>();

  if (error?.message?.toLowerCase().includes('is_published')) {
    const fallback = await client
      .from('collections')
      .select(STOREFRONT_COLLECTION_SELECT)
      .order('created_at', { ascending: false })
      .returns<StorefrontCollectionRow[]>();
    data = fallback.data;
    error = fallback.error;
  }

  if (error) {
    return [] as StorefrontCollectionRow[];
  }

  return (data || []) as StorefrontCollectionRow[];
}

export const getCachedStorefrontProducts = unstable_cache(fetchProductsUncached, ['storefront-products'], {
  revalidate: 300,
});

export const getCachedStorefrontCollections = unstable_cache(
  fetchCollectionsUncached,
  ['storefront-collections'],
  {
    revalidate: 300,
  },
);
