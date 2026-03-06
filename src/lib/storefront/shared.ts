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

export const STOREFRONT_PRODUCT_SELECT =
  'id, title, category, description, specs, price, thumbnail_url, images, detail_html, raw, is_published, created_at, updated_at';

export const STOREFRONT_COLLECTION_SELECT =
  'id, title, season, description, full_description, release_date, items, image, images, is_published, created_at, updated_at';
