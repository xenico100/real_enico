import type { User } from '@supabase/supabase-js';

// The confirmed production owner, verified against Auth on 2026-09-27.
// Account deletion/re-registration must not silently grant ownership by email.
export const PRIMARY_ADMIN_ID = '6b46e3bc-dbda-49c3-a800-b7d1badf91e1';
export const PRIMARY_ADMIN_EMAIL = 'morba9850@gmail.com';

export function isVerifiedMember(user: User | null | undefined): user is User {
  return Boolean(user && !user.is_anonymous && user.email && user.email_confirmed_at);
}

export function isPrimaryAdmin(user: User | null | undefined): user is User {
  return isVerifiedMember(user) && user.id === PRIMARY_ADMIN_ID &&
    user.email?.trim().toLowerCase() === PRIMARY_ADMIN_EMAIL;
}

/** Treat SQL LIKE metacharacters as literal email characters. */
export function literalEmailPattern(email: string): string {
  return email.trim().replace(/[\\%_]/g, '\\$&');
}

export function safeRedirectPath(path: string | null, origin: string, fallback = '/') {
  if (!path || !path.startsWith('/') || path.startsWith('//') || /[\\\u0000-\u001f\u007f]/.test(path)) return fallback;
  try {
    const target = new URL(path, origin);
    return target.origin === origin ? `${target.pathname}${target.search}${target.hash}` : fallback;
  } catch {
    return fallback;
  }
}
