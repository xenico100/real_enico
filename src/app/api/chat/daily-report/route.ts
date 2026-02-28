import { NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';

const DEFAULT_REPORT_RECEIVER_EMAIL = 'morba9850@gmail.com';
const APP_FLAG_KEY = 'chat_daily_report';
const RESEND_API_ENDPOINT = 'https://api.resend.com/emails';
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

type ChatMessageRow = {
  id: number;
  room_id: string;
  user_id: string;
  message: string;
  created_at: string;
};

type AppFlagRow = {
  value: {
    last_report_kst_date?: string;
  } | null;
};

function toSeoulDateKey(date: Date) {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function formatSeoulDateTime(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);

  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date);
}

function formatSeoulTime(value: string) {
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date(value));
}

function sanitizeMessage(message: string) {
  return message.replace(/\s+/g, ' ').trim();
}

function shortUserId(userId: string) {
  return userId.replace(/-/g, '').slice(0, 8);
}

function getPreviousKstDayWindow(now: Date) {
  const kstNow = new Date(now.getTime() + KST_OFFSET_MS);
  const year = kstNow.getUTCFullYear();
  const month = kstNow.getUTCMonth();
  const day = kstNow.getUTCDate();

  const startUtc = new Date(Date.UTC(year, month, day - 1, 0, 0, 0) - KST_OFFSET_MS);
  const endUtc = new Date(Date.UTC(year, month, day, 0, 0, 0) - KST_OFFSET_MS);
  const reportDateKst = toSeoulDateKey(startUtc);

  return {
    reportDateKst,
    windowStart: startUtc,
    windowEnd: endUtc,
  };
}

function buildReport(messages: ChatMessageRow[], windowStart: Date, windowEnd: Date) {
  const groupedByRoom = new Map<string, ChatMessageRow[]>();

  for (const row of messages) {
    const target = groupedByRoom.get(row.room_id);
    if (target) {
      target.push(row);
      continue;
    }

    groupedByRoom.set(row.room_id, [row]);
  }

  const roomSummaries = Array.from(groupedByRoom.entries()).sort((a, b) => b[1].length - a[1].length);

  return {
    groupedByRoom,
    roomSummaries,
    textHeader: [
      '[ENICO VECK 단체랜덤채팅 일일 리포트]',
      `생성 시각(KST): ${formatSeoulDateTime(new Date())}`,
      `리포트 날짜(KST): ${toSeoulDateKey(windowStart)}`,
      `집계 구간(KST): ${formatSeoulDateTime(windowStart)} ~ ${formatSeoulDateTime(windowEnd)}`,
      `총 메시지: ${messages.length}개`,
      '',
    ],
  };
}

function authorizeCronRequest(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json(
        {
          ok: false,
          error: 'cron_secret_missing',
          message: 'CRON_SECRET 환경변수가 필요합니다.',
        },
        { status: 500 },
      );
    }

    return null;
  }

  const authHeader = request.headers.get('authorization') || '';
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json(
      {
        ok: false,
        error: 'unauthorized',
      },
      { status: 401 },
    );
  }

  return null;
}

async function sendDigestEmail({
  subject,
  text,
}: {
  subject: string;
  text: string;
}) {
  const resendApiKey = process.env.RESEND_API_KEY;
  if (!resendApiKey) {
    throw new Error('RESEND_API_KEY 환경변수가 필요합니다.');
  }

  const from = (
    process.env.CHAT_REPORT_FROM_EMAIL ||
    process.env.ORDER_FROM_EMAIL ||
    'Enico Veck Chat <onboarding@resend.dev>'
  ).trim();

  const to = (process.env.CHAT_DAILY_REPORT_TO || DEFAULT_REPORT_RECEIVER_EMAIL).trim();

  const response = await fetch(RESEND_API_ENDPOINT, {
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
    }),
  });

  const payload = (await response.json().catch(() => null)) as
    | {
        error?: {
          message?: string;
        };
      }
    | null;

  if (!response.ok) {
    throw new Error(payload?.error?.message || '메일 발송 API 응답 오류');
  }
}

async function handleReport(request: Request) {
  const authorizationResponse = authorizeCronRequest(request);
  if (authorizationResponse) {
    return authorizationResponse;
  }

  try {
    const supabase = getSupabaseAdminClient();
    const now = new Date();
    const { reportDateKst, windowStart, windowEnd } = getPreviousKstDayWindow(now);

    const { searchParams } = new URL(request.url);
    const force = searchParams.get('force') === '1';

    if (!force) {
      const { data: existingFlag, error: existingFlagError } = await supabase
        .from('app_flags')
        .select('value')
        .eq('key', APP_FLAG_KEY)
        .maybeSingle<AppFlagRow>();

      if (existingFlagError) {
        throw new Error(`app_flags 조회 실패: ${existingFlagError.message}`);
      }

      const alreadySentDate = existingFlag?.value?.last_report_kst_date || '';
      if (alreadySentDate === reportDateKst) {
        return NextResponse.json({
          ok: true,
          skipped: true,
          reason: 'already_sent_for_report_date',
          reportDateKst,
        });
      }
    }

    const { data: messageRows, error: messageError } = await supabase
      .from('chat_room_messages')
      .select('id, room_id, user_id, message, created_at')
      .gte('created_at', windowStart.toISOString())
      .lt('created_at', windowEnd.toISOString())
      .order('created_at', { ascending: true })
      .limit(10_000);

    if (messageError) {
      throw new Error(`채팅 메시지 조회 실패: ${messageError.message}`);
    }

    const messages = ((messageRows || []) as ChatMessageRow[]).map((row) => ({
      ...row,
      message: sanitizeMessage(row.message),
    }));

    const { groupedByRoom, roomSummaries, textHeader } = buildReport(messages, windowStart, windowEnd);

    const { count: createdRoomCount, error: roomCountError } = await supabase
      .from('chat_rooms')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', windowStart.toISOString())
      .lt('created_at', windowEnd.toISOString());

    if (roomCountError) {
      throw new Error(`채팅방 수 조회 실패: ${roomCountError.message}`);
    }

    let visitorCount = 0;
    let visitorHitCount = 0;
    let visitorNote: string | null = null;

    const { count: visitorCountValue, error: visitorCountError } = await supabase
      .from('site_daily_visitors')
      .select('*', { count: 'exact', head: true })
      .eq('visit_date', reportDateKst);

    if (visitorCountError) {
      if (visitorCountError.code === '42P01') {
        visitorNote = 'site_daily_visitors 테이블이 없어 방문자 수를 집계하지 못했습니다.';
      } else {
        throw new Error(`방문자 수 조회 실패: ${visitorCountError.message}`);
      }
    } else {
      visitorCount = visitorCountValue || 0;

      const { data: visitorRows, error: visitorRowsError } = await supabase
        .from('site_daily_visitors')
        .select('hit_count')
        .eq('visit_date', reportDateKst)
        .limit(20_000);

      if (visitorRowsError) {
        throw new Error(`방문 hit 수 조회 실패: ${visitorRowsError.message}`);
      }

      visitorHitCount = (visitorRows || []).reduce((sum, row) => {
        const next = Number((row as { hit_count?: number }).hit_count || 0);
        return sum + (Number.isFinite(next) ? next : 0);
      }, 0);
    }

    const roomIds = Array.from(groupedByRoom.keys());
    const memberCountByRoom = new Map<string, number>();

    if (roomIds.length > 0) {
      const { data: memberRows, error: memberError } = await supabase
        .from('chat_room_members')
        .select('room_id')
        .in('room_id', roomIds);

      if (memberError) {
        throw new Error(`채팅 멤버 조회 실패: ${memberError.message}`);
      }

      for (const row of memberRows || []) {
        const roomId = (row as { room_id?: string }).room_id;
        if (!roomId) continue;
        memberCountByRoom.set(roomId, (memberCountByRoom.get(roomId) || 0) + 1);
      }
    }

    const lines: string[] = [...textHeader];

    lines.push(`해당일 생성 채팅방: ${createdRoomCount || 0}개`);
    lines.push(`메시지 발생 채팅방: ${groupedByRoom.size}개`);
    lines.push(`해당일 사이트 방문자(중복 제거): ${visitorCount}명`);
    lines.push(`해당일 페이지 방문 hit 수: ${visitorHitCount}회`);
    if (visitorNote) {
      lines.push(`방문자 집계 참고: ${visitorNote}`);
    }
    lines.push('');

    if (messages.length === 0) {
      lines.push('해당일 채팅 메시지가 없습니다.');
    } else {
      roomSummaries.forEach(([roomId, roomMessages], index) => {
        lines.push(
          `방 ${index + 1} | ${roomId.slice(0, 8)} | 메시지 ${roomMessages.length}개 | 참여자 ${
            memberCountByRoom.get(roomId) || 0
          }명`,
        );

        roomMessages.forEach((row) => {
          lines.push(`[${formatSeoulTime(row.created_at)}] ${shortUserId(row.user_id)}: ${row.message}`);
        });

        lines.push('');
      });
    }

    const subject = `[단체랜덤채팅] ${reportDateKst} 리포트`;
    const text = lines.join('\n');

    await sendDigestEmail({ subject, text });

    const flagValue = {
      imported: true,
      last_report_kst_date: reportDateKst,
      last_sent_at: now.toISOString(),
      message_count: messages.length,
      room_count_with_messages: groupedByRoom.size,
      room_count_created: createdRoomCount || 0,
      visitor_count: visitorCount,
      visitor_hit_count: visitorHitCount,
      window_start: windowStart.toISOString(),
      window_end: windowEnd.toISOString(),
    };

    const { error: updateFlagError } = await supabase.from('app_flags').upsert(
      {
        key: APP_FLAG_KEY,
        value: flagValue,
        updated_at: now.toISOString(),
      },
      { onConflict: 'key' },
    );

    if (updateFlagError) {
      throw new Error(`app_flags 업데이트 실패: ${updateFlagError.message}`);
    }

    return NextResponse.json({
      ok: true,
      sent: true,
      to: (process.env.CHAT_DAILY_REPORT_TO || DEFAULT_REPORT_RECEIVER_EMAIL).trim(),
      reportDateKst,
      messages: messages.length,
      roomsWithMessages: groupedByRoom.size,
      roomsCreated: createdRoomCount || 0,
      visitorCount,
      visitorHitCount,
      windowStart: windowStart.toISOString(),
      windowEnd: windowEnd.toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'daily_report_failed',
      },
      { status: 500 },
    );
  }
}

export async function GET(request: Request) {
  return handleReport(request);
}

export async function POST(request: Request) {
  return handleReport(request);
}
