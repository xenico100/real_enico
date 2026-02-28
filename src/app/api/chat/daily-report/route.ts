import { NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';

const DEFAULT_REPORT_RECEIVER_EMAIL = 'morba9850@gmail.com';
const APP_FLAG_KEY = 'chat_daily_report';
const RESEND_API_ENDPOINT = 'https://api.resend.com/emails';

type ChatMessageRow = {
  id: number;
  room_id: string;
  user_id: string;
  message: string;
  created_at: string;
};

type AppFlagRow = {
  value: {
    last_sent_kst_date?: string;
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
      `생성 시각(KST): ${formatSeoulDateTime(windowEnd)}`,
      `집계 구간(KST): ${formatSeoulDateTime(windowStart)} ~ ${formatSeoulDateTime(windowEnd)}`,
      `총 메시지: ${messages.length}개`,
      `활성 방 수: ${groupedByRoom.size}개`,
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
    const windowEnd = now;
    const windowStart = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const nowKstDate = toSeoulDateKey(now);

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

      const alreadySentDate = existingFlag?.value?.last_sent_kst_date || '';
      if (alreadySentDate === nowKstDate) {
        return NextResponse.json({
          ok: true,
          skipped: true,
          reason: 'already_sent_today',
          kstDate: nowKstDate,
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

    if (messages.length === 0) {
      lines.push('지난 24시간 동안 채팅 메시지가 없습니다.');
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

    const subject = `[단체랜덤채팅] 일일 리포트 (${nowKstDate})`;
    const text = lines.join('\n');

    await sendDigestEmail({ subject, text });

    const flagValue = {
      imported: true,
      last_sent_kst_date: nowKstDate,
      last_sent_at: now.toISOString(),
      message_count: messages.length,
      room_count: groupedByRoom.size,
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
      kstDate: nowKstDate,
      messages: messages.length,
      rooms: groupedByRoom.size,
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
