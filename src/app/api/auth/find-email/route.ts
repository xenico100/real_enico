import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

function getServerConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return null;
  return { url, serviceRoleKey };
}

function normalizeText(value: unknown) {
  if (typeof value !== 'string') return '';
  return value.trim();
}

function normalizePhone(value: unknown) {
  if (typeof value !== 'string') return '';
  return value.replace(/\D+/g, '');
}

function maskEmail(email: string) {
  const normalized = email.trim().toLowerCase();
  const [local, domain] = normalized.split('@');
  if (!local || !domain) return '';

  if (local.length <= 2) {
    return `${local[0] || '*'}*@${domain}`;
  }

  return `${local.slice(0, 2)}${'*'.repeat(Math.max(1, local.length - 2))}@${domain}`;
}

export async function POST(request: Request) {
  let payload: { fullName?: string; phone?: string } = {};
  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return NextResponse.json({ message: '잘못된 요청 본문입니다.' }, { status: 400 });
  }

  const fullName = normalizeText(payload.fullName).toLowerCase();
  const phone = normalizePhone(payload.phone);
  if (!fullName || !phone) {
    return NextResponse.json(
      { message: '이름과 전화번호를 모두 입력해 주세요.' },
      { status: 400 },
    );
  }

  const config = getServerConfig();
  if (!config) {
    return NextResponse.json(
      { message: 'Supabase server config is missing.' },
      { status: 500 },
    );
  }

  const serviceClient = createClient(config.url, config.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await serviceClient.auth.admin.listUsers({
    page: 1,
    perPage: 500,
  });

  if (error) {
    return NextResponse.json(
      { message: `아이디 조회 실패: ${error.message}` },
      { status: 500 },
    );
  }

  const matches = (data.users || [])
    .filter((user) => {
      const metadata =
        user.user_metadata && typeof user.user_metadata === 'object'
          ? (user.user_metadata as Record<string, unknown>)
          : {};
      const metaName = normalizeText(metadata.full_name).toLowerCase();
      const metaPhone = normalizePhone(metadata.phone);
      return Boolean(user.email) && metaName === fullName && metaPhone === phone;
    })
    .map((user) => maskEmail(user.email || ''))
    .filter(Boolean);

  if (matches.length === 0) {
    return NextResponse.json(
      { message: '일치하는 계정을 찾지 못했습니다.' },
      { status: 404 },
    );
  }

  return NextResponse.json({
    message: '일치하는 계정을 찾았습니다.',
    emails: Array.from(new Set(matches)).slice(0, 5),
  });
}
