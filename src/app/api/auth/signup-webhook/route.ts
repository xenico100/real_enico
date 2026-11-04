import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { notifySignup } from '@/lib/auth/signupNotification';
import { readJsonObject, RequestBodyError } from '@/lib/security/requestBody';

export async function POST(request: Request) {
  const secret = process.env.SIGNUP_NOTIFICATION_WEBHOOK_SECRET?.trim() || '';
  if (secret.length < 32) return NextResponse.json({ message: '알림 연결 설정이 필요합니다.' }, { status: 503 });
  const actual = Buffer.from(request.headers.get('x-signup-webhook-secret') || '');
  const expected = Buffer.from(secret);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return NextResponse.json({ message: 'Unauthorized.' }, { status: 401 });

  try {
    const payload = await readJsonObject(request, 16 * 1024);
    if (payload.type !== 'INSERT' || payload.schema !== 'auth' || payload.table !== 'users') return NextResponse.json({ message: '회원가입 이벤트가 아닙니다.' }, { status: 400 });
    const record = payload.record && typeof payload.record === 'object' && !Array.isArray(payload.record)
      ? payload.record as Record<string, unknown> : {};
    const userId = typeof record.id === 'string' ? record.id : '';
    if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(userId)) return NextResponse.json({ message: '회원 식별자가 올바르지 않습니다.' }, { status: 400 });
    // Ignore the webhook's email, recipient and anonymous flag; re-read Auth.
    const result = await notifySignup(userId);
    if (result.ok) return NextResponse.json({ ok: true, status: result.status });
    return NextResponse.json({ message: '회원가입 알림을 보내지 못했습니다.', code: result.code }, {
      status: result.status === 'rejected' ? 502 : 503, headers: { 'Retry-After': '60' },
    });
  } catch (error) {
    return NextResponse.json({ message: '회원가입 이벤트를 확인하지 못했습니다.' }, { status: error instanceof RequestBodyError ? error.status : 503 });
  }
}
