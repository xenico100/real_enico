'use client';

import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { assertExpectedSupabaseProject } from '@/lib/supabase/projectGuard';

export function hasSupabaseBrowserConfig() {
  if (!browserUrl || !browserAnonKey) return false;
  try {
    assertExpectedSupabaseProject(browserUrl);
    return true;
  } catch {
    return false;
  }
}

const browserUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const browserAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

let browserClient: SupabaseClient | null = null;

// Requested pattern: shared browser client used by client components.
export const supabase =
  typeof window !== 'undefined' && browserUrl && browserAnonKey
    ? createBrowserClient(assertExpectedSupabaseProject(browserUrl), browserAnonKey)
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

  browserClient = createBrowserClient(
    assertExpectedSupabaseProject(browserUrl),
    browserAnonKey,
  );
  return browserClient;
}
