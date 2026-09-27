import { createServerClient } from '@supabase/ssr';
import type { EmailOtpType } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { assertExpectedSupabaseProject } from '@/lib/supabase/projectGuard';
import { safeRedirectPath } from '@/lib/security/identity';

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const searchParams = requestUrl.searchParams;
  const code = searchParams.get('code');
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type');
  const defaultNextPath = type === 'recovery' ? '/auth/reset_password' : '/';
  const nextPath = searchParams.get('next') || defaultNextPath;
  const safeNextPath = safeRedirectPath(nextPath, requestUrl.origin);

  const response = NextResponse.redirect(new URL(safeNextPath, requestUrl.origin));

  if (code || (tokenHash && type)) {
    const cookieStore = await cookies();

    const supabase = createServerClient(
      assertExpectedSupabaseProject(process.env.NEXT_PUBLIC_SUPABASE_URL),
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(
            cookiesToSet: Array<{
              name: string;
              value: string;
              options?: Parameters<typeof response.cookies.set>[2];
            }>,
          ) {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
              response.cookies.set(name, value, options);
            });
          },
        },
      },
    );

    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) return NextResponse.redirect(new URL('/?auth_error=1', requestUrl.origin));
    } else if (tokenHash && type) {
      if (!['signup', 'invite', 'magiclink', 'recovery', 'email_change', 'email'].includes(type)) {
        return NextResponse.redirect(new URL('/?auth_error=1', requestUrl.origin));
      }
      const { error } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: type as EmailOtpType,
      });
      if (error) return NextResponse.redirect(new URL('/?auth_error=1', requestUrl.origin));
    }
  }

  return response;
}
