import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import {
  createEmptyVisitSourceBreakdown,
  parseVisitMeta,
  type VisitSource,
} from '@/lib/analytics/visitSource';

const PRIMARY_ADMIN_EMAIL = 'morba9850@gmail.com';
const ADMIN_EMAIL_DOMAIN = 'enicoveck.com';
const KST_DATE_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Seoul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
const PAGE_SIZE = 5_000;

type DailyRow = {
  dateKst: string;
  visitorCount: number;
  pageHitCount: number;
  sourceVisitors: ReturnType<typeof createEmptyVisitSourceBreakdown>;
  createdRoomCount: number;
  messageCount: number;
};

type VisitorPageRow = {
  visit_date?: string | null;
  visitor_id?: string | null;
  hit_count?: number | null;
  last_path?: string | null;
};

type CreatedAtPageRow = {
  id?: number | string | null;
  created_at?: string | null;
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

function toDateKst(value: Date) {
  return KST_DATE_FORMATTER.format(value);
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

function appendSourceCount(
  bucket: ReturnType<typeof createEmptyVisitSourceBreakdown>,
  source: VisitSource,
  amount: number,
) {
  bucket[source] += amount;
}

async function fetchAllRows<T>(
  fetchPage: (
    from: number,
    to: number,
  ) => Promise<{ data: T[] | null; error: { message: string; code?: string } | null }>,
) {
  const rows: T[] = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    const to = from + PAGE_SIZE - 1;
    const { data, error } = await fetchPage(from, to);

    if (error) {
      return { data: null, error };
    }

    const page = data || [];
    rows.push(...page);

    if (page.length < PAGE_SIZE) {
      return { data: rows, error: null };
    }
  }
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
  const dateKstList = Array.from({ length: days }, (_, offset) => {
    const cursor = new Date(`${todayKst}T00:00:00+09:00`);
    cursor.setDate(cursor.getDate() - offset);
    return toDateKst(cursor);
  });

  const oldestDateKst = dateKstList[dateKstList.length - 1];
  const oldestRange = getUtcRangeForKstDate(oldestDateKst);
  const latestRange = getUtcRangeForKstDate(todayKst);

  if (!oldestRange || !latestRange) {
    return NextResponse.json({ message: '날짜 범위를 계산하지 못했습니다.' }, { status: 500 });
  }

  const rowByDate = new Map<string, DailyRow>(
    dateKstList.map((dateKst) => [
      dateKst,
      {
        dateKst,
        visitorCount: 0,
        pageHitCount: 0,
        sourceVisitors: createEmptyVisitSourceBreakdown(),
        createdRoomCount: 0,
        messageCount: 0,
      },
    ]),
  );

  const [visitorResult, roomResult, messageResult] = await Promise.all([
    fetchAllRows<VisitorPageRow>(async (from, to) =>
      await serviceClient
        .from('site_daily_visitors')
        .select('visit_date,visitor_id,hit_count,last_path')
        .gte('visit_date', oldestDateKst)
        .lte('visit_date', todayKst)
        .order('visit_date', { ascending: false })
        .order('visitor_id', { ascending: true })
        .range(from, to),
    ),
    fetchAllRows<CreatedAtPageRow>(async (from, to) =>
      await serviceClient
        .from('chat_rooms')
        .select('id,created_at')
        .gte('created_at', oldestRange.startUtc.toISOString())
        .lt('created_at', latestRange.endUtc.toISOString())
        .order('created_at', { ascending: false })
        .order('id', { ascending: true })
        .range(from, to),
    ),
    fetchAllRows<CreatedAtPageRow>(async (from, to) =>
      await serviceClient
        .from('chat_room_messages')
        .select('id,created_at')
        .gte('created_at', oldestRange.startUtc.toISOString())
        .lt('created_at', latestRange.endUtc.toISOString())
        .order('created_at', { ascending: false })
        .order('id', { ascending: true })
        .range(from, to),
    ),
  ]);

  if (visitorResult.error && visitorResult.error.code !== '42P01') {
    return NextResponse.json(
      { message: `방문자 집계 조회 실패: ${visitorResult.error.message}` },
      { status: 500 },
    );
  }

  if (roomResult.error) {
    return NextResponse.json(
      { message: `채팅방 집계 조회 실패: ${roomResult.error.message}` },
      { status: 500 },
    );
  }

  if (messageResult.error) {
    return NextResponse.json(
      { message: `메시지 집계 조회 실패: ${messageResult.error.message}` },
      { status: 500 },
    );
  }

  for (const row of visitorResult.data || []) {
    const dateKst = row.visit_date || '';
    const bucket = rowByDate.get(dateKst);
    if (!bucket) continue;

    bucket.visitorCount += 1;
    bucket.pageHitCount += Number.isFinite(Number(row.hit_count || 0))
      ? Number(row.hit_count || 0)
      : 0;
    appendSourceCount(bucket.sourceVisitors, parseVisitMeta(row.last_path).source, 1);
  }

  for (const row of roomResult.data || []) {
    if (!row.created_at) continue;
    const bucket = rowByDate.get(toDateKst(new Date(row.created_at)));
    if (!bucket) continue;
    bucket.createdRoomCount += 1;
  }

  for (const row of messageResult.data || []) {
    if (!row.created_at) continue;
    const bucket = rowByDate.get(toDateKst(new Date(row.created_at)));
    if (!bucket) continue;
    bucket.messageCount += 1;
  }

  const rows = Array.from(rowByDate.values());

  const orderedRows = rows.sort((a, b) => (a.dateKst > b.dateKst ? -1 : 1));

  const summary = orderedRows.reduce(
    (acc, row) => ({
      totalVisitors: acc.totalVisitors + row.visitorCount,
      totalPageHits: acc.totalPageHits + row.pageHitCount,
      totalSourceVisitors: {
        instagram: acc.totalSourceVisitors.instagram + row.sourceVisitors.instagram,
        youtube: acc.totalSourceVisitors.youtube + row.sourceVisitors.youtube,
        threads: acc.totalSourceVisitors.threads + row.sourceVisitors.threads,
        twitter: acc.totalSourceVisitors.twitter + row.sourceVisitors.twitter,
        other: acc.totalSourceVisitors.other + row.sourceVisitors.other,
      },
      totalCreatedRooms: acc.totalCreatedRooms + row.createdRoomCount,
      totalMessages: acc.totalMessages + row.messageCount,
    }),
    {
      totalVisitors: 0,
      totalPageHits: 0,
      totalSourceVisitors: createEmptyVisitSourceBreakdown(),
      totalCreatedRooms: 0,
      totalMessages: 0,
    },
  );

  return NextResponse.json({ rows: orderedRows, summary, days });
}
