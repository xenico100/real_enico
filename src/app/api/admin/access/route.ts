import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const PRIMARY_ADMIN_EMAIL = 'morba9850@gmail.com';
const ADMIN_EMAIL_DOMAIN = 'enicoveck.com';
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
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !anonKey || !serviceRoleKey) {
    return null;
  }

  return { url, anonKey, serviceRoleKey };
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

  const serviceClient = createClient(config.url, config.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: adminRow, error: adminError } = await serviceClient
    .from('admins')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (adminError) {
    return jsonResponse({ message: 'Unable to verify admin access.' }, 500);
  }

  const normalizedEmail = (user.email || '').trim().toLowerCase();
  const isPrimaryAdmin = normalizedEmail === PRIMARY_ADMIN_EMAIL;
  const hasCompanyEmail = normalizedEmail.endsWith(`@${ADMIN_EMAIL_DOMAIN}`);
  const isCatalogAdmin = Boolean(adminRow?.user_id);

  return jsonResponse({
    canManageCatalog: isPrimaryAdmin || isCatalogAdmin,
    canManageMembers: isPrimaryAdmin,
    canManageOrders: isPrimaryAdmin,
    canViewDailyStats: isPrimaryAdmin || hasCompanyEmail,
  });
}
