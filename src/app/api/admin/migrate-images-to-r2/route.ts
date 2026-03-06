import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { uploadToR2 } from '@/lib/r2Storage';

export const runtime = 'nodejs';

const PRIMARY_ADMIN_EMAIL = 'morba9850@gmail.com';
const SUPABASE_STORAGE_MARKERS = ['supabase.co/storage/v1/object/public', 'supabase.in/storage/v1/object/public'];

type ProductRow = { id: string; images: unknown };
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


      if (update.error) {
        stats.failures.push(`products/${row.id}: update failed (${update.error.message})`);
      } else {
        stats.productsUpdated += 1;
      }
    }

    if (rows.length < pageSize) break;

      }


  }

  return NextResponse.json({ ok: true, ...stats });
}
