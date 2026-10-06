import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { isPrimaryAdmin } from '@/lib/security/identity';
import { assertExpectedSupabaseProject } from '@/lib/supabase/projectGuard';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function Test3DLayout({ children }: { children: ReactNode }) {
  const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!rawUrl || !anonKey) redirect('/');

  const cookieStore = await cookies();
  const supabase = createServerClient(assertExpectedSupabaseProject(rawUrl), anonKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: () => {
        // Server Components cannot write cookies; the proxy refreshes them.
      },
    },
  });
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !isPrimaryAdmin(user)) redirect('/');

  return children;
}
