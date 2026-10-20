import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import {
  appendVisitEvents,
  mergeVisitSource,
  normalizeVisitEventItem,
  normalizeVisitSource,
  parseVisitMeta,
  serializeVisitMeta,
  type VisitEventItem,
} from '@/lib/analytics/visitSource';
import { getSupabaseAdminClient } from '@/lib/supabaseAdmin';
import { requestBudget } from '@/lib/security/requestBudget';
import { readJsonObject } from '@/lib/security/requestBody';

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
  const blocked = await requestBudget(request, 'analytics-visit', 120, 60);
  if (blocked) return blocked;
  const now = new Date();
  let path = '/';
  let source = 'other';
  let incomingEvent: VisitEventItem | null = null;

  try {
    const payload = await readJsonObject(request, 4096);
    if (typeof payload?.path === 'string' && payload.path.trim()) {
      path = payload.path.trim().slice(0, 200);
    }
    if (typeof payload?.source === 'string') {
      source = normalizeVisitSource(payload.source);
    }
    if (payload?.event) {
      incomingEvent = normalizeVisitEventItem(payload.event, now.toISOString());
    }
  } catch {
    // ignore body parse errors
  }

  const visitDate = toSeoulDateKey(now);

  const cookieVisitorId = normalizeVisitorId(request.cookies.get(VISITOR_COOKIE_NAME)?.value);
  const visitorId = cookieVisitorId || randomUUID().replace(/-/g, '_');

  try {
    const supabase = getSupabaseAdminClient();

    const { data: existingRow, error: readError } = await supabase
      .from('site_daily_visitors')
      .select('hit_count,last_path')
      .eq('visit_date', visitDate)
      .eq('visitor_id', visitorId)
      .maybeSingle<{ hit_count?: number | null; last_path?: string | null }>();

    if (readError && readError.code !== 'PGRST116') {
      throw readError;
    }

    if (!existingRow) {
      const initialEvents = appendVisitEvents(undefined, incomingEvent);
      const { error: insertError } = await supabase.from('site_daily_visitors').insert({
        visit_date: visitDate,
        visitor_id: visitorId,
        first_seen_at: now.toISOString(),
        last_seen_at: now.toISOString(),
        hit_count: 1,
        last_path: serializeVisitMeta(path, source, initialEvents),
      });

      if (insertError) {
        throw insertError;
      }
    } else {
      const existingMeta = parseVisitMeta(existingRow.last_path);
      const shouldIncrementHit = !incomingEvent || incomingEvent.type === 'page_view';
      const nextHitCount = Math.max(
        1,
        Number(existingRow.hit_count || 0) + (shouldIncrementHit ? 1 : 0),
      );
      const nextSource = mergeVisitSource(existingMeta.source, source);
      const nextEvents = appendVisitEvents(existingMeta.events, incomingEvent);
      const { error: updateError } = await supabase
        .from('site_daily_visitors')
        .update({
          hit_count: nextHitCount,
          last_seen_at: now.toISOString(),
          last_path: serializeVisitMeta(path || existingMeta.path, nextSource, nextEvents),
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
