const NEXT_IMAGE_REMOTE_HOSTS = new Set([
  'pub-11768089b4c8464da58cf12287bef2fa.r2.dev',
  'gkfupegrduencknzpzok.supabase.co',
  'images.unsplash.com',
  'dummyimage.com',
]);

function isSvgPath(pathname: string) {
  return /\.svg(?:$|[?#])/i.test(pathname);
}

export function shouldBypassImageOptimization(value: string) {
  const source = value.trim();
  if (!source) {
    return false;
  }

  if (source.startsWith('data:') || source.startsWith('blob:')) {
    return true;
  }

  if (source.startsWith('/')) {
    return isSvgPath(source);
  }

  try {
    const url = new URL(source);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return true;
    }

    return isSvgPath(url.pathname) || !NEXT_IMAGE_REMOTE_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}
