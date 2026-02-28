import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';

const VISITOR_COOKIE_NAME = 'enico_vid';

function toSeoulDateKey(date: Date) {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function normalizeVisitorId(value: string | undefined) {
  if (!value) return '';
  const normalized = value.trim();
  if (!normalized) return '';
  if (!/^[a-zA-Z0-9_-]{8,128}$/.test(normalized)) return '';
  return normalized;
}

export async function POST(request: NextRequest) {
  let path = '/';

  try {
    const payload = (await request.json()) as { path?: unknown };
    if (typeof payload?.path === 'string' && payload.path.trim()) {
      path = payload.path.trim().slice(0, 200);
    }
  } catch {
    // ignore body parse errors
  }

  const now = new Date();
  const visitDate = toSeoulDateKey(now);

  const cookieVisitorId = normalizeVisitorId(request.cookies.get(VISITOR_COOKIE_NAME)?.value);
  const visitorId = cookieVisitorId || randomUUID().replace(/-/g, '_');

  try {
    const supabase = getSupabaseAdminClient();

    const { data: existingRow, error: readError } = await supabase
      .from('site_daily_visitors')
      .select('hit_count')
      .eq('visit_date', visitDate)
      .eq('visitor_id', visitorId)
      .maybeSingle<{ hit_count?: number | null }>();

    if (readError && readError.code !== 'PGRST116') {
      throw readError;
    }

    if (!existingRow) {
      const { error: insertError } = await supabase.from('site_daily_visitors').insert({
        visit_date: visitDate,
        visitor_id: visitorId,
        first_seen_at: now.toISOString(),
        last_seen_at: now.toISOString(),
        hit_count: 1,
        last_path: path,
      });

      if (insertError) {
        throw insertError;
      }
    } else {
      const nextHitCount = Math.max(1, Number(existingRow.hit_count || 0) + 1);
      const { error: updateError } = await supabase
        .from('site_daily_visitors')
        .update({
          hit_count: nextHitCount,
          last_seen_at: now.toISOString(),
          last_path: path,
        })
        .eq('visit_date', visitDate)
        .eq('visitor_id', visitorId);

      if (updateError) {
        throw updateError;
      }
    }

    const response = NextResponse.json({ ok: true, visitDate });

    if (!cookieVisitorId) {
      response.cookies.set({
        name: VISITOR_COOKIE_NAME,
        value: visitorId,
        maxAge: 60 * 60 * 24 * 365 * 2,
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
      });
    }

    return response;
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'visit_tracking_failed',
      },
      { status: 500 },
    );
  }
}
