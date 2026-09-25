export const EXPECTED_PROJECT_REF = 'gkfupegrduencknzpzok';

const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);

/**
 * Keep every Enico Supabase client on the canonical project. Local Supabase
 * development hosts remain allowed; production-looking hosts must carry the
 * Enico project ref.
 */
export function assertExpectedSupabaseProject(url: string | undefined): string {
  const rawUrl = url?.trim();
  if (!rawUrl) {
    throw new Error('Missing Supabase URL for Enico client.');
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error('Invalid Supabase URL for Enico client.');
  }

  if (LOCAL_HOSTS.has(parsed.hostname)) {
    return parsed.toString();
  }

  const ref = parsed.hostname.match(/^([a-z0-9]+)\.supabase\.co$/)?.[1];
  if (ref !== EXPECTED_PROJECT_REF) {
    throw new Error(
      `Supabase project ref mismatch for Enico app: expected ${EXPECTED_PROJECT_REF}.`,
    );
  }

  return parsed.toString();
}
