export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { importAllSmartStoreProducts } from '@/lib/smartstoreImport';
import { createClient } from '@supabase/supabase-js';
import { isPrimaryAdmin } from '@/lib/security/identity';
import { assertExpectedSupabaseProject } from '@/lib/supabase/projectGuard';

export async function POST(request: Request) {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ ok: false, error: 'dev_only' }, { status: 403 });
  }

  const token = request.headers.get('authorization')?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!token) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const client = createClient(assertExpectedSupabaseProject(process.env.NEXT_PUBLIC_SUPABASE_URL), process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  const { data: { user }, error } = await client.auth.getUser(token);
  if (error || !isPrimaryAdmin(user)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const CLIENT_ID = process.env.NAVER_COMMERCE_CLIENT_ID;
  const CLIENT_SECRET = process.env.NAVER_COMMERCE_CLIENT_SECRET;

  if (!CLIENT_ID || !CLIENT_SECRET) {
    return NextResponse.json(
      { ok: false, error: 'env_missing' },
      { status: 500 },
    );
  }

  try {
    const result = await importAllSmartStoreProducts();
    return NextResponse.json({
      ok: true,
      imported: result.imported,
      failed: result.failed,
      scanned: result.scanned,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: 'import_failed',
        message: error instanceof Error ? error.message : 'import failed',
      },
      { status: 500 },
    );
  }
}
