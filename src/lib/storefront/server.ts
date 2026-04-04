import 'server-only';

import { createClient } from '@supabase/supabase-js';
import { unstable_cache } from 'next/cache';
import {
  buildStorefrontSelect,
  extractMissingStorefrontColumn,
  STOREFRONT_COLLECTION_FIELDS,
  STOREFRONT_PRODUCT_FIELDS,
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

function getStorefrontErrorMessage(error: unknown) {
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return '';
}

async function fetchRowsWithSchemaFallback<Row extends StorefrontProductRow | StorefrontCollectionRow>({
  client,
  table,
  baseFields,
}: {
  client: NonNullable<ReturnType<typeof getStorefrontServerClient>>;
  table: 'products' | 'collections';
  baseFields: readonly string[];
}) {
  let fields: string[] = [...baseFields];
  let orderColumn: 'created_at' | 'updated_at' | null = 'created_at';
  let usePublishedFilter = true;

  for (let attempt = 0; attempt < baseFields.length + 5; attempt += 1) {
    let query = client.from(table).select(buildStorefrontSelect(fields));

    if (usePublishedFilter) {
      query = query.eq('is_published', true);
    }

    if (orderColumn) {
      query = query.order(orderColumn, { ascending: false });
    }

    const { data, error } = await query.returns<Row[]>();

    if (!error) {
      return (data || []) as Row[];
    }

    const message = getStorefrontErrorMessage(error).toLowerCase();
    const missingColumn = extractMissingStorefrontColumn(error);

    if (usePublishedFilter && message.includes('is_published')) {
      usePublishedFilter = false;
      continue;
    }

    if (orderColumn && message.includes(orderColumn)) {
      orderColumn = orderColumn === 'created_at' ? 'updated_at' : null;
      continue;
    }

    if (missingColumn && fields.includes(missingColumn)) {
      fields = fields.filter((field) => field !== missingColumn);
      continue;
    }

    return [] as Row[];
  }

  return [] as Row[];
}

async function fetchProductsUncached() {
  const client = getStorefrontServerClient();
  if (!client) {
    return [] as StorefrontProductRow[];
  }

  return fetchRowsWithSchemaFallback<StorefrontProductRow>({
    client,
    table: 'products',
    baseFields: STOREFRONT_PRODUCT_FIELDS,
  });
}

async function fetchCollectionsUncached() {
  const client = getStorefrontServerClient();
  if (!client) {
    return [] as StorefrontCollectionRow[];
  }

  return fetchRowsWithSchemaFallback<StorefrontCollectionRow>({
    client,
    table: 'collections',
    baseFields: STOREFRONT_COLLECTION_FIELDS,
  });
}

export const getCachedStorefrontProducts = unstable_cache(fetchProductsUncached, ['storefront-products'], {
  revalidate: 300,
  tags: ['storefront-products'],
});

export const getCachedStorefrontCollections = unstable_cache(
  fetchCollectionsUncached,
  ['storefront-collections'],
  {
    revalidate: 300,
    tags: ['storefront-collections'],
  },
);
