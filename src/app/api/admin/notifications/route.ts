import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { isPrimaryAdmin } from '@/lib/security/identity';
import { assertExpectedSupabaseProject } from '@/lib/supabase/projectGuard';
import { getNotificationConfigHealth } from '@/lib/orders/notificationProviders';
import { BANK_ACCOUNT } from '@/lib/orders/bankAccount';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const token = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  const headers = { 'Cache-Control': 'private, no-store' };
  if (!token) return NextResponse.json({ message: 'Unauthorized.' }, { status: 401, headers });
  const url = assertExpectedSupabaseProject(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!key) return NextResponse.json({ message: '서버 인증 설정을 확인해 주세요.' }, { status: 503, headers });
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: { user }, error } = await client.auth.getUser(token);
  if (error || !isPrimaryAdmin(user)) return NextResponse.json({ message: 'Forbidden.' }, { status: 403, headers });
  const config = getNotificationConfigHealth();
  const warnings: string[] = [];
  if (!config.customerEmail) warnings.push('고객 확인 메일에 사용할 인증된 발신 주소와 이메일 연결을 확인해 주세요.');
  if (!config.customerSms) warnings.push('고객 계좌 안내 문자는 아직 연결되지 않았습니다. SOLAPI 키·인증된 발신번호·잔액 확인이 필요합니다.');
  if (!config.adminSms) warnings.push('운영자 휴대폰 알림은 문자 서비스와 관리자 수신번호를 설정해야 합니다.');
  warnings.push('발송 요청 완료는 수신 완료를 뜻하지 않습니다. 결과 확인 필요인 문자는 공급자 발송 내역을 확인한 뒤 처리하세요.');
  return NextResponse.json({ config, warnings, bankAccount: BANK_ACCOUNT }, { headers });
}
