export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { importAllSmartStoreProducts } from '@/lib/smartstoreImport';

export async function POST() {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ ok: false, error: 'dev_only' }, { status: 403 });
  }

  const CLIENT_ID = process.env.NAVER_COMMERCE_CLIENT_ID;
  const CLIENT_SECRET = process.env.NAVER_COMMERCE_CLIENT_SECRET;

  console.log('DEBUG ENV ID:', CLIENT_ID);
  console.log('DEBUG ENV SECRET:', CLIENT_SECRET);

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
