import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAccessToken } from '@/lib/naverCommerce';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  : null;

async function fetchJson(url: string, token: string) {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });

  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<Record<string, unknown>>;
}

function toNumber(value: unknown) {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function pickString(target: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = target[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

function pickNumber(target: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const numeric = toNumber(target[key]);
    if (numeric !== null) return numeric;
  }
  return null;
}

function normalizeImages(detail: Record<string, unknown>) {
  const images = detail.images;
  if (!Array.isArray(images)) return [];

  return images
    .map((image) => {
      if (!image || typeof image !== 'object') return null;
      const record = image as Record<string, unknown>;
      return pickString(record, ['url', 'imageUrl', 'originUrl']);
    })
    .filter((item): item is string => Boolean(item));
}

export async function POST() {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json(
      { ok: false, error: 'dev_only' },
      { status: 403 },
    );
  }

  try {
    if (!supabase) {
      return NextResponse.json(
        {
          ok: false,
          error: 'missing_env',
          message: 'SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY 환경변수가 필요합니다.',
        },
        { status: 500 },
      );
    }

    const { access_token } = await getAccessToken();

    const list = await fetchJson(
      'https://api.commerce.naver.com/external/v1/products/search?page=1&size=50',
      access_token,
    );

    const contents = Array.isArray(list.contents) ? list.contents : [];
    let syncedCount = 0;

    for (const it of contents) {
      if (!it || typeof it !== 'object') continue;
      const item = it as Record<string, unknown>;
      const channelNo =
        pickNumber(item, ['channelProductNo', 'channel_product_no']) ||
        pickNumber(item, ['originProductNo', 'origin_product_no']);

      if (!channelNo) continue;

      const detail = await fetchJson(
        `https://api.commerce.naver.com/external/v2/products/channel-products/${channelNo}`,
        access_token,
      );

      const title = pickString(detail, ['name', 'title', 'productName']);
      const price = pickNumber(detail, ['salePrice', 'discountedSalePrice', 'price']);
      const images = normalizeImages(detail);
      const thumbnail =
        images[0] ||
        pickString(detail, ['thumbnailUrl', 'representImageUrl', 'imageUrl']);
      const detailHtml = pickString(detail, ['detailContent', 'detailHtml']);

      const { error } = await supabase.from('products').upsert(
        {
          source: 'smartstore',
          smartstore_channel_product_no: channelNo,
          title,
          price,
          thumbnail_url: thumbnail,
          images,
          detail_html: detailHtml,
          raw: detail,
          synced_at: new Date().toISOString(),
        },
        {
          onConflict: 'smartstore_channel_product_no',
        },
      );

      if (error) {
        throw error;
      }
      syncedCount += 1;
    }

    return NextResponse.json({ ok: true, count: syncedCount });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: 'sync_failed',
        message: error instanceof Error ? error.message : 'sync failed',
      },
      { status: 500 },
    );
  }
}
