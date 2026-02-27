import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const PRIMARY_ADMIN_EMAIL = 'morba9850@gmail.com';

type AdminAuthResult =
  | {
      ok: true;
      adminId: string;
      serviceClient: any;
    }
  | {
      ok: false;
      response: NextResponse;
    };

type ProfileRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type MemberResponse = {
  id: string;
  email: string;
  fullName: string;
  phone: string;
  address: string;
  createdAt: string | null;
  updatedAt: string | null;
  isPrimaryAdmin: boolean;
};

function getServerConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !anonKey || !serviceRoleKey) {
    return null;
  }

  return { url, anonKey, serviceRoleKey };
}

function normalizeText(value: unknown) {
  if (typeof value !== 'string') return '';
  return value.trim();
}

function buildMemberResponse(
  authUser: {
    id: string;
    email?: string | null;
    user_metadata?: Record<string, unknown> | null;
    created_at?: string;
    updated_at?: string;
  },
  profile?: ProfileRow,
): MemberResponse {
  const metadata =
    authUser.user_metadata && typeof authUser.user_metadata === 'object'
      ? authUser.user_metadata
      : {};

  const fullNameFromMeta =
    typeof metadata.full_name === 'string' ? normalizeText(metadata.full_name) : '';
  const phone = typeof metadata.phone === 'string' ? normalizeText(metadata.phone) : '';
  const address = typeof metadata.address === 'string' ? normalizeText(metadata.address) : '';

  const email = normalizeText(authUser.email || profile?.email || '');
  const fullName = fullNameFromMeta || normalizeText(profile?.full_name || '');
  const loweredEmail = email.toLowerCase();

  return {
    id: authUser.id,
    email,
    fullName,
    phone,
    address,
    createdAt: authUser.created_at || profile?.created_at || null,
    updatedAt: authUser.updated_at || profile?.updated_at || null,
    isPrimaryAdmin: loweredEmail === PRIMARY_ADMIN_EMAIL,
  };
}

async function authenticateAdmin(request: Request): Promise<AdminAuthResult> {
  const config = getServerConfig();
  if (!config) {
    return {
      ok: false,
      response: NextResponse.json(
        { message: 'Supabase server config is missing.' },
        { status: 500 },
      ),
    };
  }

  const authHeader = request.headers.get('authorization') || '';
  const token = authHeader.toLowerCase().startsWith('bearer ')
    ? authHeader.slice(7).trim()
    : '';
  if (!token) {
    return {
      ok: false,
      response: NextResponse.json({ message: 'Unauthorized.' }, { status: 401 }),
    };
  }

  const anonClient = createClient(config.url, config.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const {
    data: { user },
    error,
  } = await anonClient.auth.getUser(token);

  if (error || !user) {
    return {
      ok: false,
      response: NextResponse.json({ message: 'Unauthorized.' }, { status: 401 }),
    };
  }

  const normalizedEmail = normalizeText(user.email || '').toLowerCase();
  if (normalizedEmail !== PRIMARY_ADMIN_EMAIL) {
    return {
      ok: false,
      response: NextResponse.json({ message: 'Forbidden.' }, { status: 403 }),
    };
  }

  const serviceClient = createClient(config.url, config.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return { ok: true, adminId: user.id, serviceClient };
}

export async function GET(request: Request) {
  const auth = await authenticateAdmin(request);
  if (!auth.ok) return auth.response;

  const { data: authUsersData, error: authUsersError } =
    await auth.serviceClient.auth.admin.listUsers({
      page: 1,
      perPage: 500,
    });

  if (authUsersError) {
    return NextResponse.json(
      { message: `회원 목록 조회 실패: ${authUsersError.message}` },
      { status: 500 },
    );
  }

  const authUsers = (authUsersData.users ?? []) as Array<{
    id: string;
    email?: string | null;
    user_metadata?: Record<string, unknown> | null;
    created_at?: string;
    updated_at?: string;
  }>;
  const userIds = authUsers.map((item: { id: string }) => item.id);

  let profileMap = new Map<string, ProfileRow>();
  if (userIds.length > 0) {
    const { data: profiles, error: profilesError } = await auth.serviceClient
      .from('profiles')
      .select('id, full_name, email, created_at, updated_at')
      .in('id', userIds);

    if (profilesError) {
      return NextResponse.json(
        { message: `프로필 조회 실패: ${profilesError.message}` },
        { status: 500 },
      );
    }

    profileMap = new Map(
      ((profiles || []) as ProfileRow[]).map((row: ProfileRow) => [row.id, row]),
    );
  }

  const members = authUsers
    .map((item) =>
      buildMemberResponse(
        {
          id: item.id,
          email: item.email,
          user_metadata:
            item.user_metadata && typeof item.user_metadata === 'object'
              ? (item.user_metadata as Record<string, unknown>)
              : null,
          created_at: item.created_at,
          updated_at: item.updated_at,
        },
        profileMap.get(item.id),
      ),
    )
    .sort((a: MemberResponse, b: MemberResponse) => {
      const aTime = new Date(a.createdAt || 0).getTime();
      const bTime = new Date(b.createdAt || 0).getTime();
      return bTime - aTime;
    });

  return NextResponse.json({ members });
}

export async function PATCH(request: Request) {
  const auth = await authenticateAdmin(request);
  if (!auth.ok) return auth.response;

  let payload: {
    id?: string;
    email?: string;
    fullName?: string;
    phone?: string;
    address?: string;
    password?: string;
  } = {};

  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return NextResponse.json({ message: '잘못된 요청 본문입니다.' }, { status: 400 });
  }

  const id = normalizeText(payload.id);
  if (!id) {
    return NextResponse.json({ message: '수정 대상 id가 필요합니다.' }, { status: 400 });
  }

  const email = normalizeText(payload.email);
  const fullName = normalizeText(payload.fullName);
  const phone = normalizeText(payload.phone);
  const address = normalizeText(payload.address);
  const password = normalizeText(payload.password);

  if (!email) {
    return NextResponse.json({ message: '이메일은 비워둘 수 없습니다.' }, { status: 400 });
  }

  if (password && password.length < 8) {
    return NextResponse.json(
      { message: '비밀번호는 8자 이상으로 입력하세요.' },
      { status: 400 },
    );
  }

  const { data: currentUserData, error: currentUserError } =
    await auth.serviceClient.auth.admin.getUserById(id);

  if (currentUserError || !currentUserData.user) {
    return NextResponse.json(
      { message: `대상 회원 조회 실패: ${currentUserError?.message || '사용자 없음'}` },
      { status: 404 },
    );
  }

  const currentMetadata =
    currentUserData.user.user_metadata &&
    typeof currentUserData.user.user_metadata === 'object'
      ? (currentUserData.user.user_metadata as Record<string, unknown>)
      : {};

  const nextMetadata: Record<string, unknown> = {
    ...currentMetadata,
    full_name: fullName || null,
    phone: phone || null,
    address: address || null,
  };

  const updateUserPayload: {
    email: string;
    password?: string;
    user_metadata: Record<string, unknown>;
  } = {
    email,
    user_metadata: nextMetadata,
  };
  if (password) {
    updateUserPayload.password = password;
  }

  const { data: updatedUserData, error: updateUserError } =
    await auth.serviceClient.auth.admin.updateUserById(id, updateUserPayload);

  if (updateUserError || !updatedUserData.user) {
    return NextResponse.json(
      { message: `회원 정보 수정 실패: ${updateUserError?.message || '수정 실패'}` },
      { status: 500 },
    );
  }

  const { error: profileUpsertError } = await auth.serviceClient.from('profiles').upsert(
    {
      id,
      full_name: fullName || null,
      email,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'id' },
  );

  if (profileUpsertError) {
    return NextResponse.json(
      { message: `프로필 동기화 실패: ${profileUpsertError.message}` },
      { status: 500 },
    );
  }

  const member = buildMemberResponse(
    {
      id: updatedUserData.user.id,
      email: updatedUserData.user.email,
      user_metadata:
        updatedUserData.user.user_metadata &&
        typeof updatedUserData.user.user_metadata === 'object'
          ? (updatedUserData.user.user_metadata as Record<string, unknown>)
          : null,
      created_at: updatedUserData.user.created_at,
      updated_at: updatedUserData.user.updated_at,
    },
    {
      id,
      full_name: fullName || null,
      email,
      created_at: null,
      updated_at: new Date().toISOString(),
    },
  );

  return NextResponse.json({ message: '회원 정보가 수정되었습니다.', member });
}

export async function DELETE(request: Request) {
  const auth = await authenticateAdmin(request);
  if (!auth.ok) return auth.response;

  let payload: { id?: string } = {};
  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return NextResponse.json({ message: '잘못된 요청 본문입니다.' }, { status: 400 });
  }

  const id = normalizeText(payload.id);
  if (!id) {
    return NextResponse.json({ message: '삭제 대상 id가 필요합니다.' }, { status: 400 });
  }

  if (id === auth.adminId) {
    return NextResponse.json(
      { message: '현재 로그인한 관리자 계정은 삭제할 수 없습니다.' },
      { status: 400 },
    );
  }

  const { data: currentUserData } = await auth.serviceClient.auth.admin.getUserById(id);
  const targetEmail = normalizeText(currentUserData.user?.email || '').toLowerCase();
  if (targetEmail === PRIMARY_ADMIN_EMAIL) {
    return NextResponse.json(
      { message: '주 관리자 계정은 삭제할 수 없습니다.' },
      { status: 400 },
    );
  }

  const { error: deleteError } = await auth.serviceClient.auth.admin.deleteUser(id);
  if (deleteError) {
    return NextResponse.json(
      { message: `회원 삭제 실패: ${deleteError.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({ message: '회원이 삭제되었습니다.' });
}
