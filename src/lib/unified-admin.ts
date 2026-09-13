const LOCAL_UNIFIED_ADMIN_URL = 'http://127.0.0.1:3148/';

export type UnifiedAdminSite = 'enico' | 'mongsangin';

export function getUnifiedAdminUrl(site: UnifiedAdminSite) {
  const configured = process.env.NEXT_PUBLIC_UNIFIED_ADMIN_URL?.trim();
  const rawUrl = configured || (process.env.NODE_ENV === 'development' ? LOCAL_UNIFIED_ADMIN_URL : '');
  if (!rawUrl) return null;

  try {
    const url = new URL(rawUrl);
    if (process.env.NODE_ENV === 'production' && url.protocol !== 'https:') return null;
    url.searchParams.set('site', site);
    return url.toString();
  } catch {
    return null;
  }
}
