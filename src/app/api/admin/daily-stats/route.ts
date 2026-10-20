import { isPrimaryAdmin } from '@/lib/security/identity';
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { assertExpectedSupabaseProject } from '@/lib/supabase/projectGuard';
import {
  createEmptyVisitEventBreakdown,
  createEmptyVisitSourceBreakdown,
  parseVisitMeta,
  type VisitSource,
  type VisitSourceDetail,
} from '@/lib/analytics/visitSource';

const KST_DATE_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Seoul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
const KST_DATE_TIME_FORMATTER = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Asia/Seoul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});
const PAGE_SIZE = 5_000;

type DailyRow = {
  dateKst: string;
  visitorCount: number;
  pageHitCount: number;
  sourceVisitors: ReturnType<typeof createEmptyVisitSourceBreakdown>;
  sourceDetails: VisitSourceDetail[];
  eventCounts: ReturnType<typeof createEmptyVisitEventBreakdown>;
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
  const url = assertExpectedSupabaseProject(process.env.NEXT_PUBLIC_SUPABASE_URL);
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

function formatDateTimeKst(value: Date) {
  return KST_DATE_TIME_FORMATTER.format(value);
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

function appendSourceCount(
  bucket: ReturnType<typeof createEmptyVisitSourceBreakdown>,
  source: VisitSource,
  amount: number,
) {
  bucket[source] += amount;
}

function sourceDetailForVisit(meta: ReturnType<typeof parseVisitMeta>): VisitSourceDetail {
  const attribution = meta.attribution;
  const source = attribution?.source || (meta.source === 'other' ? '(legacy unknown)' : meta.source);
  const channel = attribution?.channel || (meta.source === 'other' ? 'legacy_unknown' : 'organic_social');
  const referrerHost = attribution?.referrerHost;
  const landingPath = attribution?.landingPath;
  const utmSource = attribution?.utm?.source;
  const utmMedium = attribution?.utm?.medium;
  const utmCampaign = attribution?.utm?.campaign;
  const utmContent = attribution?.utm?.content;
  const utmTerm = attribution?.utm?.term;
  const key = JSON.stringify([
    source, channel, referrerHost || '', landingPath || '',
    utmSource || '', utmMedium || '', utmCampaign || '', utmContent || '', utmTerm || '',
  ]);

  return {
    key,
    source,
    channel,
    visitorCount: 1,
    ...(referrerHost ? { referrerHost } : {}),
    ...(landingPath ? { landingPath } : {}),
    ...(utmSource ? { utmSource } : {}),
    ...(utmMedium ? { utmMedium } : {}),
    ...(utmCampaign ? { utmCampaign } : {}),
    ...(utmContent ? { utmContent } : {}),
    ...(utmTerm ? { utmTerm } : {}),
  };
}

function addSourceDetail(bucket: Map<string, VisitSourceDetail>, detail: VisitSourceDetail) {
  const stored = bucket.get(detail.key);
  bucket.set(detail.key, stored
    ? { ...stored, visitorCount: stored.visitorCount + detail.visitorCount }
    : { ...detail });
}

function sortedSourceDetails(bucket: Map<string, VisitSourceDetail>) {
  return Array.from(bucket.values()).sort((a, b) =>
    b.visitorCount - a.visitorCount || a.key.localeCompare(b.key),
  );
}

async function fetchAllRows<T>(
  fetchPage: (
    from: number,
    to: number,
  ) => Promise<{ data: T[] | null; error: { message: string; code?: string } | null }>,
) {
  const rows: T[] = [];

  for (let from = 0; ;) {
    const to = from + PAGE_SIZE - 1;
    const { data, error } = await fetchPage(from, to);

    if (error) {
      return { data: null, error };
    }

    const page = data || [];
    rows.push(...page);

    // Supabase may cap a response below the requested range. Advance by the
    // rows actually received and stop only when the following page is empty.
    if (page.length === 0) {
      return { data: rows, error: null };
    }
    from += page.length;
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

  if (authError || !user || !isPrimaryAdmin(user)) {
    return NextResponse.json({ message: 'Forbidden.' }, { status: 403 });
  }

  const serviceClient = createClient(config.url, config.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const url = new URL(request.url);
  const rawDays = Number(url.searchParams.get('days') || 7);
  const days = Math.min(31, Math.max(1, Math.trunc(rawDays || 7)));

  const todayKst = toDateKst(new Date());
  const fetchedAt = new Date();
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
        sourceDetails: [],
        eventCounts: createEmptyVisitEventBreakdown(),
        createdRoomCount: 0,
        messageCount: 0,
      },
    ]),
  );
  const sourceDetailsByDate = new Map(
    dateKstList.map((dateKst) => [dateKst, new Map<string, VisitSourceDetail>()]),
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
    const visitMeta = parseVisitMeta(row.last_path);
    appendSourceCount(bucket.sourceVisitors, visitMeta.source, 1);
    const detailBucket = sourceDetailsByDate.get(dateKst);
    if (detailBucket) addSourceDetail(detailBucket, sourceDetailForVisit(visitMeta));
    for (const evt of visitMeta.events || []) {
      if (evt.type in bucket.eventCounts) {
        bucket.eventCounts[evt.type as keyof typeof bucket.eventCounts] += 1;
      }
    }
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

  const totalSourceDetails = new Map<string, VisitSourceDetail>();
  const rows = Array.from(rowByDate.values()).map((row) => {
    row.sourceDetails = sortedSourceDetails(sourceDetailsByDate.get(row.dateKst) || new Map());
    for (const detail of row.sourceDetails) addSourceDetail(totalSourceDetails, detail);
    return row;
  });

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
      totalEventCounts: {
        tab_click: acc.totalEventCounts.tab_click + row.eventCounts.tab_click,
        category_filter: acc.totalEventCounts.category_filter + row.eventCounts.category_filter,
        product_click: acc.totalEventCounts.product_click + row.eventCounts.product_click,
        add_to_cart: acc.totalEventCounts.add_to_cart + row.eventCounts.add_to_cart,
        cart_open: acc.totalEventCounts.cart_open + row.eventCounts.cart_open,
        checkout_open: acc.totalEventCounts.checkout_open + row.eventCounts.checkout_open,
        order_submit: acc.totalEventCounts.order_submit + row.eventCounts.order_submit,
      },
      totalCreatedRooms: acc.totalCreatedRooms + row.createdRoomCount,
      totalMessages: acc.totalMessages + row.messageCount,
    }),
    {
      totalVisitors: 0,
      totalPageHits: 0,
      totalSourceVisitors: createEmptyVisitSourceBreakdown(),
      totalEventCounts: createEmptyVisitEventBreakdown(),
      totalCreatedRooms: 0,
      totalMessages: 0,
    },
  );

  return NextResponse.json({
    rows: orderedRows,
    summary: { ...summary, totalSourceDetails: sortedSourceDetails(totalSourceDetails) },
    days,
    meta: {
      timezone: 'Asia/Seoul',
      fetchedAtKst: formatDateTimeKst(fetchedAt),
      todayWindowLabelKst: `${todayKst} 00:00:00 이상 ~ ${formatDateTimeKst(fetchedAt)} 기준 누적`,
      rangeStartKst: formatDateTimeKst(oldestRange.startUtc),
      rangeEndExclusiveKst: formatDateTimeKst(latestRange.endUtc),
      rangeLabelKst: `${formatDateTimeKst(oldestRange.startUtc)} 이상 ~ ${formatDateTimeKst(
        latestRange.endUtc,
      )} 미만`,
      bucketLabelKst: '각 날짜 00:00:00 이상 ~ 다음날 00:00:00 미만',
      createdRoomRule: '생성 채팅방 = chat_rooms.created_at 기준',
      messageRule: '메시지 = chat_room_messages.created_at 기준',
      visitorRule: '방문자/페이지 hit = site_daily_visitors.visit_date 기준',
      attributionRule: '상세 유입 = 해당 날짜의 첫 식별 출처 기준. 직접·출처 없음은 이후 식별 출처로 보완될 수 있음.',
      legacyAttributionRule: '상세 유입 기록이 없는 기존 기타 방문은 소급 분류하지 않음.',
    },
  });
}
