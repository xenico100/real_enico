import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';
import { isPrimaryAdmin } from '@/lib/security/identity';
import { assertExpectedSupabaseProject } from '@/lib/supabase/projectGuard';

const PAYMENT_CALLBACKS = new Set(['/api/orders/nicepay/return', '/api/payments/nice/return']);
const ADMIN_ONLY_3D_ASSETS = new Set(['/3d/bomber_jacket.glb', '/3d/bomber_jacket.obj']);

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const isAdminPage = path === '/admin' || path.startsWith('/admin/') ||
    path === '/collections/test-3d' || path.startsWith('/collections/test-3d/');
  const isAdminAsset = ADMIN_ONLY_3D_ASSETS.has(path);
  if (isAdminPage || isAdminAsset) {
    let response = NextResponse.next({ request });
    const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!rawUrl || !key) {
      return isAdminAsset
        ? new NextResponse('Not Found', { status: 404, headers: { 'Cache-Control': 'private, no-store, max-age=0' } })
        : NextResponse.redirect(new URL('/', request.url));
    }
    const supabase = createServerClient(assertExpectedSupabaseProject(rawUrl), key, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(values: Array<{ name: string; value: string; options: CookieOptions }>) {
          values.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          values.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    });
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !isPrimaryAdmin(user)) {
      const denied = isAdminAsset
        ? new NextResponse('Not Found', { status: 404 })
        : NextResponse.redirect(new URL('/', request.url));
      response.cookies.getAll().forEach(cookie => denied.cookies.set(cookie));
      response = denied;
    }
    response.headers.set('Cache-Control', 'private, no-store, max-age=0');
    return response;
  }

  if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method) && !PAYMENT_CALLBACKS.has(path)) {
    const origin = request.headers.get('origin');
    const allowed = new Set([request.nextUrl.origin, 'https://enicoveck.com', 'https://www.enicoveck.com']);
    if ((origin && !allowed.has(origin)) || request.headers.get('sec-fetch-site') === 'cross-site') {
      return NextResponse.json({ message: '허용되지 않은 요청입니다.' }, { status: 403 });
    }
    const maxBytes = path === '/api/admin/r2-upload' ? 64 * 1024 * 1024 :
      path === '/api/orders/receipt-upload' ? 9 * 1024 * 1024 : 128 * 1024;
    if (Number(request.headers.get('content-length') || 0) > maxBytes) {
      return NextResponse.json({ message: '요청 본문이 너무 큽니다.' }, { status: 413 });
    }
  }
  return NextResponse.next();
}

export const config = { matcher: ['/admin/:path*', '/collections/test-3d/:path*', '/3d/:path*', '/api/:path*'] };
