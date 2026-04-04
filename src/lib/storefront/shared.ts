export type StorefrontProductRow = {
  id: string;
  title?: string | null;
  category?: string | null;
  description?: string | null;
  specs?: string | null;
  price?: number | string | null;
  thumbnail_url?: string | null;
  images?: unknown;
  detail_html?: string | null;
  raw?: unknown;
  is_published?: boolean | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type StorefrontCollectionRow = {
  id: string;
  title: string | null;
  season: string | null;
  description: string | null;
  full_description: string | null;
  release_date: string | null;
  items: number | string | null;
  image: string | null;
  images: unknown;
  is_published?: boolean | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export const STOREFRONT_PRODUCT_FIELDS = [
  'id',
  'title',
  'category',
  'description',
  'specs',
  'price',
  'thumbnail_url',
  'images',
  'detail_html',
  'raw',
  'is_published',
  'created_at',
  'updated_at',
] as const;

export const STOREFRONT_COLLECTION_FIELDS = [
  'id',
  'title',
  'season',
  'description',
  'full_description',
  'release_date',
  'items',
  'image',
  'images',
  'is_published',
  'created_at',
  'updated_at',
] as const;

export const STOREFRONT_PRODUCT_SELECT = STOREFRONT_PRODUCT_FIELDS.join(', ');

export const STOREFRONT_COLLECTION_SELECT = STOREFRONT_COLLECTION_FIELDS.join(', ');

export function buildStorefrontSelect(fields: readonly string[]) {
  return fields.join(', ');
}

export function extractMissingStorefrontColumn(error: unknown) {
  const message =
    error && typeof error === 'object' && 'message' in error && typeof error.message === 'string'
      ? error.message
      : error instanceof Error
        ? error.message
        : '';

  if (!message) return null;

  const schemaCacheMatch = message.match(/'([^']+)' column/i);
  if (schemaCacheMatch?.[1]) return schemaCacheMatch[1];

  const tableColumnMatch = message.match(/\b(?:products|collections)\.([a-zA-Z0-9_]+)/i);
  if (tableColumnMatch?.[1]) return tableColumnMatch[1];

  const genericColumnMatch = message.match(/column\s+\"?([a-zA-Z0-9_]+)\"?\s+does not exist/i);
  if (genericColumnMatch?.[1]) return genericColumnMatch[1];

  return null;
}
