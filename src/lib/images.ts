const DIRECT_REMOTE_IMAGE_HOSTS = new Set([
  'pub-11768089b4c8464da58cf12287bef2fa.r2.dev',
  'gkfupegrduencknzpzok.supabase.co',
]);

export function shouldBypassImageOptimization(value: string) {
  if (!value) {
    return false;
  }

  try {
    const { hostname } = new URL(value);
    return DIRECT_REMOTE_IMAGE_HOSTS.has(hostname);
  } catch {
    return false;
  }
}
