import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { isPrimaryAdmin } from '@/lib/security/identity';
import { assertExpectedSupabaseProject } from '@/lib/supabase/projectGuard';
import { getNotificationConfigHealth } from '@/lib/orders/notificationProviders';
import { BANK_ACCOUNT } from '@/lib/orders/bankAccount';
import { getPhoneRelayHealth } from '@/lib/orders/phoneRelay';

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
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return NextResponse.json({ message: '서버 알림 설정을 확인해 주세요.' }, { status: 503, headers });
  const serviceClient = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const phoneRelay = await getPhoneRelayHealth(serviceClient);
  const providerConfig = getNotificationConfigHealth();
  const config = { ...providerConfig, customerSms: providerConfig.customerSms || phoneRelay.ready,
    smsProvider: phoneRelay.ready ? 'phone_relay' : providerConfig.smsProvider, phoneRelay,
    ownerPhoneNotification: phoneRelay.ready ? 'local_shortcut' : providerConfig.adminSms ? 'sms' : null };
  const warnings: string[] = [];
  if (!config.customerEmail) warnings.push('고객 확인 메일에 사용할 인증된 발신 주소와 이메일 연결을 확인해 주세요.');
  if (config.customerMessageChannel === 'alimtalk') {
    if (!config.customerKakao) warnings.push('주문 알림톡 발송 키·채널·주문 접수 및 결제 확인 템플릿 연결을 확인해 주세요.');
    if (!config.alimtalkTemplates.shipping_started) warnings.push('배송 시작 알림톡 템플릿이 연결되지 않았습니다.');
    warnings.push('고객 휴대폰 알림은 카카오 알림톡으로 발송합니다. 알림톡 실패 시 문자로 대체하지 않습니다.');
  }
  if (config.customerMessageChannel !== 'alimtalk' && !config.customerSms) warnings.push('고객 문자는 아직 연결되지 않았습니다. 아이폰 연결·본인 수신 테스트·자동화 설정 후 활성화하거나 SOLAPI를 연결해 주세요.');
  if (config.customerMessageChannel !== 'alimtalk' && !phoneRelay.available) warnings.push('아이폰 문자 대기열을 사용할 수 없습니다. 서버 설치 상태를 확인해 주세요.');
  else if (config.customerMessageChannel !== 'alimtalk' && phoneRelay.paired && !phoneRelay.ready) warnings.push('아이폰은 연결됐지만 고객 문자 발송은 비활성화 상태입니다. 본인 수신 테스트와 자동화 설정을 완료한 뒤 활성화해 주세요.');
  if (config.customerMessageChannel !== 'alimtalk' && phoneRelay.ready) warnings.push('아이폰 문자 대기 중은 발송 완료가 아닙니다. 아이폰의 Mail 수신·단축어 실행·통신 연결에 따라 지연되거나 중단될 수 있습니다.');
  if (phoneRelay.ready) warnings.push('운영자 휴대폰 알림은 아이폰 단축어의 로컬 알림으로 받습니다. 본인 번호로 별도 문자를 보내지 않습니다.');
  else if (!config.adminSms) warnings.push('운영자 휴대폰 알림은 아이폰 단축어의 로컬 알림을 설정하거나 문자 서비스와 관리자 수신번호를 연결해야 합니다.');
  warnings.push('발송 요청 완료는 수신 완료를 뜻하지 않습니다. 결과 확인 필요인 문자는 아이폰 또는 공급자 발송 내역을 확인한 뒤 처리하세요.');
  return NextResponse.json({ config, warnings, bankAccount: BANK_ACCOUNT }, { headers });
}
