import { NextResponse } from 'next/server';

const DEFAULT_SIGNUP_RECEIVER_EMAIL = 'morba9850@gmail.com';
const RESEND_API_ENDPOINT = 'https://api.resend.com/emails';

function normalizeText(value: unknown) {
  if (typeof value !== 'string') return '';
  return value.trim();
}

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function POST(request: Request) {
  let payload: {
    email?: string;
    fullName?: string;
    phone?: string;
    provider?: string;
  } = {};

  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return NextResponse.json({ message: '잘못된 요청 본문입니다.' }, { status: 400 });
  }

  const email = normalizeText(payload.email).toLowerCase();
  const fullName = normalizeText(payload.fullName) || '-';
  const phone = normalizeText(payload.phone) || '-';
  const provider = normalizeText(payload.provider) || 'email';

  if (!email || !isEmail(email)) {
    return NextResponse.json({ message: '유효한 이메일이 필요합니다.' }, { status: 400 });
  }

  const resendApiKey = process.env.RESEND_API_KEY?.trim() || '';
  if (!resendApiKey) {
    return NextResponse.json(
      { message: '서버에 RESEND_API_KEY가 설정되어 있지 않습니다.' },
      { status: 500 },
    );
  }

  const to = (process.env.ORDER_NOTIFICATION_EMAIL || DEFAULT_SIGNUP_RECEIVER_EMAIL).trim();
  const from = (
    process.env.AUTH_FROM_EMAIL ||
    process.env.ORDER_FROM_EMAIL ||
    'Enico Veck Auth <onboarding@resend.dev>'
  ).trim();

  const subject = `[신규 회원가입] ${fullName} / ${email}`;
  const text = [
    '[신규 회원가입 알림]',
    '',
    `이름: ${fullName}`,
    `이메일: ${email}`,
    `전화번호: ${phone}`,
    `가입 방식: ${provider}`,
    `시간: ${new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}`,
  ].join('\n');

  try {
    const emailResponse = await fetch(RESEND_API_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject,
        text,
        reply_to: email,
      }),
    });

    const responsePayload = (await emailResponse.json().catch(() => null)) as
      | { error?: { message?: string } }
      | null;

    if (!emailResponse.ok) {
      const detail = responsePayload?.error?.message || '메일 발송 API 응답 오류';
      throw new Error(detail);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? `회원가입 알림 메일 발송 실패: ${error.message}`
            : '회원가입 알림 메일 발송 중 서버 오류가 발생했습니다.',
      },
      { status: 500 },
    );
  }
}
