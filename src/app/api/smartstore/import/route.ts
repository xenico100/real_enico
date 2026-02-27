import { NextResponse } from 'next/server';
import { importAllSmartStoreProducts } from '@/lib/smartstoreImport';

export async function POST() {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ ok: false, error: 'dev_only' }, { status: 403 });
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
