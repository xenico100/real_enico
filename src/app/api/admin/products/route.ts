import { isPrimaryAdmin } from '@/lib/security/identity';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { revalidateTag } from 'next/cache';
import { NextResponse } from 'next/server';
import { assertExpectedSupabaseProject } from '@/lib/supabase/projectGuard';
import { readJsonObject, RequestBodyError } from '@/lib/security/requestBody';
import { validateAdminId, validateAdminImages, validateAdminInteger, validateAdminPublished, validateAdminText } from '@/lib/security/adminInput';

export const runtime = 'nodejs';

const OPTIONAL_COLUMNS = new Set(['category', 'description', 'specs', 'thumbnail_url', 'created_at', 'updated_at']);


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

function isProductsTableMissing(error: unknown) {
  const message = getErrorMessage(error, '').toLowerCase();
  return (
    message.includes('relation') &&
    message.includes('products') &&
    message.includes('does not exist')
  );
}

function missingProductsTableMessage() {
  return [
    'products 테이블이 없어 저장에 실패했습니다.',
    'Supabase SQL Editor에서 아래 SQL을 먼저 실행하세요:',
    'create extension if not exists pgcrypto;',
    'create table if not exists public.products (',
    "  id uuid primary key default gen_random_uuid(),",
    '  title text,',
    '  category text,',
    '  description text,',
    '  specs text,',
    '  price integer,',
    "  currency text default 'KRW',",
    "  images jsonb default '[]'::jsonb,",
    '  thumbnail_url text,',
    "  raw jsonb default '{}'::jsonb,",
    '  is_published boolean default true,',
    '  created_at timestamptz default now(),',
    '  updated_at timestamptz default now()',
    ');',
  ].join('\n');
}

function extractMissingProductColumn(error: unknown) {
  const message = getErrorMessage(error, '');
  if (!message) return null;

  const schemaCacheMatch = message.match(/'([^']+)' column/i);
  if (schemaCacheMatch?.[1]) return schemaCacheMatch[1];

  const productsColumnMatch = message.match(/products\.([a-zA-Z0-9_]+)/i);
  if (productsColumnMatch?.[1]) return productsColumnMatch[1];

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

  const serviceClient = createClient(config.url, config.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  if (!isPrimaryAdmin(user)) {
    return {
      ok: false,
      response: NextResponse.json({ message: 'Forbidden.' }, { status: 403 }),
    };
  }

  return { ok: true, serviceClient };
}

function sanitizeProductPayload(input: Record<string, unknown>, includeCreatedAt = false) {
  const now = new Date().toISOString();
  const images = validateAdminImages(input.images);
  const currency = validateAdminText(input.currency, '통화', 3).toUpperCase() || 'KRW';
  if (currency !== 'KRW') throw new RequestBodyError('판매가는 원화(KRW)로 입력해 주세요.');
  const payload: Record<string, unknown> = {
    title: validateAdminText(input.title, '상품명', 200, true),
    category: validateAdminText(input.category, '카테고리', 100) || null,
    description: validateAdminText(input.description, '상품 설명', 50000) || null,
    specs: validateAdminText(input.specs, '상품 사양', 50000) || null,
    price: validateAdminInteger(input.price, '판매가', 1),
    currency,
    images,
    thumbnail_url: images[0] || null,
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
      .from('products')
      .insert(workingPayload)
      .select('*')
      .maybeSingle();
    if (!error) {
      row = data;
      return { row, strippedColumns };
    }

    const missingColumn = extractMissingProductColumn(error);
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
      .from('products')
      .update(workingPayload)
      .eq('id', id)
      .select('*')
      .maybeSingle();
    if (!error) {
      row = data;
      return { row, strippedColumns };
    }

    const missingColumn = extractMissingProductColumn(error);
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

  let { data, error } = await auth.serviceClient
    .from('products')
    .select('*')
    .order('updated_at', { ascending: false })
    .limit(limit);

  if (error?.message?.toLowerCase().includes('updated_at')) {
    const fallback = await auth.serviceClient
      .from('products')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);
    data = fallback.data;
    error = fallback.error;
  }

  if (error) {
    if (isProductsTableMissing(error)) {
      return NextResponse.json({ message: missingProductsTableMessage() }, { status: 500 });
    }
    return NextResponse.json(
      { message: `상품 목록 조회 실패: ${error.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({ products: data ?? [] });
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

  try {
    const result = await insertWithMissingColumnFallback(
      auth.serviceClient,
      sanitizeProductPayload(payload, true),
    );
    if (!result.row) throw new RequestBodyError('상품을 찾지 못했습니다. 새로고침 후 다시 확인해 주세요.', 404);
    revalidateTag('storefront-products', 'max');
    return NextResponse.json({
      message:
        result.strippedColumns.length > 0
          ? `상품 등록 완료 (누락 컬럼 제외: ${result.strippedColumns.join(', ')})`
          : '상품 등록 완료',
      product: result.row,
      strippedColumns: result.strippedColumns,
    });
  } catch (error) {
    if (isProductsTableMissing(error)) {
      return NextResponse.json({ message: missingProductsTableMessage() }, { status: 500 });
    }
    return NextResponse.json(
      { message: getErrorMessage(error, '상품 저장 실패') },
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

  try {
    const result = await updateWithMissingColumnFallback(
      auth.serviceClient,
      id,
      sanitizeProductPayload(payload, false),
    );
    if (!result.row) throw new RequestBodyError('상품을 찾지 못했습니다. 새로고침 후 다시 확인해 주세요.', 404);
    revalidateTag('storefront-products', 'max');
    return NextResponse.json({
      message:
        result.strippedColumns.length > 0
          ? `상품 수정 완료 (누락 컬럼 제외: ${result.strippedColumns.join(', ')})`
          : '상품 수정 완료',
      product: result.row,
      strippedColumns: result.strippedColumns,
    });
  } catch (error) {
    if (isProductsTableMissing(error)) {
      return NextResponse.json({ message: missingProductsTableMessage() }, { status: 500 });
    }
    return NextResponse.json(
      { message: getErrorMessage(error, '상품 저장 실패') },
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

  const { error } = await auth.serviceClient.from('products').delete().eq('id', id);
  if (error) {
    if (isProductsTableMissing(error)) {
      return NextResponse.json({ message: missingProductsTableMessage() }, { status: 500 });
    }
    return NextResponse.json(
      { message: `상품 삭제 실패: ${error.message}` },
      { status: 500 },
    );
  }

  revalidateTag('storefront-products', 'max');
  return NextResponse.json({ message: '상품 삭제 완료' });
}
