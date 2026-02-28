import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const PRIMARY_ADMIN_EMAIL = 'morba9850@gmail.com';

type AdminAuthResult =
  | {
      ok: true;
      serviceClient: any;
    }
  | {
      ok: false;
      response: NextResponse;
    };

function getServerConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
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
        { message: 'Supabase server config is missing.' },
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

  const normalizedEmail = normalizeText(user.email || '').toLowerCase();
  if (normalizedEmail !== PRIMARY_ADMIN_EMAIL) {
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
  const images =
    Array.isArray(input.images) &&
    input.images.every((item) => typeof item === 'string')
      ? (input.images as string[]).map((item) => item.trim()).filter(Boolean)
      : [];
  const parsedItems =
    typeof input.items === 'number'
      ? input.items
      : typeof input.items === 'string' && input.items.trim()
        ? Number.parseInt(input.items, 10)
        : 0;

  const payload: Record<string, unknown> = {
    title: normalizeText(input.title) || null,
    season: normalizeText(input.season) || null,
    description: normalizeText(input.description) || null,
    full_description: normalizeText(input.full_description) || null,
    release_date: normalizeText(input.release_date) || null,
    items: Number.isFinite(parsedItems) ? parsedItems : 0,
    image: images[0] || normalizeText(input.image) || null,
    images,
    is_published: Boolean(input.is_published),
    updated_at: now,
  };

  if (includeCreatedAt) {
    payload.created_at = now;
  }

  return payload;
}

async function insertWithMissingColumnFallback(
  serviceClient: any,
  payload: Record<string, unknown>,
) {
  let workingPayload: Record<string, unknown> = { ...payload };
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
    if (!missingColumn || !(missingColumn in workingPayload)) {
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
  serviceClient: any,
  id: string,
  payload: Record<string, unknown>,
) {
  let workingPayload: Record<string, unknown> = { ...payload };
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
    if (!missingColumn || !(missingColumn in workingPayload)) {
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
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ message: '잘못된 요청 본문입니다.' }, { status: 400 });
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
    return NextResponse.json({
      message:
        result.strippedColumns.length > 0
          ? `컬렉션 게시물 등록 완료 (누락 컬럼 제외: ${result.strippedColumns.join(', ')})`
          : '컬렉션 게시물 등록 완료',
      collection: result.row,
      strippedColumns: result.strippedColumns,
    });
  } catch (error) {
    return NextResponse.json(
      { message: getErrorMessage(error, '컬렉션 저장 실패') },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  const auth = await authenticateAdmin(request);
  if (!auth.ok) return auth.response;

  let payload = {} as Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ message: '잘못된 요청 본문입니다.' }, { status: 400 });
  }

  const id = normalizeText(payload.id);
  if (!id) {
    return NextResponse.json({ message: '수정 대상 id가 필요합니다.' }, { status: 400 });
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
    return NextResponse.json({
      message:
        result.strippedColumns.length > 0
          ? `컬렉션 게시물 수정 완료 (누락 컬럼 제외: ${result.strippedColumns.join(', ')})`
          : '컬렉션 게시물 수정 완료',
      collection: result.row,
      strippedColumns: result.strippedColumns,
    });
  } catch (error) {
    return NextResponse.json(
      { message: getErrorMessage(error, '컬렉션 저장 실패') },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  const auth = await authenticateAdmin(request);
  if (!auth.ok) return auth.response;

  let payload = {} as Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ message: '잘못된 요청 본문입니다.' }, { status: 400 });
  }

  const id = normalizeText(payload.id);
  if (!id) {
    return NextResponse.json({ message: '삭제 대상 id가 필요합니다.' }, { status: 400 });
  }

  const { error } = await auth.serviceClient.from('collections').delete().eq('id', id);
  if (error) {
    return NextResponse.json(
      { message: `컬렉션 삭제 실패: ${error.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({ message: '컬렉션 삭제 완료' });
}
