import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { isVerifiedMember } from '@/lib/security/identity';
import { requestBudget } from '@/lib/security/requestBudget';
import { assertExpectedSupabaseProject } from '@/lib/supabase/projectGuard';
import { notifySignup } from '@/lib/auth/signupNotification';

export async function POST(request: Request) {
  try {
    const token = request.headers.get('authorization')?.match(/^Bearer\s+(\S+)$/i)?.[1];
    if (!token) return NextResponse.json({ message: 'Unauthorized.' }, { status: 401 });
    const authClient = createClient(assertExpectedSupabaseProject(process.env.NEXT_PUBLIC_SUPABASE_URL), process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: { user }, error: authError } = await authClient.auth.getUser(token);
    if (authError || !isVerifiedMember(user)) return NextResponse.json({ message: 'Unauthorized.' }, { status: 401 });
    const age = Date.now() - Date.parse(user.created_at);
    if (!Number.isFinite(age) || age < 0 || age >= 86400000) return NextResponse.json({ ok: true, skipped: true });
    // A short retry budget must not consume a once-per-day send entitlement
    // before a missing configuration or transient provider failure recovers.
    const blocked = await requestBudget(request, 'signup-notify-retry', 6, 60, user.id);
    if (blocked) return blocked;
    const result = await notifySignup(user.id);
    if (result.ok) return NextResponse.json({ ok: true, status: result.status });
    return NextResponse.json({ message: '회원가입 알림을 보내지 못했습니다.', code: result.code }, {
      status: result.status === 'rejected' ? 502 : 503, headers: { 'Retry-After': '60' },
    });
  } catch {
    return NextResponse.json({ message: '회원가입 알림을 확인하지 못했습니다.' }, { status: 503 });
  }
}
