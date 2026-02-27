import { NextResponse } from 'next/server';

const DEFAULT_CONTACT_RECEIVER_EMAIL = 'morba9850@gmail.com';
const RESEND_API_ENDPOINT = 'https://api.resend.com/emails';

function normalizeText(value: unknown) {
  if (typeof value !== 'string') return '';
  return value.trim();
}

function normalizeBody(value: unknown) {
  if (typeof value !== 'string') return '';
  return value.trim();
}

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function POST(request: Request) {
  let payload: {
    name?: string;
    replyEmail?: string;
    subject?: string;
    body?: string;
  } = {};

  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return NextResponse.json({ message: '잘못된 요청 본문입니다.' }, { status: 400 });
  }

  const name = normalizeText(payload.name);
  const replyEmail = normalizeText(payload.replyEmail).toLowerCase();
  const subject = normalizeText(payload.subject);
  const body = normalizeBody(payload.body);

  if (!name || !replyEmail || !subject || !body) {
    return NextResponse.json(
      { message: '성함, 회신 이메일, 제목, 내용을 모두 입력해 주세요.' },
      { status: 400 },
    );
  }

  if (!isEmail(replyEmail)) {
    return NextResponse.json(
      { message: '회신 이메일 형식이 올바르지 않습니다.' },
      { status: 400 },
    );
  }

  const resendApiKey = process.env.RESEND_API_KEY;
  if (!resendApiKey) {
    return NextResponse.json(
      { message: '서버에 RESEND_API_KEY가 설정되어 있지 않습니다.' },
      { status: 500 },
    );
  }

  const to = (
    process.env.CONTACT_NOTIFICATION_EMAIL ||
    process.env.ORDER_NOTIFICATION_EMAIL ||
    DEFAULT_CONTACT_RECEIVER_EMAIL
  ).trim();
  const from = (
    process.env.CONTACT_FROM_EMAIL ||
    process.env.ORDER_FROM_EMAIL ||
    'Enico Veck Contact <onboarding@resend.dev>'
  ).trim();

  const subjectLine = `[연락문의] ${subject}`;
  const text = [
    '[사이트 연락 폼 문의]',
    '',
    `보낸 사람: ${name}`,
    `회신 이메일: ${replyEmail}`,
    '',
    '[내용]',
    body,
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
        subject: subjectLine,
        text,
        reply_to: replyEmail,
      }),
    });

    const responsePayload = (await emailResponse.json().catch(() => null)) as
      | { error?: { message?: string } }
      | null;

    if (!emailResponse.ok) {
      const detail = responsePayload?.error?.message || '메일 발송 API 응답 오류';
      throw new Error(detail);
    }

    return NextResponse.json({ ok: true, message: '문의가 전송되었습니다.' });
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? `문의 전송 실패: ${error.message}`
            : '문의 전송 중 서버 오류가 발생했습니다.',
      },
      { status: 500 },
    );
  }
}
