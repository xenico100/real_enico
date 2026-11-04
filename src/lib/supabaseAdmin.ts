import 'server-only';

import { createClient } from '@supabase/supabase-js';
import { assertExpectedSupabaseProject } from '@/lib/supabase/projectGuard';

export function getSupabaseAdminClient(options: { timeoutMs?: number } = {}) {
  const url = assertExpectedSupabaseProject(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  );
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      'SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 환경변수가 필요합니다.',
    );
  }

  return createClient(url, serviceRoleKey, {
    ...(options.timeoutMs ? { global: { fetch: (input: RequestInfo | URL, init?: RequestInit) => fetch(input, {
      ...init, signal: init?.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(options.timeoutMs!)]) : AbortSignal.timeout(options.timeoutMs!),
    }) } } : {}),
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
