import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import {
  appendVisitEvents,
  mergeVisitAttribution,
  mergeVisitSource,
  normalizeVisitAttribution,
  normalizeVisitEventItem,
  normalizeVisitSource,
  parseVisitMeta,
  serializeVisitMeta,
  type VisitAttribution,
  type VisitEventItem,
  type VisitSource,
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

function resolveVisitAcquisition(
  stored: ReturnType<typeof parseVisitMeta>,
  incomingSource: string,
  incomingAttribution: VisitAttribution | undefined,
): { source: VisitSource; attribution?: VisitAttribution } {
  // A legacy identified source is already the first known acquisition. Later
  // evidence must not attach unrelated campaign details to that old source.
  if (!stored.attribution && stored.source !== 'other') {
    return { source: stored.source };
  }

  const incomingLegacySource = incomingAttribution
    ? normalizeVisitSource(incomingAttribution.source)
    : normalizeVisitSource(incomingSource);

  // Older clients can identify a social source without detailed attribution.
  // Keep that evidence instead of retaining contradictory direct metadata.
  if (stored.attribution?.method === 'direct' && !incomingAttribution && incomingLegacySource !== 'other') {
    return { source: incomingLegacySource };
  }

  // A later untagged page cannot retroactively classify a legacy unknown visit.
  const attribution = !stored.attribution && incomingAttribution?.method === 'direct'
    ? undefined
    : mergeVisitAttribution(stored.attribution, incomingAttribution);

  return {
    source: attribution
      ? normalizeVisitSource(attribution.source)
      : mergeVisitSource(stored.source, incomingLegacySource),
    ...(attribution ? { attribution } : {}),
  };
}

export async function POST(request: NextRequest) {
  const blocked = await requestBudget(request, 'analytics-visit', 120, 60);
  if (blocked) return blocked;
  const now = new Date();
  let path = '/';
  let source = 'other';
  let incomingEvent: VisitEventItem | null = null;
  let incomingAttribution: VisitAttribution | undefined;

  try {
    const payload = await readJsonObject(request, 8192);
    if (typeof payload?.path === 'string' && payload.path.trim()) {
      path = payload.path.trim().slice(0, 200);
    }
    if (typeof payload?.source === 'string') {
      source = normalizeVisitSource(payload.source);
    }
    if (payload?.event) {
      incomingEvent = normalizeVisitEventItem(payload.event, now.toISOString());
    }
    incomingAttribution = normalizeVisitAttribution(payload?.attribution);
  } catch {
    // ignore body parse errors
  }

  const visitDate = toSeoulDateKey(now);

  const cookieVisitorId = normalizeVisitorId(request.cookies.get(VISITOR_COOKIE_NAME)?.value);
  const visitorId = cookieVisitorId || randomUUID().replace(/-/g, '_');

  try {
    const supabase = getSupabaseAdminClient();

    let saved = false;
    // Use a monotonic last_seen_at revision so simultaneous page and product
    // events cannot overwrite the first identified acquisition or each other.
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const { data: existingRow, error: readError } = await supabase
        .from('site_daily_visitors')
        .select('hit_count,last_path,last_seen_at')
        .eq('visit_date', visitDate)
        .eq('visitor_id', visitorId)
        .maybeSingle<{
          hit_count?: number | null;
          last_path?: string | null;
          last_seen_at?: string | null;
        }>();

      if (readError && readError.code !== 'PGRST116') {
        throw readError;
      }

      if (!existingRow) {
        const initialEvents = appendVisitEvents(undefined, incomingEvent);
        const initialSource = incomingAttribution ? normalizeVisitSource(incomingAttribution.source) : source;
        const { error: insertError } = await supabase.from('site_daily_visitors').insert({
          visit_date: visitDate,
          visitor_id: visitorId,
          first_seen_at: now.toISOString(),
          last_seen_at: now.toISOString(),
          hit_count: 1,
          last_path: serializeVisitMeta(path, initialSource, initialEvents, incomingAttribution),
        });

        if (insertError?.code === '23505') continue;
        if (insertError) throw insertError;
        saved = true;
        break;
      }

      const existingMeta = parseVisitMeta(existingRow.last_path);
      const shouldIncrementHit = !incomingEvent || incomingEvent.type === 'page_view';
      const nextHitCount = Math.max(
        1,
        Number(existingRow.hit_count || 0) + (shouldIncrementHit ? 1 : 0),
      );
      const nextEvents = appendVisitEvents(existingMeta.events, incomingEvent);
      const nextAcquisition = resolveVisitAcquisition(existingMeta, source, incomingAttribution);
      const previousSeenAt = Date.parse(existingRow.last_seen_at || '');
      const nextSeenAt = new Date(Math.max(
        now.getTime(),
        Number.isFinite(previousSeenAt) ? previousSeenAt + 1 : 0,
      )).toISOString();
      let update = supabase
        .from('site_daily_visitors')
        .update({
          hit_count: nextHitCount,
          last_seen_at: nextSeenAt,
          last_path: serializeVisitMeta(
            path || existingMeta.path,
            nextAcquisition.source,
            nextEvents,
            nextAcquisition.attribution,
          ),
        })
        .eq('visit_date', visitDate)
        .eq('visitor_id', visitorId);

      update = existingRow.hit_count == null
        ? update.is('hit_count', null)
        : update.eq('hit_count', existingRow.hit_count);
      update = existingRow.last_seen_at == null
        ? update.is('last_seen_at', null)
        : update.eq('last_seen_at', existingRow.last_seen_at);

      const { data: updatedRow, error: updateError } = await update
        .select('visitor_id')
        .maybeSingle<{ visitor_id: string }>();

      if (updateError) throw updateError;
      if (!updatedRow) continue;
      saved = true;
      break;
    }

    if (!saved) throw new Error('visit_tracking_conflict');

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
