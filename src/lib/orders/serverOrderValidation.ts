import 'server-only';

import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import {
  isProductMarkedAvailable,
  isProductMarkedSoldOut,
  isProductTitleMarkedSoldOut,
  isUuidLike,
} from '@/lib/storefront/productAvailability';
import { NICEPAY_TEST_PRODUCT_ID } from '@/lib/storefront/productCatalog';

export type ServerOrderChannel = 'member' | 'guest';

export type ClientOrderItem = {
  id: string;
  name?: string;
  category?: string;
  selectedSize?: string | null;
  quantity: number;
  unitPrice?: number;
  lineTotal?: number;
};

export type CanonicalOrderItem = {
  id: string;
  name: string;
  category: string;
  selectedSize: string | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
};

export type CanonicalOrderPricing = {
  subtotal: number;
  shipping: number;
  tax: number;
  total: number;
  currency: 'KRW';
};

type ProductOrderRow = {
  id: string;
  title?: string | null;
  category?: string | null;
  price?: number | string | null;
  raw?: unknown;
  is_published?: boolean | null;
};

export class OrderValidationError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = 'OrderValidationError';
    this.status = status;
  }
}

const PRIMARY_ADMIN_EMAIL = 'morba9850@gmail.com';
const ADMIN_EMAIL_DOMAIN = 'enicoveck.com';
const DOMESTIC_REGION = '대한민국';
const DOMESTIC_SHIPPING_FEE = 3000;
const INTERNATIONAL_SHIPPING_FEE = 40000;
const OPTIONAL_PRODUCT_COLUMNS = new Set(['category', 'raw', 'is_published']);

function normalizeText(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function getMissingColumn(error: { message?: string | null } | null) {
  const message = error?.message || '';
  const schemaCacheMatch = message.match(/'([^']+)' column/i);
  if (schemaCacheMatch?.[1]) return schemaCacheMatch[1];

  const tableColumnMatch = message.match(/products\.([a-zA-Z0-9_]+)/i);
  if (tableColumnMatch?.[1]) return tableColumnMatch[1];

  const genericColumnMatch = message.match(/column\s+"?([a-zA-Z0-9_]+)"?\s+does not exist/i);
  return genericColumnMatch?.[1] || null;
}

function isUnavailable(row: ProductOrderRow) {
  return (
    row.is_published === false ||
    isProductMarkedSoldOut(row.raw) ||
    (isProductTitleMarkedSoldOut(row.title) && !isProductMarkedAvailable(row.raw))
  );
}

async function fetchProductRows(serviceClient: SupabaseClient, productIds: string[]) {
  let fields = ['id', 'title', 'category', 'price', 'raw', 'is_published'];

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const result = await serviceClient
      .from('products')
      .select(fields.join(', '))
      .in('id', productIds);

    if (!result.error) {
      return (result.data || []) as unknown as ProductOrderRow[];
    }

    const missingColumn = getMissingColumn(result.error);
    if (missingColumn && OPTIONAL_PRODUCT_COLUMNS.has(missingColumn)) {
      fields = fields.filter((field) => field !== missingColumn);
      continue;
    }

    throw new OrderValidationError(`상품 가격 조회 실패: ${result.error.message}`, 500);
  }

  throw new OrderValidationError('상품 가격 정보를 확인하지 못했습니다.', 500);
}

function isDesignatedAdmin(user: User | null) {
  const email = normalizeText(user?.email).toLowerCase();
  return email === PRIMARY_ADMIN_EMAIL || email.endsWith(`@${ADMIN_EMAIL_DOMAIN}`);
}

async function canUseTestProduct(serviceClient: SupabaseClient, user: User | null) {
  if (!user) return false;
  if (isDesignatedAdmin(user)) return true;

  const { data, error } = await serviceClient
    .from('admins')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle();

  return !error && Boolean(data?.user_id);
}

export function getOrderErrorStatus(error: unknown) {
  return error instanceof OrderValidationError ? error.status : 500;
}

export function normalizeTransactionId(value: unknown) {
  const transactionId = normalizeText(value);
  if (!/^[A-Za-z0-9_-]{6,64}$/.test(transactionId)) {
    throw new OrderValidationError('거래번호 형식이 올바르지 않습니다.');
  }
  return transactionId;
}

export async function authenticateOrderRequest(
  request: Request,
  requestedChannel: ServerOrderChannel,
) {
  if (requestedChannel === 'guest') {
    return { channel: 'guest' as const, user: null };
  }

  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new OrderValidationError('회원 주문 인증용 Supabase 설정이 없습니다.', 500);
  }

  const authorization = request.headers.get('authorization') || '';
  const accessToken = authorization.toLowerCase().startsWith('bearer ')
    ? authorization.slice(7).trim()
    : '';
  if (!accessToken) {
    throw new OrderValidationError('회원 주문은 로그인이 필요합니다.', 401);
  }

  const authClient = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const {
    data: { user },
    error,
  } = await authClient.auth.getUser(accessToken);

  if (error || !user || user.is_anonymous) {
    throw new OrderValidationError('회원 인증이 만료되었습니다. 다시 로그인해 주세요.', 401);
  }

  return { channel: 'member' as const, user };
}

export async function buildCanonicalOrder(
  serviceClient: SupabaseClient,
  input: {
    items: ClientOrderItem[];
    customerCountry: string;
    user: User | null;
    clientTotal?: number;
  },
) {
  if (!Array.isArray(input.items) || input.items.length === 0 || input.items.length > 20) {
    throw new OrderValidationError('주문 상품 구성이 올바르지 않습니다.');
  }

  const seenIds = new Set<string>();
  const normalizedItems = input.items.map((item) => {
    const id = normalizeText(item.id);
    if (!id || seenIds.has(id)) {
      throw new OrderValidationError('같은 상품은 중복 주문할 수 없습니다.', 409);
    }
    seenIds.add(id);

    if (!Number.isFinite(item.quantity) || item.quantity !== 1) {
      throw new OrderValidationError('모든 상품은 재고 1개만 주문할 수 있습니다.', 409);
    }

    const selectedSize = normalizeText(item.selectedSize).slice(0, 40) || null;
    return { id, selectedSize };
  });

  const persistentIds = normalizedItems
    .map((item) => item.id)
    .filter((id) => isUuidLike(id));
  const unsupportedId = normalizedItems.find(
    (item) => !isUuidLike(item.id) && item.id !== NICEPAY_TEST_PRODUCT_ID,
  );
  if (unsupportedId) {
    throw new OrderValidationError('판매 DB에 등록되지 않은 상품이 포함되어 있습니다.', 409);
  }

  const includesTestProduct = normalizedItems.some((item) => item.id === NICEPAY_TEST_PRODUCT_ID);
  if (includesTestProduct && !(await canUseTestProduct(serviceClient, input.user))) {
    throw new OrderValidationError('결제 테스트 상품은 관리자만 주문할 수 있습니다.', 403);
  }

  const rows = persistentIds.length > 0
    ? await fetchProductRows(serviceClient, persistentIds)
    : [];
  if (rows.length !== persistentIds.length) {
    throw new OrderValidationError('판매가 종료되었거나 존재하지 않는 상품이 포함되어 있습니다.', 409);
  }

  const rowsById = new Map(rows.map((row) => [row.id, row]));
  const items: CanonicalOrderItem[] = normalizedItems.map((item) => {
    if (item.id === NICEPAY_TEST_PRODUCT_ID) {
      return {
        id: item.id,
        name: 'NICE Payments 1000Won Test',
        category: '악세사리',
        selectedSize: item.selectedSize,
        quantity: 1,
        unitPrice: 1000,
        lineTotal: 1000,
      };
    }

    const row = rowsById.get(item.id);
    if (!row || isUnavailable(row)) {
      throw new OrderValidationError(
        `${normalizeText(row?.title) || '선택한 상품'}은 품절되어 주문할 수 없습니다.`,
        409,
      );
    }

    const unitPrice = Number(row.price);
    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      throw new OrderValidationError('상품 판매가를 확인할 수 없습니다.', 409);
    }

    return {
      id: item.id,
      name: normalizeText(row.title) || `상품 ${item.id}`,
      category: normalizeText(row.category) || '기타',
      selectedSize: item.selectedSize,
      quantity: 1,
      unitPrice: Math.round(unitPrice),
      lineTotal: Math.round(unitPrice),
    };
  });

  const subtotal = items.reduce((sum, item) => sum + item.lineTotal, 0);
  const testOrderOnly = items.every((item) => item.id === NICEPAY_TEST_PRODUCT_ID);
  const shipping = testOrderOnly
    ? 0
    : normalizeText(input.customerCountry) === DOMESTIC_REGION
      ? DOMESTIC_SHIPPING_FEE
      : INTERNATIONAL_SHIPPING_FEE;
  const pricing: CanonicalOrderPricing = {
    subtotal,
    shipping,
    tax: 0,
    total: subtotal + shipping,
    currency: 'KRW',
  };

  if (
    typeof input.clientTotal === 'number' &&
    Number.isFinite(input.clientTotal) &&
    Math.round(input.clientTotal) !== pricing.total
  ) {
    throw new OrderValidationError(
      '상품 가격 또는 배송비가 변경되었습니다. 장바구니를 새로고침한 뒤 다시 시도해 주세요.',
      409,
    );
  }

  return { items, pricing };
}
