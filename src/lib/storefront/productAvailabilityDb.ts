import type { SupabaseClient } from '@supabase/supabase-js';
import {
  buildAvailableRaw,
  buildSoldOutRaw,
  isProductMarkedSoldOut,
} from '@/lib/storefront/productAvailability';

export type ProductAvailabilityRow = {
  id: string;
  title?: string | null;
  raw?: unknown;
  is_published?: boolean | null;
};

type ProductAvailabilitySnapshot = {
  hasRawColumn: boolean;
  rows: ProductAvailabilityRow[];
};

function isMissingRawColumnError(error: { code?: string | null; message?: string | null } | null) {
  if (!error) return false;

  return (
    error.code === '42703' &&
    typeof error.message === 'string' &&
    error.message.toLowerCase().includes('products.raw')
  );
}

export async function fetchProductAvailabilitySnapshot(
  serviceClient: SupabaseClient,
  productIds: string[],
  options?: { includeTitle?: boolean },
): Promise<ProductAvailabilitySnapshot> {
  const baseSelect = options?.includeTitle ? 'id, title, is_published' : 'id, is_published';
  const selectWithRaw = `${baseSelect}, raw`;

  let hasRawColumn = true;
  let rowsData: unknown[] = [];

  const initialResult = await serviceClient
    .from('products')
    .select(selectWithRaw)
    .in('id', productIds);

  if (isMissingRawColumnError(initialResult.error)) {
    hasRawColumn = false;

    const fallback = await serviceClient
      .from('products')
      .select(baseSelect)
      .in('id', productIds);

    if (fallback.error) {
      throw new Error(fallback.error.message);
    }

    rowsData = ((fallback.data ?? []) as unknown[]).map((row) => {
      const record =
        row && typeof row === 'object' ? (row as Record<string, unknown>) : {};

      return {
        ...record,
        raw: null,
      };
    });
  } else {
    if (initialResult.error) {
      throw new Error(initialResult.error.message);
    }

    rowsData = (initialResult.data ?? []) as unknown[];
  }

  return {
    hasRawColumn,
    rows: rowsData as ProductAvailabilityRow[],
  };
}

export function isProductUnavailable(row: ProductAvailabilityRow) {
  return row.is_published === false || isProductMarkedSoldOut(row.raw);
}

export async function markProductsSoldOut(
  serviceClient: SupabaseClient,
  rows: ProductAvailabilityRow[],
  options: {
    hasRawColumn: boolean;
    orderCode: string;
    paymentMethod: string;
  },
) {
  const updateResults = await Promise.all(
    rows.map((row) =>
      serviceClient
        .from('products')
        .update(
          options.hasRawColumn
            ? {
                raw: buildSoldOutRaw(row.raw, {
                  orderCode: options.orderCode,
                  paymentMethod: options.paymentMethod,
                }),
              }
            : {
                is_published: false,
              },
        )
        .eq('id', row.id),
    ),
  );

  const failedUpdate = updateResults.find((result) => result.error);
  if (failedUpdate?.error) {
    throw new Error(failedUpdate.error.message);
  }
}

export async function restoreProductsAvailability(
  serviceClient: SupabaseClient,
  rows: ProductAvailabilityRow[],
  options: {
    hasRawColumn: boolean;
    orderCode: string;
    paymentMethod: string;
  },
) {
  const updateResults = await Promise.all(
    rows.map((row) =>
      serviceClient
        .from('products')
        .update(
          options.hasRawColumn
            ? {
                raw: buildAvailableRaw(row.raw, {
                  orderCode: options.orderCode,
                  paymentMethod: options.paymentMethod,
                }),
              }
            : {
                is_published: true,
              },
        )
        .eq('id', row.id),
    ),
  );

  const failedUpdate = updateResults.find((result) => result.error);
  if (failedUpdate?.error) {
    throw new Error(failedUpdate.error.message);
  }
}
