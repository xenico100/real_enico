import { revalidateTag } from 'next/cache';
import { isPrimaryAdmin } from '@/lib/security/identity';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { assertExpectedSupabaseProject } from '@/lib/supabase/projectGuard';
import { readJsonObject, RequestBodyError } from '@/lib/security/requestBody';
import { validateAdminDate, validateAdminId, validateAdminImages, validateAdminInteger, validateAdminPublished, validateAdminText } from '@/lib/security/adminInput';

export const runtime = 'nodejs';

const OPTIONAL_COLUMNS = new Set(['season', 'description', 'full_description', 'release_date', 'items', 'image', 'created_at', 'updated_at']);


type AdminAuthResult =
  | {
      ok: true;
      serviceClient: SupabaseClient;
    }
  | {
      ok: false;
      response: NextResponse;
    };

function getServerConfig() {
  const url = assertExpectedSupabaseProject(
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  );
  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !anonKey || !serviceRoleKey) {
    return null;
  }

  return { url, anonKey, serviceRoleKey };
}

function normalizeText(value: unknown) {
  if (typeof value !== 'string') return '';
  return value.trim();
}


function getErrorMessage(error: unknown, fallback: string) {
  if (error && typeof error === 'object') {
    const payload = error as Record<string, unknown>;
    const message =
      (typeof payload.message === 'string' && payload.message) ||
      (typeof payload.msg === 'string' && payload.msg) ||
      '';
    if (message) return message;
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}

function isCollectionsTableMissing(error: unknown) {
  const message = getErrorMessage(error, '').toLowerCase();
  return (
    message.includes('relation') &&
    message.includes('collections') &&
    message.includes('does not exist')
  );
}

function missingCollectionsTableMessage() {
  return [
    'collections 테이블이 없어 저장에 실패했습니다.',
    'Supabase SQL Editor에서 아래 SQL을 먼저 실행하세요:',
    "create table if not exists public.collections (",
    "  id uuid primary key default gen_random_uuid(),",
    "  title text,",
    "  season text,",
    "  description text,",
    "  full_description text,",
    "  release_date date,",
    "  items integer default 0,",
    "  image text,",
    "  images jsonb default '[]'::jsonb,",
    "  is_published boolean default true,",
    "  created_at timestamptz default now(),",
    "  updated_at timestamptz default now()",
    ");",
  ].join('\n');
}

function extractMissingCollectionColumn(error: unknown) {
  const message = getErrorMessage(error, '');
  if (!message) return null;

  const schemaCacheMatch = message.match(/'([^']+)' column/i);
  if (schemaCacheMatch?.[1]) return schemaCacheMatch[1];

  const collectionColumnMatch = message.match(/collections\.([a-zA-Z0-9_]+)/i);
  if (collectionColumnMatch?.[1]) return collectionColumnMatch[1];

  const genericColumnMatch = message.match(/column\s+\"?([a-zA-Z0-9_]+)\"?\s+does not exist/i);
  if (genericColumnMatch?.[1]) return genericColumnMatch[1];

  return null;
}

async function authenticateAdmin(request: Request): Promise<AdminAuthResult> {
  const config = getServerConfig();
  if (!config) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          message:
            'Supabase server config is missing. NEXT_PUBLIC_SUPABASE_URL(or SUPABASE_URL), NEXT_PUBLIC_SUPABASE_ANON_KEY(or SUPABASE_ANON_KEY), SUPABASE_SERVICE_ROLE_KEY를 확인하세요.',
        },
        { status: 500 },
      ),
    };
  }

  const authHeader = request.headers.get('authorization') || '';
  const token = authHeader.toLowerCase().startsWith('bearer ')
    ? authHeader.slice(7).trim()
    : '';
  if (!token) {
    return {
      ok: false,
      response: NextResponse.json({ message: 'Unauthorized.' }, { status: 401 }),
    };
  }

  const anonClient = createClient(config.url, config.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const {
    data: { user },
    error,
  } = await anonClient.auth.getUser(token);

  if (error || !user) {
    return {
      ok: false,
      response: NextResponse.json({ message: 'Unauthorized.' }, { status: 401 }),
    };
  }

  if (!isPrimaryAdmin(user)) {
    return {
      ok: false,
      response: NextResponse.json({ message: 'Forbidden.' }, { status: 403 }),
    };
  }

  const serviceClient = createClient(config.url, config.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return { ok: true, serviceClient };
}

function sanitizeCollectionPayload(input: Record<string, unknown>, includeCreatedAt = false) {
  const now = new Date().toISOString();
  const images = validateAdminImages(input.images);
  const fallbackImage = input.image ? validateAdminImages([input.image])[0] : null;
  const payload: Record<string, unknown> = {
    title: validateAdminText(input.title, '컬렉션명', 200, true),
    season: validateAdminText(input.season, '시즌', 100) || null,
    description: validateAdminText(input.description, '컬렉션 소개', 50000) || null,
    full_description: validateAdminText(input.full_description, '상세 설명', 50000) || null,
    release_date: validateAdminDate(input.release_date),
    items: validateAdminInteger(input.items ?? 0, '상품 수', 0),
    image: images[0] || fallbackImage,
    images,
    is_published: validateAdminPublished(input.is_published),
    updated_at: now,
  };
  if (includeCreatedAt) payload.created_at = now;
  return payload;
}

async function insertWithMissingColumnFallback(
  serviceClient: SupabaseClient,
  payload: Record<string, unknown>,
) {
  const workingPayload: Record<string, unknown> = { ...payload };
  const strippedColumns: string[] = [];
  let row: Record<string, unknown> | null = null;

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const { data, error } = await serviceClient
      .from('collections')
      .insert(workingPayload)
      .select('*')
      .maybeSingle();
    if (!error) {
      row = data;
      return { row, strippedColumns };
    }

    const missingColumn = extractMissingCollectionColumn(error);
    if (!missingColumn || !OPTIONAL_COLUMNS.has(missingColumn) || !(missingColumn in workingPayload)) {
      throw error;
    }

    delete workingPayload[missingColumn];
    if (!strippedColumns.includes(missingColumn)) {
      strippedColumns.push(missingColumn);
    }
  }

  return { row, strippedColumns };
}

async function updateWithMissingColumnFallback(
  serviceClient: SupabaseClient,
  id: string,
  payload: Record<string, unknown>,
) {
  const workingPayload: Record<string, unknown> = { ...payload };
  const strippedColumns: string[] = [];
  let row: Record<string, unknown> | null = null;

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const { data, error } = await serviceClient
      .from('collections')
      .update(workingPayload)
      .eq('id', id)
      .select('*')
      .maybeSingle();
    if (!error) {
      row = data;
      return { row, strippedColumns };
    }

    const missingColumn = extractMissingCollectionColumn(error);
    if (!missingColumn || !OPTIONAL_COLUMNS.has(missingColumn) || !(missingColumn in workingPayload)) {
      throw error;
    }

    delete workingPayload[missingColumn];
    if (!strippedColumns.includes(missingColumn)) {
      strippedColumns.push(missingColumn);
    }
  }

  return { row, strippedColumns };
}

export async function GET(request: Request) {
  const auth = await authenticateAdmin(request);
  if (!auth.ok) return auth.response;

  const requestUrl = new URL(request.url);
  const parsedLimit = Number.parseInt(requestUrl.searchParams.get('limit') || '200', 10);
  const limit = Number.isFinite(parsedLimit)
    ? Math.min(Math.max(parsedLimit, 1), 500)
    : 200;

  const { data, error } = await auth.serviceClient
    .from('collections')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    if (isCollectionsTableMissing(error)) {
      return NextResponse.json({ message: missingCollectionsTableMessage() }, { status: 500 });
    }
    return NextResponse.json(
      { message: `컬렉션 목록 조회 실패: ${error.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({ collections: data ?? [] });
}

export async function POST(request: Request) {
  const auth = await authenticateAdmin(request);
  if (!auth.ok) return auth.response;

  let payload = {} as Record<string, unknown>;
  try {
    payload = await readJsonObject(request, 128 * 1024);
  } catch (error) {
    return NextResponse.json({ message: '잘못된 요청 본문입니다.' }, { status: error instanceof RequestBodyError ? error.status : 400 });
  }

  const title = normalizeText(payload.title);
  if (!title) {
    return NextResponse.json({ message: 'title은 필수입니다.' }, { status: 400 });
  }

  try {
    const result = await insertWithMissingColumnFallback(
      auth.serviceClient,
      sanitizeCollectionPayload(payload, true),
    );
    if (!result.row) throw new RequestBodyError('컬렉션을 찾지 못했습니다. 새로고침 후 다시 확인해 주세요.', 404);
    revalidateTag('storefront-collections', { expire: 0 });
    return NextResponse.json({
      message:
        result.strippedColumns.length > 0
          ? `컬렉션 게시물 등록 완료 (누락 컬럼 제외: ${result.strippedColumns.join(', ')})`
          : '컬렉션 게시물 등록 완료',
      collection: result.row,
      strippedColumns: result.strippedColumns,
    });
  } catch (error) {
    if (isCollectionsTableMissing(error)) {
      return NextResponse.json({ message: missingCollectionsTableMessage() }, { status: 500 });
    }
    return NextResponse.json(
      { message: getErrorMessage(error, '컬렉션 저장 실패') },
      { status: error instanceof RequestBodyError ? error.status : 500 },
    );
  }
}

export async function PATCH(request: Request) {
  const auth = await authenticateAdmin(request);
  if (!auth.ok) return auth.response;

  let payload = {} as Record<string, unknown>;
  try {
    payload = await readJsonObject(request, 128 * 1024);
  } catch (error) {
    return NextResponse.json({ message: '잘못된 요청 본문입니다.' }, { status: error instanceof RequestBodyError ? error.status : 400 });
  }

  let id: string;
  try { id = validateAdminId(payload.id); } catch (error) {
    return NextResponse.json({ message: getErrorMessage(error, '대상 ID를 확인해 주세요.') }, { status: 400 });
  }

  const title = normalizeText(payload.title);
  if (!title) {
    return NextResponse.json({ message: 'title은 필수입니다.' }, { status: 400 });
  }

  try {
    const result = await updateWithMissingColumnFallback(
      auth.serviceClient,
      id,
      sanitizeCollectionPayload(payload, false),
    );
    if (!result.row) throw new RequestBodyError('컬렉션을 찾지 못했습니다. 새로고침 후 다시 확인해 주세요.', 404);
    revalidateTag('storefront-collections', { expire: 0 });
    return NextResponse.json({
      message:
        result.strippedColumns.length > 0
          ? `컬렉션 게시물 수정 완료 (누락 컬럼 제외: ${result.strippedColumns.join(', ')})`
          : '컬렉션 게시물 수정 완료',
      collection: result.row,
      strippedColumns: result.strippedColumns,
    });
  } catch (error) {
    if (isCollectionsTableMissing(error)) {
      return NextResponse.json({ message: missingCollectionsTableMessage() }, { status: 500 });
    }
    return NextResponse.json(
      { message: getErrorMessage(error, '컬렉션 저장 실패') },
      { status: error instanceof RequestBodyError ? error.status : 500 },
    );
  }
}

export async function DELETE(request: Request) {
  const auth = await authenticateAdmin(request);
  if (!auth.ok) return auth.response;

  let payload = {} as Record<string, unknown>;
  try {
    payload = await readJsonObject(request, 128 * 1024);
  } catch (error) {
    return NextResponse.json({ message: '잘못된 요청 본문입니다.' }, { status: error instanceof RequestBodyError ? error.status : 400 });
  }

  let id: string;
  try { id = validateAdminId(payload.id); } catch (error) {
    return NextResponse.json({ message: getErrorMessage(error, '대상 ID를 확인해 주세요.') }, { status: 400 });
  }

  const { error } = await auth.serviceClient.from('collections').delete().eq('id', id);
  if (error) {
    if (isCollectionsTableMissing(error)) {
      return NextResponse.json({ message: missingCollectionsTableMessage() }, { status: 500 });
    }
    return NextResponse.json(
      { message: `컬렉션 삭제 실패: ${error.message}` },
      { status: 500 },
    );
  }

  revalidateTag('storefront-collections', { expire: 0 });
  return NextResponse.json({ message: '컬렉션 삭제 완료' });
}
