import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const PRIMARY_ADMIN_EMAIL = 'morba9850@gmail.com';
const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store',
};

type AdminCapabilities = {
  canManageCatalog: boolean;
  canManageMembers: boolean;
  canManageOrders: boolean;
  canViewDailyStats: boolean;
};

function jsonResponse(
  body: AdminCapabilities | { message: string },
  status = 200,
) {
  return NextResponse.json(body, {
    status,
    headers: NO_STORE_HEADERS,
  });
}

function getServerConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return null;
  }

  return { url, anonKey };
}

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const config = getServerConfig();
  if (!config) {
    return jsonResponse({ message: 'Supabase server config is missing.' }, 500);
  }

  const authHeader = request.headers.get('authorization') || '';
  const token = authHeader.toLowerCase().startsWith('bearer ')
    ? authHeader.slice(7).trim()
    : '';

  if (!token) {
    return jsonResponse({ message: 'Unauthorized.' }, 401);
  }

  const anonClient = createClient(config.url, config.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const {
    data: { user },
    error: authError,
  } = await anonClient.auth.getUser(token);

  if (authError || !user) {
    return jsonResponse({ message: 'Unauthorized.' }, 401);
  }

  const normalizedEmail = (user.email || '').trim().toLowerCase();
  if (normalizedEmail !== PRIMARY_ADMIN_EMAIL) {
    return jsonResponse({ message: 'Forbidden.' }, 403);
  }

  return jsonResponse({
    canManageCatalog: true,
    canManageMembers: true,
    canManageOrders: true,
    canViewDailyStats: true,
  });
}
