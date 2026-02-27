import 'server-only';

import crypto from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getAccessToken } from '@/lib/naverCommerce';
import { getSupabaseAdminClient } from '@/lib/supabaseAdmin';

type JsonRecord = Record<string, unknown>;

type ImportFlagStatus = {
  imported: boolean;
  importedAt: string | null;
  count: number;
  updatedAt: string | null;
};

type CategoryResolution = {
  raw: string | null;
  normalizedName: string;
  slug: string;
};

type CategoryRule = {
  name: string;
  slug: string;
  keywords: string[];
};

const IMPORT_FLAG_KEY = 'smartstore_import';
const NAVER_SEARCH_PAGE_SIZE = 50;
const NAVER_MAX_PAGES = 500;

const CATEGORY_RULES: CategoryRule[] = [
  {
    name: '아우터',
    slug: 'outer',
    keywords: [
      '아우터',
      '자켓',
      '재킷',
      '코트',
      '점퍼',
      '패딩',
      '블루종',
      'jacket',
      'coat',
      'outer',
      'zip-up',
      'hoodie zip',
    ],
  },
  {
    name: '셔츠',
    slug: 'shirts',
    keywords: [
      '셔츠',
      '티셔츠',
      '티',
      '맨투맨',
      '탑',
      '긴팔',
      '반팔',
      'shirt',
      't-shirt',
      'tee',
      'top',
      'sweatshirt',
    ],
  },
  {
    name: '팬츠',
    slug: 'pants',
    keywords: [
      '팬츠',
      '바지',
      '청바지',
      '데님',
      '슬랙스',
      '조거',
      '쇼츠',
      '반바지',
      'pants',
      'jeans',
      'denim',
      'trousers',
      'shorts',
    ],
  },
  {
    name: '가방',
    slug: 'bags',
    keywords: [
      '가방',
      '백팩',
      '토트',
      '크로스백',
      '숄더백',
      '파우치',
      'bag',
      'backpack',
      'tote',
      'crossbody',
      'shoulder bag',
      'pouch',
    ],
  },
  {
    name: '인형',
    slug: 'dolls',
    keywords: ['인형', '봉제', '토이', 'plush', 'doll', 'toy'],
  },
  {
    name: '드레스',
    slug: 'dresses',
    keywords: ['드레스', '원피스', '스커트', 'dress', 'onepiece', 'skirt'],
  },
];

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function pickString(target: JsonRecord, keys: string[]) {
  for (const key of keys) {
    const value = target[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

function pickNumber(target: JsonRecord, keys: string[]) {
  for (const key of keys) {
    const value = toNumber(target[key]);
    if (value !== null) return value;
  }
  return null;
}

function parseMissingColumn(message: string | undefined, table: string) {
  if (!message) return null;

  const quoted = message.match(
    new RegExp(`Could not find the '([^']+)' column of '${table}'`),
  );
  if (quoted?.[1]) return quoted[1];

  const plain = message.match(/column\s+([a-zA-Z0-9_]+)\s+does not exist/i);
  if (plain?.[1]) return plain[1];

  return null;
}

function normalizeImages(detail: JsonRecord): string[] {
  const source = detail.images;
  if (!Array.isArray(source)) return [];

  const images = source
    .map((item) => {
      if (typeof item === 'string') {
        const trimmed = item.trim();
        return trimmed || null;
      }
      if (!item || typeof item !== 'object') return null;
      return pickString(item as JsonRecord, ['url', 'imageUrl', 'originUrl']);
    })
    .filter((value): value is string => Boolean(value));

  return Array.from(new Set(images));
}

function collectStringHints(value: unknown, output: string[], depth = 0) {
  if (depth > 3 || output.length >= 120 || value === null || value === undefined) {
    return;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed) output.push(trimmed);
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value.slice(0, 30)) {
      collectStringHints(item, output, depth + 1);
      if (output.length >= 120) return;
    }
    return;
  }

  if (typeof value === 'object') {
    for (const entry of Object.entries(value as JsonRecord).slice(0, 60)) {
      collectStringHints(entry[1], output, depth + 1);
      if (output.length >= 120) return;
    }
  }
}

function collectCategoryCandidates(value: unknown, output: Set<string>, depth = 0) {
  if (depth > 4 || value === null || value === undefined) return;

  if (Array.isArray(value)) {
    for (const item of value.slice(0, 30)) {
      collectCategoryCandidates(item, output, depth + 1);
    }
    return;
  }

  if (typeof value !== 'object') return;

  for (const [key, current] of Object.entries(value as JsonRecord).slice(0, 80)) {
    const isCategoryKey = /category|카테고리|분류/i.test(key);

    if (typeof current === 'string' && isCategoryKey) {
      const trimmed = current.trim();
      if (trimmed) output.add(trimmed);
    }

    if (Array.isArray(current) && isCategoryKey) {
      for (const item of current) {
        if (typeof item === 'string' && item.trim()) {
          output.add(item.trim());
        } else if (item && typeof item === 'object') {
          const nested = pickString(item as JsonRecord, [
            'name',
            'fullName',
            'categoryName',
            'wholeCategoryName',
          ]);
          if (nested) output.add(nested);
        }
      }
    }

    if (current && typeof current === 'object') {
      collectCategoryCandidates(current, output, depth + 1);
    }
  }
}

function leafCategoryName(raw: string) {
  const parts = raw
    .split(/>|\/|\||,|›|→/g)
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length === 0) return raw.trim();
  return parts[parts.length - 1];
}

function safeSlug(value: string) {
  const normalized = value
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');

  if (normalized) return normalized.slice(0, 80);
  const hash = crypto.createHash('sha1').update(value).digest('hex').slice(0, 12);
  return `cat-${hash}`;
}

function resolveCategory(summary: JsonRecord, detail: JsonRecord): CategoryResolution {
  const candidates = new Set<string>();
  const explicitHint = [
    pickString(detail, [
      'wholeCategoryName',
      'categoryName',
      'categoryPath',
      'categoryFullName',
      'leafCategoryName',
    ]),
    pickString(summary, [
      'wholeCategoryName',
      'categoryName',
      'categoryPath',
      'categoryFullName',
      'leafCategoryName',
    ]),
  ].filter((value): value is string => Boolean(value));

  for (const hint of explicitHint) candidates.add(hint);
  collectCategoryCandidates(detail, candidates);
  collectCategoryCandidates(summary, candidates);

  const ranked = Array.from(candidates)
    .map((value) => value.trim())
    .filter(Boolean)
    .sort((a, b) => {
      const score = (input: string) => {
        let value = input.length;
        if (/[>\/|]/.test(input)) value += 25;
        if (/\d/.test(input)) value -= 3;
        return value;
      };
      return score(b) - score(a);
    });

  const raw = ranked[0] || null;
  const leaf = raw ? leafCategoryName(raw) : '';

  const title = pickString(detail, ['name', 'title', 'productName']) ||
    pickString(summary, ['name', 'title', 'productName']) ||
    '';
  const hintStrings: string[] = [];
  collectStringHints(detail, hintStrings);
  const corpus = `${title} ${raw ?? ''} ${hintStrings.join(' ')}`.toLowerCase();

  for (const rule of CATEGORY_RULES) {
    if (rule.keywords.some((keyword) => corpus.includes(keyword.toLowerCase()))) {
      return { raw, normalizedName: rule.name, slug: rule.slug };
    }
  }

  const normalizedName = leaf || '기타';
  return {
    raw,
    normalizedName,
    slug: safeSlug(normalizedName),
  };
}

async function fetchNaverJson(url: string, token: string): Promise<JsonRecord> {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return (await response.json()) as JsonRecord;
}

function extractPageItems(payload: JsonRecord): JsonRecord[] {
  if (!Array.isArray(payload.contents)) return [];
  return payload.contents.filter(
    (item): item is JsonRecord => Boolean(item) && typeof item === 'object',
  );
}

function extractTotalPages(payload: JsonRecord) {
  const direct = pickNumber(payload, ['totalPages', 'totalPage']);
  if (direct) return direct;

  const pagination = payload.pagination;
  if (pagination && typeof pagination === 'object') {
    return pickNumber(pagination as JsonRecord, ['totalPages', 'totalPage']);
  }

  return null;
}

async function fetchAllProductSummaries(token: string) {
  const all: JsonRecord[] = [];

  for (let page = 1; page <= NAVER_MAX_PAGES; page += 1) {
    const response = await fetchNaverJson(
      `https://api.commerce.naver.com/external/v1/products/search?page=${page}&size=${NAVER_SEARCH_PAGE_SIZE}`,
      token,
    );
    const items = extractPageItems(response);
    if (items.length === 0) break;

    all.push(...items);

    const totalPages = extractTotalPages(response);
    if (totalPages !== null && page >= totalPages) break;
    if (items.length < NAVER_SEARCH_PAGE_SIZE) break;
  }

  return all;
}

async function ensureCategory(
  supabase: SupabaseClient,
  cache: Map<string, string>,
  resolution: CategoryResolution,
) {
  const cacheKey = resolution.slug;
  const cachedId = cache.get(cacheKey);
  if (cachedId) return cachedId;

  const existingBySlug = await supabase
    .from('product_categories')
    .select('id')
    .eq('slug', resolution.slug)
    .maybeSingle<{ id: string }>();

  if (existingBySlug.data?.id) {
    cache.set(cacheKey, existingBySlug.data.id);
    return existingBySlug.data.id;
  }

  if (existingBySlug.error && !existingBySlug.error.message.includes('slug')) {
    throw existingBySlug.error;
  }

  let payload: JsonRecord = {
    name: resolution.normalizedName,
    slug: resolution.slug,
  };

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const upsert = await supabase
      .from('product_categories')
      .upsert(payload, { onConflict: 'slug' })
      .select('id')
      .maybeSingle<{ id: string }>();

    if (upsert.data?.id) {
      cache.set(cacheKey, upsert.data.id);
      return upsert.data.id;
    }

    if (!upsert.error) {
      break;
    }

    const missing = parseMissingColumn(upsert.error.message, 'product_categories');
    if (!missing || !(missing in payload)) {
      throw upsert.error;
    }
    delete payload[missing];
  }

  const existingByName = await supabase
    .from('product_categories')
    .select('id')
    .eq('name', resolution.normalizedName)
    .maybeSingle<{ id: string }>();

  if (existingByName.error) throw existingByName.error;
  if (!existingByName.data?.id) {
    throw new Error(`category id resolve failed: ${resolution.normalizedName}`);
  }

  cache.set(cacheKey, existingByName.data.id);
  return existingByName.data.id;
}

async function upsertProductRow(supabase: SupabaseClient, basePayload: JsonRecord) {
  let payload: JsonRecord = { ...basePayload };

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const upsert = await supabase.from('products').upsert(payload, {
      onConflict: 'smartstore_channel_product_no',
    });

    if (!upsert.error) return;

    const missing = parseMissingColumn(upsert.error.message, 'products');
    if (!missing || !(missing in payload)) {
      throw upsert.error;
    }

    delete payload[missing];
  }

  throw new Error('products upsert failed: unsupported schema');
}

async function writeImportFlag(
  supabase: SupabaseClient,
  imported: number,
  failed: number,
) {
  const now = new Date().toISOString();
  let payload: JsonRecord = {
    key: IMPORT_FLAG_KEY,
    value: {
      imported: true,
      imported_at: now,
      count: imported,
      failed,
    },
    updated_at: now,
  };

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const upsert = await supabase
      .from('app_flags')
      .upsert(payload, { onConflict: 'key' });

    if (!upsert.error) return;

    const missing = parseMissingColumn(upsert.error.message, 'app_flags');
    if (!missing || !(missing in payload)) {
      throw upsert.error;
    }
    delete payload[missing];
  }

  throw new Error('app_flags upsert failed');
}

function parseImportFlagRow(row: { value?: unknown; updated_at?: unknown } | null): ImportFlagStatus {
  const value = row?.value;
  const obj = value && typeof value === 'object' ? (value as JsonRecord) : {};

  const count = toNumber(obj.count) ?? 0;
  const imported = Boolean(obj.imported);
  const importedAt =
    typeof obj.imported_at === 'string' && obj.imported_at.trim()
      ? obj.imported_at
      : null;
  const updatedAt =
    typeof row?.updated_at === 'string' && row.updated_at.trim()
      ? row.updated_at
      : null;

  return {
    imported,
    importedAt,
    count,
    updatedAt,
  };
}

export async function getSmartStoreImportStatus(): Promise<ImportFlagStatus> {
  const supabase = getSupabaseAdminClient();
  let query = await supabase
    .from('app_flags')
    .select('value, updated_at')
    .eq('key', IMPORT_FLAG_KEY)
    .maybeSingle<{ value?: unknown; updated_at?: string }>();

  if (query.error?.message?.includes('updated_at')) {
    query = await supabase
      .from('app_flags')
      .select('value')
      .eq('key', IMPORT_FLAG_KEY)
      .maybeSingle<{ value?: unknown }>();
  }

  if (query.error) {
    throw query.error;
  }

  return parseImportFlagRow(query.data ?? null);
}

export async function importAllSmartStoreProducts() {
  const supabase = getSupabaseAdminClient();
  const { access_token: accessToken } = await getAccessToken();
  const summaries = await fetchAllProductSummaries(accessToken);

  const categoryCache = new Map<string, string>();
  let imported = 0;
  let failed = 0;

  for (const summary of summaries) {
    try {
      const channelNo =
        pickNumber(summary, ['channelProductNo', 'channel_product_no']) ??
        pickNumber(summary, ['originProductNo', 'origin_product_no']);
      if (channelNo === null) continue;

      const detail = await fetchNaverJson(
        `https://api.commerce.naver.com/external/v2/products/channel-products/${channelNo}`,
        accessToken,
      );

      const category = resolveCategory(summary, detail);
      const categoryId = await ensureCategory(supabase, categoryCache, category);

      const title =
        pickString(detail, ['name', 'title', 'productName']) ??
        pickString(summary, ['name', 'title', 'productName']);
      const price =
        pickNumber(detail, ['salePrice', 'discountedSalePrice', 'price']) ??
        pickNumber(summary, ['salePrice', 'discountedSalePrice', 'price']);
      const currency =
        pickString(detail, ['currency']) ??
        pickString(summary, ['currency']) ??
        'KRW';
      const status =
        pickString(detail, ['status', 'productStatus']) ??
        pickString(summary, ['status', 'productStatus']);
      const images = normalizeImages(detail);
      const thumbnail =
        images[0] ??
        pickString(detail, ['thumbnailUrl', 'representImageUrl', 'imageUrl']) ??
        pickString(summary, ['thumbnailUrl', 'representImageUrl', 'imageUrl']);
      const detailHtml = pickString(detail, ['detailContent', 'detailHtml']);

      await upsertProductRow(supabase, {
        source: 'smartstore',
        smartstore_channel_product_no: channelNo,
        title,
        price,
        currency,
        status,
        thumbnail_url: thumbnail,
        images,
        detail_html: detailHtml,
        raw: detail,
        synced_at: new Date().toISOString(),
        category_id: categoryId,
        category_name_raw: category.raw ?? `inferred:${category.normalizedName}`,
      });

      imported += 1;
    } catch {
      failed += 1;
    }
  }

  await writeImportFlag(supabase, imported, failed);

  return {
    imported,
    failed,
    scanned: summaries.length,
  };
}

