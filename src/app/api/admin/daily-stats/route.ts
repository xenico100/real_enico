import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const PRIMARY_ADMIN_EMAIL = 'morba9850@gmail.com';
const ADMIN_EMAIL_DOMAIN = 'enicoveck.com';

function getServerConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !anonKey || !serviceRoleKey) {
    return null;
  }

  return { url, anonKey, serviceRoleKey };
}

function toDateKst(value: Date) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  return formatter.format(value);
}

function getUtcRangeForKstDate(dateKst: string) {
  const [yearText, monthText, dayText] = dateKst.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);

  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return null;
  }

  const startUtc = new Date(Date.UTC(year, month - 1, day, -9, 0, 0, 0));
  const endUtc = new Date(startUtc.getTime() + 24 * 60 * 60 * 1000);

  return { startUtc, endUtc };
}

function isAdminEmail(email: string | null | undefined) {
  const normalized = (email || '').trim().toLowerCase();
  if (!normalized) return false;
  return normalized === PRIMARY_ADMIN_EMAIL || normalized.endsWith(`@${ADMIN_EMAIL_DOMAIN}`);
}

export async function GET(request: Request) {
  const config = getServerConfig();
  if (!config) {
    return NextResponse.json({ message: 'Supabase server config is missing.' }, { status: 500 });
  }

  const authHeader = request.headers.get('authorization') || '';
  const token = authHeader.toLowerCase().startsWith('bearer ')
    ? authHeader.slice(7).trim()
    : '';

  if (!token) {
    return NextResponse.json({ message: 'Unauthorized.' }, { status: 401 });
  }

  const anonClient = createClient(config.url, config.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const {
    data: { user },
    error: authError,
  } = await anonClient.auth.getUser(token);

  if (authError || !user || !isAdminEmail(user.email)) {
    return NextResponse.json({ message: 'Forbidden.' }, { status: 403 });
  }

  const serviceClient = createClient(config.url, config.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const url = new URL(request.url);
  const rawDays = Number(url.searchParams.get('days') || 7);
  const days = Math.min(31, Math.max(1, Math.trunc(rawDays || 7)));

  const todayKst = toDateKst(new Date());
  const rows: Array<{
    dateKst: string;
    visitorCount: number;
    pageHitCount: number;
    createdRoomCount: number;
    messageCount: number;
  }> = [];

  for (let offset = 0; offset < days; offset += 1) {
    const cursor = new Date(`${todayKst}T00:00:00+09:00`);
    cursor.setDate(cursor.getDate() - offset);
    const dateKst = toDateKst(cursor);
    const range = getUtcRangeForKstDate(dateKst);
    if (!range) continue;

    let visitorCount = 0;
    let pageHitCount = 0;

    const { data: visitorRows, error: visitorsError } = await serviceClient
      .from('site_daily_visitors')
      .select('hit_count')
      .eq('visit_date', dateKst)
      .limit(50000);

    if (visitorsError && visitorsError.code !== '42P01') {
      return NextResponse.json(
        { message: `방문자 집계 조회 실패(${dateKst}): ${visitorsError.message}` },
        { status: 500 },
      );
    }

    if (!visitorsError) {
      visitorCount = (visitorRows || []).length;
      pageHitCount = (visitorRows || []).reduce((sum: number, row: { hit_count?: number }) => {
        const hitCount = Number(row.hit_count || 0);
        return sum + (Number.isFinite(hitCount) ? hitCount : 0);
      }, 0);
    }

    const { count: createdRoomCountValue, error: roomError } = await serviceClient
      .from('chat_rooms')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', range.startUtc.toISOString())
      .lt('created_at', range.endUtc.toISOString());

    if (roomError) {
      return NextResponse.json(
        { message: `채팅방 집계 조회 실패(${dateKst}): ${roomError.message}` },
        { status: 500 },
      );
    }

    const { count: messageCountValue, error: messageError } = await serviceClient
      .from('chat_room_messages')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', range.startUtc.toISOString())
      .lt('created_at', range.endUtc.toISOString());

    if (messageError) {
      return NextResponse.json(
        { message: `메시지 집계 조회 실패(${dateKst}): ${messageError.message}` },
        { status: 500 },
      );
    }

    rows.push({
      dateKst,
      visitorCount,
      pageHitCount,
      createdRoomCount: createdRoomCountValue || 0,
      messageCount: messageCountValue || 0,
    });
  }

  const orderedRows = rows.sort((a, b) => (a.dateKst > b.dateKst ? -1 : 1));

  const summary = orderedRows.reduce(
    (acc, row) => ({
      totalVisitors: acc.totalVisitors + row.visitorCount,
      totalPageHits: acc.totalPageHits + row.pageHitCount,
      totalCreatedRooms: acc.totalCreatedRooms + row.createdRoomCount,
      totalMessages: acc.totalMessages + row.messageCount,
    }),
    {
      totalVisitors: 0,
      totalPageHits: 0,
      totalCreatedRooms: 0,
      totalMessages: 0,
    },
  );

  return NextResponse.json({ rows: orderedRows, summary, days });
}
