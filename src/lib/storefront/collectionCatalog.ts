import type { StorefrontCollectionRow } from '@/lib/storefront/shared';

export interface Collection {
  id: string;
  title: string;
  season: string;
  description: string;
  image: string;
  images: string[];
  items: number;
  releaseDate: string;
  fullDescription: string;
  createdAt?: string;
}

function normalizeCollectionImages(value: unknown, primaryImage?: string | null) {
  const parsed: string[] = [];

  if (Array.isArray(value)) {
    parsed.push(
      ...value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0),
    );
  } else if (typeof value === 'string') {
    try {
      const json = JSON.parse(value);
      if (Array.isArray(json)) {
        parsed.push(
          ...json.filter((item): item is string => typeof item === 'string' && item.trim().length > 0),
        );
      }
    } catch {
      if (value.trim()) parsed.push(value);
    }
  }

  if (primaryImage?.trim()) {
    parsed.unshift(primaryImage);
  }

  return Array.from(new Set(parsed.map((item) => item.trim()).filter(Boolean)));
}

function mapCollectionRow(row: StorefrontCollectionRow): Collection {
  const images = normalizeCollectionImages(row.images, row.image);
  const numericItems = Number(row.items);

  return {
    id: row.id,
    title: row.title?.trim() || '제목 없음',
    season: row.season?.trim() || '',
    description: row.description?.trim() || '',
    image: images[0] || '',
    images,
    items: Number.isFinite(numericItems) ? numericItems : 0,
    releaseDate: row.release_date?.trim() || '',
    fullDescription: row.full_description?.trim() || row.description?.trim() || '',
    createdAt: row.created_at?.trim() || '',
  };
}

export function buildCollectionCatalog(rows: StorefrontCollectionRow[]) {
  const collections = rows.map(mapCollectionRow);
  return [...collections].sort((a, b) => {
    const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return timeB - timeA;
  });
}

export function resolveInitialCollectionCatalog(rows: StorefrontCollectionRow[]) {
  const collections = buildCollectionCatalog(rows);

  return {
    collections,
    usingFallbackCatalog: collections.length === 0,
  };
}
