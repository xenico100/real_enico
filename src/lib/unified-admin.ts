const LOCAL_UNIFIED_ADMIN_URL = 'http://127.0.0.1:3148/';
const PRODUCTION_UNIFIED_ADMIN_URL = 'https://enico-mongsangin-admin.vercel.app/';

export type UnifiedAdminSite = 'enico' | 'mongsangin';
export type UnifiedAdminView = 'overview' | 'orders' | 'products' | 'collections' | 'publishing' | 'members' | 'status';

export function getUnifiedAdminUrl(site: UnifiedAdminSite, view: UnifiedAdminView = 'overview') {
  const configured = process.env.NEXT_PUBLIC_UNIFIED_ADMIN_URL?.trim();
  const rawUrl = configured || (process.env.NODE_ENV === 'development' ? LOCAL_UNIFIED_ADMIN_URL : PRODUCTION_UNIFIED_ADMIN_URL);
  if (!rawUrl) return null;

  try {
    const url = new URL(rawUrl);
    if (process.env.NODE_ENV === 'production' && url.protocol !== 'https:') return null;
    url.searchParams.set('site', site);
    url.searchParams.set('view', view);
    return url.toString();
  } catch {
    return null;
  }
}

export function getLegacyUnifiedAdminUrl(pathname: string, legacyView?: string | null) {
  let view: UnifiedAdminView = 'overview';
  if (pathname === '/admin/collections' || pathname.startsWith('/admin/collections/')) view = 'collections';
  else if (legacyView === 'inventory' || legacyView === 'products') view = 'products';
  else if (legacyView === 'adminOrders' || legacyView === 'orders') view = 'orders';
  else if (legacyView === 'members') view = 'members';
  return getUnifiedAdminUrl('enico', view);
}
