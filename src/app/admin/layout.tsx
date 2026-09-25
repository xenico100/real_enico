import type { Metadata } from 'next';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { assertExpectedSupabaseProject } from '@/lib/supabase/projectGuard';

const PRIMARY_ADMIN_EMAIL = 'morba9850@gmail.com';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
};

export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!rawUrl || !anonKey) {
    redirect('/');
  }

  const url = assertExpectedSupabaseProject(rawUrl);

  const cookieStore = await cookies();
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll() {
        // Server Components cannot write cookies.
      },
    },
  });

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  const normalizedEmail = (user?.email || '').trim().toLowerCase();
  if (error || !user || normalizedEmail !== PRIMARY_ADMIN_EMAIL) {
    redirect('/');
  }

  return children;
}
