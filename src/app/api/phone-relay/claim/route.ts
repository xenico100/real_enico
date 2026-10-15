import { NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabaseAdmin';
import { claimPhoneRelayJob, PHONE_RELAY_HEADERS, readPhoneRelayToken } from '@/lib/orders/phoneRelay';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  const token = readPhoneRelayToken(request);
  if (!token) return NextResponse.json({ message: 'Unauthorized.' }, { status: 401, headers: PHONE_RELAY_HEADERS });
  try {
    const result = await claimPhoneRelayJob(getSupabaseAdminClient(), token);
    return result ? NextResponse.json(result, { headers: PHONE_RELAY_HEADERS })
      : NextResponse.json({ message: 'Unauthorized.' }, { status: 401, headers: PHONE_RELAY_HEADERS });
  } catch { return NextResponse.json({ message: '문자 대기열을 확인하지 못했습니다. 자동으로 재발송하지 않습니다.' }, { status: 503, headers: PHONE_RELAY_HEADERS }); }
}
