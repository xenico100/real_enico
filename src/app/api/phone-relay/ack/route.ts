import { NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabaseAdmin';
import { acknowledgePhoneRelayJob, PHONE_RELAY_HEADERS, readPhoneRelayBody, readPhoneRelayToken } from '@/lib/orders/phoneRelay';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  const token = readPhoneRelayToken(request);
  if (!token) return NextResponse.json({ message: 'Unauthorized.' }, { status: 401, headers: PHONE_RELAY_HEADERS });
  const body = await readPhoneRelayBody(request);
  if (!body) return NextResponse.json({ message: 'Invalid request.' }, { status: 400, headers: PHONE_RELAY_HEADERS });
  try {
    const result = await acknowledgePhoneRelayJob(getSupabaseAdminClient(), token, body);
    if (result.invalid) return NextResponse.json({ message: 'Invalid request.' }, { status: 400, headers: PHONE_RELAY_HEADERS });
    if (result.authorized !== true) return NextResponse.json({ message: 'Unauthorized.' }, { status: 401, headers: PHONE_RELAY_HEADERS });
    if (result.ok !== true) return NextResponse.json({ message: '이미 처리됐거나 만료된 작업입니다. 재발송하지 마세요.' }, { status: 409, headers: PHONE_RELAY_HEADERS });
    return NextResponse.json({ ok: true, status: result.status, deliveryConfirmed: false }, { headers: PHONE_RELAY_HEADERS });
  } catch { return NextResponse.json({ message: '결과 저장을 확인하지 못했습니다. 문자를 다시 보내지 마세요.' }, { status: 503, headers: PHONE_RELAY_HEADERS }); }
}
