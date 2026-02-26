'use client';

import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

export function hasSupabaseBrowserConfig() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

const browserUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const browserAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

let browserClient: SupabaseClient | null = null;

// Requested pattern: shared browser client used by client components.
export const supabase =
  typeof window !== 'undefined' && browserUrl && browserAnonKey
    ? createBrowserClient(browserUrl, browserAnonKey)
    : null;

export function getSupabaseBrowserClient() {
  if (typeof window === 'undefined') {
    return null;
  }

  if (browserClient) {
    return browserClient;
  }

  if (supabase) {
    browserClient = supabase;
    return browserClient;
  }

  if (!browserUrl || !browserAnonKey) {
    return null;
  }

  browserClient = createBrowserClient(browserUrl, browserAnonKey);
  return browserClient;
}
