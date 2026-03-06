import {
  DEFAULT_PRODUCT_CATEGORY,
  isProductCategory,
  type ProductCategory,
} from '@/app/constants/productCategories';
import type { StorefrontProductRow } from '@/lib/storefront/shared';

export interface Product {
  id: string;
  name: string;
  category: string;
  price: number;
  image: string;
  images: string[];
  description: string;
  apparelSpecs?: string;
  updatedAt?: string | null;
  isSoldOut?: boolean;
  smartstoreUrl?: string;
}

const FALLBACK_IMAGE_URL =
  'https://dummyimage.com/600x800/101010/8a8a8a&text=ENICO+VECK';

const UPLOAD_TITLE_CATEGORY_HINTS: Array<{ title: string; category: ProductCategory }> = [
  { title: 'enico MIX shirts', category: '셔츠' },
  { title: 'INFINITY CASTLE Crop Shirts', category: '셔츠' },
  { title: 'Ben’s Shirts', category: '셔츠' },
  { title: 'Re: kevin shirts', category: '셔츠' },
  { title: 'Flannel double-label shirt', category: '셔츠' },
  { title: 'enico damm denim jacket', category: '아우터' },
  { title: 'Enico Veck 1st Linen Jacket', category: '아우터' },
  { title: 'enico veck’s denim hood jacket', category: '아우터' },
  { title: 'enico veck 2025 denim jacket', category: '아우터' },
  { title: 'BERSERK Jacket', category: '아우터' },
  { title: 'INFINITY CASTLE Kimono', category: '아우터' },
  { title: 'Mononoke Jacket', category: '아우터' },
  { title: 'Roronoa Coat', category: '아우터' },
  { title: 'Akira Jacket', category: '아우터' },
  { title: 'EVA-JACEKT', category: '아우터' },
  { title: 'Re: flower of evil jacket', category: '아우터' },
  { title: 'enico MIX pants', category: '팬츠' },
  { title: 'BERSERK Pants', category: '팬츠' },
  { title: 'INFINITY CASTLE Shorts', category: '팬츠' },
  { title: 'Ben’s Cago Pants', category: '팬츠' },
  { title: 'Mononoke Pants', category: '팬츠' },
  { title: "Re: kevin's pants", category: '팬츠' },
  { title: 'BOMB DEVIL Dress+Choker', category: '드레스' },
  { title: '퍼펙트 블루의 가면', category: '악세사리' },
  { title: 'Mononoke Bolero', category: '악세사리' },
  { title: '가치아쿠타의 장갑', category: '악세사리' },
  { title: 'Knit Shark', category: '인형' },
  { title: 'Night Kitty', category: '인형' },
  { title: 'Night Face', category: '인형' },
  { title: 'Night Dee', category: '인형' },
  { title: 'Check Shark', category: '인형' },
  { title: 'Check Kitty', category: '인형' },
  { title: 'Desert Bat', category: '인형' },
  { title: 'Desert Dee', category: '인형' },
  { title: 'Desert Angry Shark', category: '인형' },
  { title: 'Enico Dee', category: '인형' },
  { title: '2Face Shark', category: '인형' },
  { title: 'Where GA-O-RI', category: '인형' },
];

const IMAGE_PATH_CATEGORY_HINTS: Array<{ markers: string[]; category: ProductCategory }> = [
  { markers: ['/manual-upload/outer/', '/manual-jackets/'], category: '아우터' },
  { markers: ['/manual-upload/shirts/'], category: '셔츠' },
  { markers: ['/manual-upload/pants/'], category: '팬츠' },
  { markers: ['/manual-upload/bags/'], category: '가방' },
  {
    markers: ['/manual-upload/accessories/', '/manual-upload/accessory/'],
    category: '악세사리',
  },
  { markers: ['/manual-upload/dolls/', '/manual-dolls/'], category: '인형' },
  { markers: ['/manual-upload/dresses/'], category: '드레스' },
];

const CSV_LATEST_TITLE_ORDER = [
  'Re: flower of evil jacket',
  'Re: kevin shirts',
  "Re: kevin's pants",
  'Roronoa Coat',
  '가치아쿠타의 장갑',
  'Mononoke Jacket',
  'Mononoke Pants',
  'Mononoke Bolero',
  '퍼펙트 블루의 가면',
  'enico MIX shirts',
  'Knit Shark',
  'enico veck 2025 denim jacket',
  'enico veck’s denim hood jacket',
  'enico damm denim jacket',
  'BOMB DEVIL Dress+Choker',
  'Ben’s Shirts',
  'Ben’s Cago Pants',
  'INFINITY CASTLE Shorts',
  'INFINITY CASTLE Crop Shirts',
  'INFINITY CASTLE Kimono',
  'BERSERK Jacket',
  'Night Kitty',
  'Night Dee',
  'Check Kitty',
  'Enico Dee',
  'Where GA-O-RI',
] as const;

const SOLD_OUT_PRODUCT_TITLES = [
  'EVA-JACEKT',
  'Akira Jacket',
  'Flannel double-label shirt',
  'eco bag',
  'Blue Flower Shoulder bag',
  'enico MIX pants',
  'BERSERK Pants',
  'Night Face',
  'Check Shark',
  'Desert Bat',
  'Desert Dee',
  'Desert Angry Shark',
  '2Face Shark',
  'Enico Veck 1st Linen Jacket',
] as const;

const SMARTSTORE_LINK_ENTRIES = [
  ['Re: flower of evil jacket', 'https://smartstore.naver.com/xenicolack/products/12987517638'],
  ['Re: kevin shirts', 'https://smartstore.naver.com/xenicolack/products/12954569209'],
  ['EVA-JACEKT', 'https://smartstore.naver.com/xenicolack/products/12750665896'],
  ['Akira Jacket', 'https://smartstore.naver.com/xenicolack/products/12750550748'],
  ['Roronoa Coat', 'https://smartstore.naver.com/xenicolack/products/12750370101'],
  ['Mononoke Jacket', 'https://smartstore.naver.com/xenicolack/products/12484352509'],
  ['Mononoke Pants', 'https://smartstore.naver.com/xenicolack/products/12484330301'],
  ['Mononoke Bolero', 'https://smartstore.naver.com/xenicolack/products/12484310979'],
  ['enico MIX shirts', 'https://smartstore.naver.com/xenicolack/products/12483153706'],
  ['Knit Shark', 'https://smartstore.naver.com/xenicolack/products/12483114304'],
  ['Flannel double-label shirt', 'https://smartstore.naver.com/xenicolack/products/12419625593'],
  ['enico veck 2025 denim jacket', 'https://smartstore.naver.com/xenicolack/products/12419570574'],
  ['enico vecks denim hood jacket', 'https://smartstore.naver.com/xenicolack/products/12419532271'],
  ['enico veck’s denim hood jacket', 'https://smartstore.naver.com/xenicolack/products/12419532271'],
  ['enico MIX pants', 'https://smartstore.naver.com/xenicolack/products/12411038354'],
  ['enico damm denim jacket', 'https://smartstore.naver.com/xenicolack/products/12411009689'],
  ['BOMB DEVIL Dress+Choker', 'https://smartstore.naver.com/xenicolack/products/12400272864'],
  ['Bens Shirts', 'https://smartstore.naver.com/xenicolack/products/12400120212'],
  ['Ben’s Shirts', 'https://smartstore.naver.com/xenicolack/products/12400120212'],
  ['Bens Cago Pants', 'https://smartstore.naver.com/xenicolack/products/12400111093'],
  ['Ben’s Cago Pants', 'https://smartstore.naver.com/xenicolack/products/12400111093'],
  ['INFINITY CASTLE Shorts', 'https://smartstore.naver.com/xenicolack/products/12400056381'],
  ['INFINITY CASTLE Crop Shirts', 'https://smartstore.naver.com/xenicolack/products/12400039037'],
  ['INFINITY CASTLE Kimono', 'https://smartstore.naver.com/xenicolack/products/12400001309'],
  ['BERSERK Pants', 'https://smartstore.naver.com/xenicolack/products/12398151386'],
  ['BERSERK Jacket', 'https://smartstore.naver.com/xenicolack/products/12398123187'],
  ['Night Kitty', 'https://smartstore.naver.com/xenicolack/products/11985901605'],
  ['Night Face', 'https://smartstore.naver.com/xenicolack/products/11985887749'],
  ['Night Dee', 'https://smartstore.naver.com/xenicolack/products/11985873950'],
  ['Check Shark', 'https://smartstore.naver.com/xenicolack/products/11985589156'],
  ['Check Kitty', 'https://smartstore.naver.com/xenicolack/products/11985575576'],
  ['Desert Bat', 'https://smartstore.naver.com/xenicolack/products/11985539433'],
  ['Desert Dee', 'https://smartstore.naver.com/xenicolack/products/11985527327'],
  ['Desert Angry Shark', 'https://smartstore.naver.com/xenicolack/products/11985513043'],
  ['Enico Dee', 'https://smartstore.naver.com/xenicolack/products/11985483562'],
  ['2Face Shark', 'https://smartstore.naver.com/xenicolack/products/11985452653'],
  ['Where GA-O-RI', 'https://smartstore.naver.com/xenicolack/products/11985411499'],
  ['Enico Veck 1st Linen Jacket', 'https://smartstore.naver.com/xenicolack/products/11187002300'],
  ["Re: kevin's pants", 'https://smartstore.naver.com/xenicolack/products/12898733412'],
] as const;

function normalizeCategoryHintKey(value: string) {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/['’`"“”]/g, '')
    .replace(/[^a-z0-9가-힣]+/g, '');
}

const UPLOAD_HINT_KEYWORDS = UPLOAD_TITLE_CATEGORY_HINTS.map(({ title, category }) => ({
  key: normalizeCategoryHintKey(title),
  category,
})).sort((a, b) => b.key.length - a.key.length);

const CSV_LATEST_ORDER_INDEX = new Map(
  CSV_LATEST_TITLE_ORDER.map((title, index) => [normalizeCategoryHintKey(title), index] as const),
);

const SOLD_OUT_PRODUCT_KEY_SET = new Set(
  SOLD_OUT_PRODUCT_TITLES.map((title) => normalizeCategoryHintKey(title)),
);

const SMARTSTORE_LINK_MAP = new Map<string, string>(
  SMARTSTORE_LINK_ENTRIES.map(([title, url]) => [normalizeCategoryHintKey(title), url]),
);

function getSmartstoreUrlByTitle(title: string) {
  return SMARTSTORE_LINK_MAP.get(normalizeCategoryHintKey(title));
}

function normalizeStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];

    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed
          .filter((item): item is string => typeof item === 'string')
          .map((item) => item.trim())
          .filter((item) => item.length > 0);
      }
    } catch {
      return [trimmed];
    }
  }

  return [];
}

function extractRawText(raw: unknown, keys: string[]) {
  if (!raw || typeof raw !== 'object') return '';
  const target = raw as Record<string, unknown>;

  for (const key of keys) {
    const value = target[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  return '';
}

function extractRawImages(raw: unknown): string[] {
  if (!raw || typeof raw !== 'object') return [];
  const target = raw as Record<string, unknown>;
  const candidates: string[] = [];

  const push = (value: unknown) => {
    candidates.push(...normalizeStringArray(value));
  };

  push(target.images);
  push(target.image_urls);
  push(target.imageUrls);
  push(target.productImages);
  push(target.additionalImages);
  push(target.optionalImages);
  push(target.detailImages);

  const singleKeys = [
    'thumbnail_url',
    'thumbnailUrl',
    'representImageUrl',
    'represent_image_url',
    'imageUrl',
    'image_url',
    'originImageUrl',
  ];

  for (const key of singleKeys) {
    const value = target[key];
    if (typeof value === 'string' && value.trim()) {
      candidates.push(value.trim());
    }
  }

  return candidates;
}

function normalizeImagesForProduct(
  imagesValue: unknown,
  thumbnailUrl: string | null,
  raw: unknown,
) {
  const merged = [
    ...normalizeStringArray(imagesValue),
    ...extractRawImages(raw),
    ...(thumbnailUrl ? [thumbnailUrl.trim()] : []),
  ].filter((item) => item.length > 0);

  return Array.from(new Set(merged));
}

function htmlToPlainText(value: string | null) {
  if (!value) return '';
  return value
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function inferCategory(text: string): ProductCategory {
  const normalized = text.toLowerCase();

  if (
    normalized.includes('셔츠') ||
    normalized.includes('남방') ||
    normalized.includes('블라우스') ||
    normalized.includes('shirt')
  ) {
    return '셔츠';
  }

  if (
    normalized.includes('팬츠') ||
    normalized.includes('바지') ||
    normalized.includes('슬랙스') ||
    normalized.includes('데님') ||
    normalized.includes('pants') ||
    normalized.includes('jean')
  ) {
    return '팬츠';
  }

  if (
    normalized.includes('악세사리') ||
    normalized.includes('액세서리') ||
    normalized.includes('장갑') ||
    normalized.includes('mask') ||
    normalized.includes('glove') ||
    normalized.includes('acc') ||
    normalized.includes('accessory') ||
    normalized.includes('볼레로') ||
    normalized.includes('bolero')
  ) {
    return '악세사리';
  }

  if (
    normalized.includes('가방') ||
    normalized.includes('백') ||
    normalized.includes('bag') ||
    normalized.includes('backpack') ||
    normalized.includes('토트')
  ) {
    return '가방';
  }

  if (
    normalized.includes('인형') ||
    normalized.includes('doll') ||
    normalized.includes('toy') ||
    normalized.includes('plush')
  ) {
    return '인형';
  }

  if (
    normalized.includes('드레스') ||
    normalized.includes('원피스') ||
    normalized.includes('dress') ||
    normalized.includes('skirt')
  ) {
    return '드레스';
  }

  if (
    normalized.includes('아우터') ||
    normalized.includes('자켓') ||
    normalized.includes('점퍼') ||
    normalized.includes('코트') ||
    normalized.includes('베스트') ||
    normalized.includes('outer') ||
    normalized.includes('jacket') ||
    normalized.includes('coat') ||
    normalized.includes('vest')
  ) {
    return '아우터';
  }

  return DEFAULT_PRODUCT_CATEGORY;
}

function inferCategoryFromUploadHints(title: string | null | undefined): ProductCategory | null {
  const normalizedTitle = normalizeCategoryHintKey(title || '');
  if (!normalizedTitle) return null;

  for (const hint of UPLOAD_HINT_KEYWORDS) {
    if (!hint.key) continue;
    if (normalizedTitle === hint.key || normalizedTitle.includes(hint.key)) {
      return hint.category;
    }
  }

  return null;
}

function inferCategoryFromImagePath(row: StorefrontProductRow): ProductCategory | null {
  const imageCandidates = normalizeImagesForProduct(row.images, row.thumbnail_url ?? null, row.raw)
    .map((item) => item.toLowerCase());

  for (const url of imageCandidates) {
    for (const hint of IMAGE_PATH_CATEGORY_HINTS) {
      if (hint.markers.some((marker) => url.includes(marker))) {
        return hint.category;
      }
    }
  }

  return null;
}

function resolveCategory(row: StorefrontProductRow) {
  if (row.category && isProductCategory(row.category)) {
    return row.category;
  }

  const explicit = extractRawText(row.raw, [
    'category',
    'category_name',
    'categoryName',
    'wholeCategoryName',
    'firstCategoryName',
    'secondCategoryName',
    'leafCategoryName',
  ]);

  if (isProductCategory(explicit)) {
    return explicit;
  }

  const imageHint = inferCategoryFromImagePath(row);
  if (imageHint) {
    return imageHint;
  }

  const hintedCategory = inferCategoryFromUploadHints(row.title);
  if (hintedCategory) {
    return hintedCategory;
  }

  return inferCategory(`${explicit} ${row.title || ''}`);
}

function mapDbRowToProduct(row: StorefrontProductRow): Product | null {
  const images = normalizeImagesForProduct(
    row.images,
    row.thumbnail_url ?? null,
    row.raw,
  );
  const plainDetail = htmlToPlainText(row.detail_html ?? null);
  const explicitDescription = (row.description || '').trim();
  const rawDescription = extractRawText(row.raw, [
    'description',
    'summary',
    'content',
    'detail',
    'detailSummary',
  ]);
  const rawSpecs = extractRawText(row.raw, [
    'specs',
    'spec',
    'apparelSpecs',
    'materialInfo',
    'sizeSpec',
  ]);

  const title = row.title?.trim() || `상품 ${row.id}`;
  const numericPrice = Number(row.price);
  const price = Number.isFinite(numericPrice) ? numericPrice : 0;
  const description =
    explicitDescription || plainDetail || rawDescription || `${title} 상세 페이지`;
  const apparelSpecs =
    (typeof row.specs === 'string' ? row.specs.trim() : '') || rawSpecs;

  return {
    id: row.id,
    name: title,
    category: resolveCategory(row),
    price,
    image: images[0] || FALLBACK_IMAGE_URL,
    images: images.length > 0 ? images : [FALLBACK_IMAGE_URL],
    description,
    apparelSpecs: apparelSpecs || undefined,
    updatedAt: row.updated_at ?? row.created_at ?? null,
    isSoldOut: SOLD_OUT_PRODUCT_KEY_SET.has(normalizeCategoryHintKey(title)),
    smartstoreUrl: getSmartstoreUrlByTitle(title),
  };
}

function sortProductsByCsvLatest(products: Product[]) {
  return [...products].sort((a, b) => {
    const aIdx = CSV_LATEST_ORDER_INDEX.get(normalizeCategoryHintKey(a.name));
    const bIdx = CSV_LATEST_ORDER_INDEX.get(normalizeCategoryHintKey(b.name));

    const aHasCsv = typeof aIdx === 'number';
    const bHasCsv = typeof bIdx === 'number';

    if (aHasCsv && bHasCsv) {
      return (aIdx as number) - (bIdx as number);
    }

    if (aHasCsv && !bHasCsv) return -1;
    if (!aHasCsv && bHasCsv) return 1;

    const aTime = new Date(a.updatedAt || 0).getTime();
    const bTime = new Date(b.updatedAt || 0).getTime();
    return bTime - aTime;
  });
}

export function buildProductCatalog(rows: StorefrontProductRow[]) {
  return sortProductsByCsvLatest(
    rows
      .map(mapDbRowToProduct)
      .filter((item): item is Product => Boolean(item)),
  );
}

export function resolveInitialProductCatalog(rows: StorefrontProductRow[]) {
  const products = buildProductCatalog(rows);

  return {
    products,
    usingFallbackCatalog: products.length === 0,
  };
}
