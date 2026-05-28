import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { revalidateTag } from 'next/cache';
import { NextResponse } from 'next/server';
import { buildInventoryRaw } from '@/lib/storefront/productAvailability';

export const runtime = 'nodejs';

const PRIMARY_ADMIN_EMAIL = 'morba9850@gmail.com';

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
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
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

function isProductsTableMissing(error: unknown) {
  const message = getErrorMessage(error, '').toLowerCase();
  return (
    message.includes('relation') &&
    message.includes('products') &&
    message.includes('does not exist')
  );
}

function isMissingRawColumn(error: unknown) {
  const missingColumn = extractMissingProductColumn(error);
  if (missingColumn === 'raw') return true;

  const message = getErrorMessage(error, '').toLowerCase();
  return (
    message.includes('raw') &&
    (message.includes('does not exist') || message.includes('schema cache'))
  );
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

  const normalizedEmail = normalizeText(user.email || '').toLowerCase();
  if (normalizedEmail === PRIMARY_ADMIN_EMAIL) {
    return { ok: true, serviceClient };
  }

  const { data: adminRow, error: adminError } = await serviceClient
    .from('admins')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (adminError || !adminRow?.user_id) {
    return {
      ok: false,
      response: NextResponse.json({ message: 'Forbidden.' }, { status: 403 }),
    };
  }

  return { ok: true, serviceClient };
}

async function fetchProductForInventory(serviceClient: SupabaseClient, id: string) {
  const withRaw = await serviceClient
    .from('products')
    .select('id, title, raw, is_published')
    .eq('id', id)
    .maybeSingle();

  if (!withRaw.error) {
    return {
      row: withRaw.data as Record<string, unknown> | null,
      hasRawColumn: true,
    };
  }

  if (!isMissingRawColumn(withRaw.error)) {
    throw withRaw.error;
  }

  const fallback = await serviceClient
    .from('products')
    .select('id, title, is_published')
    .eq('id', id)
    .maybeSingle();

  if (fallback.error) {
    throw fallback.error;
  }

  return {
    row: fallback.data as Record<string, unknown> | null,
    hasRawColumn: false,
  };
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
      row = data as Record<string, unknown> | null;
      return { row, strippedColumns };
    }

    const missingColumn = extractMissingProductColumn(error);
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

  const parsedQuantity =
    typeof payload.quantity === 'number'
      ? payload.quantity
      : Number.parseInt(normalizeText(payload.quantity), 10);

  if (!Number.isFinite(parsedQuantity) || parsedQuantity < 0) {
    return NextResponse.json({ message: '재고 수량은 0 이상의 숫자로 입력하세요.' }, { status: 400 });
  }

  const quantity = Math.min(Math.trunc(parsedQuantity), 9999);
  const isSoldOut = Boolean(payload.isSoldOut) || quantity <= 0;

  try {
    const existing = await fetchProductForInventory(auth.serviceClient, id);
    if (!existing.row?.id) {
      return NextResponse.json({ message: '상품을 찾지 못했습니다.' }, { status: 404 });
    }

    const updatePayload: Record<string, unknown> = existing.hasRawColumn
      ? {
          raw: buildInventoryRaw(existing.row.raw, {
            quantity,
            isSoldOut,
            source: 'admin',
          }),
          updated_at: new Date().toISOString(),
        }
      : {
          is_published: !isSoldOut,
          updated_at: new Date().toISOString(),
        };

    const result = await updateWithMissingColumnFallback(auth.serviceClient, id, updatePayload);
    revalidateTag('storefront-products', 'max');

    return NextResponse.json({
      message: existing.hasRawColumn
        ? '재고 정보 저장 완료'
        : 'raw 컬럼이 없어 공개 여부로 품절 상태를 저장했습니다.',
      product: result.row,
      strippedColumns: result.strippedColumns,
      hasRawColumn: existing.hasRawColumn,
    });
  } catch (error) {
    if (isProductsTableMissing(error)) {
      return NextResponse.json(
        { message: 'products 테이블이 없어 재고 저장에 실패했습니다.' },
        { status: 500 },
      );
    }

    return NextResponse.json(
      { message: getErrorMessage(error, '재고 저장 실패') },
      { status: 500 },
    );
  }
}
