import 'server-only';
import { createHmac } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabaseAdmin';

export async function requestBudget(
  request: Request,
  scope: string,
  limit: number,
  seconds: number,
  subject?: string,
): Promise<NextResponse | null> {
  try {
    // Vercel overwrites this header. Local/other servers must not trust it.
    const ip = process.env.VERCEL === '1'
      ? (request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown')
      : 'local';
    const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!secret) throw new Error('Budget configuration missing');
    const key = createHmac('sha256', secret)
      .update(`${scope}:${subject === undefined ? `ip:${ip}` : `subject:${subject}`}`)
      .digest('hex');
    const { data, error } = await getSupabaseAdminClient().rpc('consume_request_budget', {
      p_key: key, p_limit: limit, p_seconds: seconds,
    });
    if (error || typeof data !== 'boolean') throw new Error('Budget lookup failed');
    if (data) return null;
    return NextResponse.json({ message: '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.' }, {
      status: 429,
      headers: { 'Retry-After': String(seconds), 'Cache-Control': 'private, no-store' },
    });
  } catch {
    // Never silently remove brute-force protection when the backing store fails.
    return NextResponse.json({ message: '요청을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.' }, {
      status: 503, headers: { 'Cache-Control': 'private, no-store' },
    });
  }
}
