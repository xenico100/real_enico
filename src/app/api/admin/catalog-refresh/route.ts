import { revalidateTag } from 'next/cache';
import { NextResponse } from 'next/server';
import { GET as checkAdminAccess } from '../access/route';

export const dynamic = 'force-dynamic';

/** Fixed tags only; the caller cannot invalidate arbitrary data or select an origin. */
export async function POST(request: Request) {
  const access = await checkAdminAccess(request);
  if (!access.ok) return access;
  revalidateTag('storefront-products', { expire: 0 });
  revalidateTag('storefront-collections', { expire: 0 });
  return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'private, no-store' } });
}
