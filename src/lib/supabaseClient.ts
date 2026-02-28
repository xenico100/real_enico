'use client';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let browserSupabaseClient: SupabaseClient | null = null;

export function getSupabaseClient() {
  if (browserSupabaseClient) {
    return browserSupabaseClient;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY 환경변수가 필요합니다.',
    );
  }

  browserSupabaseClient = createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });

  return browserSupabaseClient;
}
