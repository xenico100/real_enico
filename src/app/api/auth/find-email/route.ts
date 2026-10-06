import { createClient, type User } from '@supabase/supabase-js';
import { after, NextResponse } from 'next/server';
import { isVerifiedMember } from '@/lib/security/identity';
import { requestBudget } from '@/lib/security/requestBudget';
import { readJsonObject, RequestBodyError } from '@/lib/security/requestBody';
import { assertExpectedSupabaseProject } from '@/lib/supabase/projectGuard';

export const runtime = 'nodejs';

const RESEND_API_ENDPOINT = 'https://api.resend.com/emails';
const USERS_PER_PAGE = 1000;
const MAX_USER_PAGES = 20;
const GENERIC_MESSAGE = '입력한 정보와 일치하는 계정이 있으면 등록된 이메일로 안내를 보내드립니다. 메일이 오지 않으면 고객센터로 문의해 주세요.';

function normalizeText(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizePhone(value: unknown) {
  return typeof value === 'string' ? value.replace(/\D+/g, '') : '';
}

function matchesAccount(user: User, fullName: string, phone: string) {
  if (!isVerifiedMember(user)) return false;
  const metadata = user.user_metadata && typeof user.user_metadata === 'object'
    ? user.user_metadata as Record<string, unknown>
    : {};
  return normalizeText(metadata.full_name).toLowerCase() === fullName &&
    normalizePhone(metadata.phone) === phone;
}

async function findMatchingAccount(
  url: string,
  serviceRoleKey: string,
  fullName: string,
  phone: string,
): Promise<User | null> {
  const serviceClient = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  for (let page = 1; page <= MAX_USER_PAGES; page += 1) {
    const { data, error } = await serviceClient.auth.admin.listUsers({ page, perPage: USERS_PER_PAGE });
    if (error) throw error;
    const users = data.users || [];
    const match = users.find((user) => matchesAccount(user, fullName, phone));
    if (match) return match;
    if (users.length < USERS_PER_PAGE) return null;
  }
  console.error('Find email search reached the account pagination limit');
  return null;
}

async function sendAccountReminder(email: string, resendApiKey: string) {
  const from = (
    process.env.AUTH_FROM_EMAIL ||
    process.env.ORDER_FROM_EMAIL ||
    'Enico Veck Auth <onboarding@resend.dev>'
  ).trim();
  const response = await fetch(RESEND_API_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [email],
      subject: '[ENICO VECK] 가입 이메일 안내',
      text: [
        'ENICO VECK 가입 이메일 안내',
        '',
        `가입 이메일: ${email}`,
        '',
        '요청한 적이 없다면 이 메일을 무시해 주세요.',
      ].join('\n'),
    }),
  });
  if (!response.ok) throw new Error(`Account reminder delivery failed (${response.status})`);
}

export async function POST(request: Request) {
  const blocked = await requestBudget(request, 'find-email', 10, 900);
  if (blocked) return blocked;

  let payload: Record<string, unknown>;
  try {
    payload = await readJsonObject(request, 4096);
  } catch (error) {
    return NextResponse.json(
      { message: '잘못된 요청 본문입니다.' },
      { status: error instanceof RequestBodyError ? error.status : 400 },
    );
  }

  const fullName = normalizeText(payload.fullName).toLowerCase();
  const phone = normalizePhone(payload.phone);
  if (!fullName || fullName.length > 100 || phone.length < 8 || phone.length > 20) {
    return NextResponse.json({ message: '이름과 전화번호를 모두 입력해 주세요.' }, { status: 400 });
  }

  let url: string;
  try {
    url = assertExpectedSupabaseProject(process.env.NEXT_PUBLIC_SUPABASE_URL);
  } catch {
    return NextResponse.json({ message: '요청을 처리하지 못했습니다.' }, { status: 503 });
  }
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const resendApiKey = process.env.RESEND_API_KEY;
  if (!serviceRoleKey || !resendApiKey) {
    return NextResponse.json({ message: '요청을 처리하지 못했습니다.' }, { status: 503 });
  }

  // Lookup and delivery happen after the identical response for matching and
  // non-matching inputs, avoiding email/domain disclosure and delivery timing leaks.
  after(async () => {
    try {
      const match = await findMatchingAccount(url, serviceRoleKey, fullName, phone);
      if (!match?.email) return;
      const accountBlocked = await requestBudget(request, 'find-email-account', 1, 86400, match.id);
      if (accountBlocked) return;
      await sendAccountReminder(match.email, resendApiKey);
    } catch (error) {
      console.error('Find email reminder failed', error);
    }
  });

  return NextResponse.json(
    { ok: true, message: GENERIC_MESSAGE },
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
}
