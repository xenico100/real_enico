import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { uploadToR2 } from '@/lib/r2Storage';

export const runtime = 'nodejs';

const PRIMARY_ADMIN_EMAIL = 'morba9850@gmail.com';
const SUPABASE_STORAGE_MARKERS = ['supabase.co/storage/v1/object/public', 'supabase.in/storage/v1/object/public'];

type ProductRow = { id: string; images: unknown; thumbnail_url: string | null };
type CollectionRow = { id: string; image: string | null; images: unknown };

function getServerConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !anonKey || !serviceRoleKey) return null;
  return { url, anonKey, serviceRoleKey };
}

function normalizeImages(value: unknown) {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
  }

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
      }
    } catch {
      if (value.trim()) return [value.trim()];
    }
  }

  return [];
}

function isSupabaseStorageUrl(url: string) {
  return SUPABASE_STORAGE_MARKERS.some((marker) => url.includes(marker));
}

async function authenticateAdmin(request: Request) {
  const config = getServerConfig();
  if (!config) {
    return { error: NextResponse.json({ message: 'Supabase server config is missing.' }, { status: 500 }) };
  }

  const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) {
    return { error: NextResponse.json({ message: 'Unauthorized.' }, { status: 401 }) };
  }

  const anonClient = createClient(config.url, config.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const {
    data: { user },
    error,
  } = await anonClient.auth.getUser(token);

  if (error || !user) {
    return { error: NextResponse.json({ message: 'Unauthorized.' }, { status: 401 }) };
  }

  if ((user.email || '').trim().toLowerCase() !== PRIMARY_ADMIN_EMAIL) {
    return { error: NextResponse.json({ message: 'Forbidden.' }, { status: 403 }) };
  }

  const serviceClient = createClient(config.url, config.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return { serviceClient };
}

async function migrateUrl(url: string, objectPrefix: string) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`이미지 다운로드 실패(${response.status})`);
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  const contentType = response.headers.get('content-type') || 'application/octet-stream';
  const parsed = new URL(url);
  const fileName = parsed.pathname.split('/').pop() || `${crypto.randomUUID()}.jpg`;
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '-');
  const objectKey = `${objectPrefix}/${Date.now()}-${crypto.randomUUID()}-${safeName}`;

  return uploadToR2({ objectKey, body: bytes, contentType });
}

export async function POST(request: Request) {
  const auth = await authenticateAdmin(request);
  if ('error' in auth) return auth.error;

  const pageSize = 500;

  const stats = {
    productsScanned: 0,
    productsUpdated: 0,
    collectionsScanned: 0,
    collectionsUpdated: 0,
    migratedImages: 0,
    failedImages: 0,
    failures: [] as string[],
  };

  let lastProductId: string | null = null;
  while (true) {
    let productQuery = auth.serviceClient
      .from('products')
      .select('id, images, thumbnail_url')
      .order('id', { ascending: true })
      .limit(pageSize);

    if (lastProductId) {
      productQuery = productQuery.gt('id', lastProductId);
    }

    const productRows = await productQuery;

    if (productRows.error) {
      return NextResponse.json({ message: `products 조회 실패: ${productRows.error.message}` }, { status: 500 });
    }

    const rows = (productRows.data || []) as ProductRow[];
    if (rows.length === 0) break;

    for (const row of rows) {
      stats.productsScanned += 1;
      const images = normalizeImages(row.images);
      let changed = false;
      const nextImages: string[] = [];
      const migratedByUrl = new Map<string, string>();

      for (const imageUrl of images) {
        if (!isSupabaseStorageUrl(imageUrl)) {
          nextImages.push(imageUrl);
          continue;
        }

        try {
          const migrated = await migrateUrl(imageUrl, 'products');
          nextImages.push(migrated);
          migratedByUrl.set(imageUrl, migrated);
          stats.migratedImages += 1;
          changed = true;
        } catch (error) {
          nextImages.push(imageUrl);
          stats.failedImages += 1;
          stats.failures.push(`products/${row.id}: ${error instanceof Error ? error.message : 'unknown error'}`);
        }
      }

      const originalThumbnail = typeof row.thumbnail_url === 'string' ? row.thumbnail_url.trim() : '';
      let nextThumbnail: string | null = originalThumbnail || null;

      if (originalThumbnail && isSupabaseStorageUrl(originalThumbnail)) {
        const alreadyMigrated = migratedByUrl.get(originalThumbnail);
        if (alreadyMigrated) {
          nextThumbnail = alreadyMigrated;
          changed = true;
        } else {
          try {
            nextThumbnail = await migrateUrl(originalThumbnail, 'products');
            stats.migratedImages += 1;
            changed = true;
          } catch (error) {
            nextThumbnail = originalThumbnail;
            stats.failedImages += 1;
            stats.failures.push(`products/${row.id}: ${error instanceof Error ? error.message : 'unknown error'}`);
          }
        }
      }

      if (!changed) continue;

      const update = await auth.serviceClient
        .from('products')
        .update({ images: nextImages, thumbnail_url: nextThumbnail, updated_at: new Date().toISOString() })
        .eq('id', row.id);

      if (update.error) {
        stats.failures.push(`products/${row.id}: update failed (${update.error.message})`);
      } else {
        stats.productsUpdated += 1;
      }
    }

    if (rows.length < pageSize) break;
    lastProductId = rows[rows.length - 1].id;
  }

  let lastCollectionId: string | null = null;
  while (true) {
    let collectionQuery = auth.serviceClient
      .from('collections')
      .select('id, image, images')
      .order('id', { ascending: true })
      .limit(pageSize);

    if (lastCollectionId) {
      collectionQuery = collectionQuery.gt('id', lastCollectionId);
    }

    const collectionRows = await collectionQuery;

    if (collectionRows.error) {
      return NextResponse.json(
        {
          message: `collections 조회 실패: ${collectionRows.error.message}`,
          ...stats,
        },
        { status: 500 },
      );
    }

    const rows = (collectionRows.data || []) as CollectionRow[];
    if (rows.length === 0) break;

    for (const row of rows) {
      stats.collectionsScanned += 1;

      const originalImages = normalizeImages(row.images);
      const nextImages: string[] = [];
      const migratedByUrl = new Map<string, string>();
      let changed = false;

      for (const imageUrl of originalImages) {
        if (!isSupabaseStorageUrl(imageUrl)) {
          nextImages.push(imageUrl);
          continue;
        }

        try {
          const migrated = await migrateUrl(imageUrl, 'collections');
          nextImages.push(migrated);
          migratedByUrl.set(imageUrl, migrated);
          stats.migratedImages += 1;
          changed = true;
        } catch (error) {
          nextImages.push(imageUrl);
          stats.failedImages += 1;
          stats.failures.push(`collections/${row.id}: ${error instanceof Error ? error.message : 'unknown error'}`);
        }
      }

      const originalImage = typeof row.image === 'string' ? row.image.trim() : '';
      let nextImage: string | null = originalImage || null;

      if (originalImage && isSupabaseStorageUrl(originalImage)) {
        const alreadyMigrated = migratedByUrl.get(originalImage);
        if (alreadyMigrated) {
          nextImage = alreadyMigrated;
          changed = true;
        } else {
          try {
            nextImage = await migrateUrl(originalImage, 'collections');
            stats.migratedImages += 1;
            changed = true;
          } catch (error) {
            nextImage = originalImage;
            stats.failedImages += 1;
            stats.failures.push(`collections/${row.id}: ${error instanceof Error ? error.message : 'unknown error'}`);
          }
        }
      }

      if (!changed) continue;

      const update = await auth.serviceClient
        .from('collections')
        .update({
          image: nextImage,
          images: nextImages,
          updated_at: new Date().toISOString(),
        })
        .eq('id', row.id);

      if (update.error) {
        stats.failures.push(`collections/${row.id}: update failed (${update.error.message})`);
      } else {
        stats.collectionsUpdated += 1;
      }
    }

    if (rows.length < pageSize) break;
    lastCollectionId = rows[rows.length - 1].id;
  }

  return NextResponse.json({ ok: true, ...stats });
}
