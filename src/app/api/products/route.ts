import { NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabaseAdmin';

type ProductRow = {
  id: string;
  source: string | null;
  smartstore_channel_product_no: number | string | null;
  title: string | null;
  price: number | string | null;
  thumbnail_url: string | null;
  images: unknown;
  detail_html: string | null;
  raw: unknown;
  synced_at: string | null;
  category_id: string | null;
  category_name_raw: string | null;
};

type CategoryRow = {
  id: string;
  name: string | null;
};

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string') return message;
  }
  return 'products load failed';
}

function isMissingProductsColumn(message: string | undefined) {
  if (!message) return false;
  return (
    message.includes('column products.') ||
    message.includes("Could not find the '") && message.includes("column of 'products'")
  );
}

export async function GET() {
  try {
    const supabase = getSupabaseAdminClient();

    const primaryQuery = await supabase
      .from('products')
      .select(
        'id, source, smartstore_channel_product_no, title, price, thumbnail_url, images, detail_html, raw, synced_at, category_id, category_name_raw',
      )
      .not('smartstore_channel_product_no', 'is', null)
      .order('synced_at', { ascending: false })
      .limit(500);

    let rowsData = primaryQuery.data as ProductRow[] | null;
    let rowsError = primaryQuery.error;

    if (rowsError?.message?.includes('synced_at')) {
      const fallbackQuery = await supabase
        .from('products')
        .select(
          'id, source, smartstore_channel_product_no, title, price, thumbnail_url, images, detail_html, raw, category_id, category_name_raw',
        )
        .not('smartstore_channel_product_no', 'is', null)
        .limit(500);

      rowsData = fallbackQuery.data as ProductRow[] | null;
      rowsError = fallbackQuery.error;
    }

    if (isMissingProductsColumn(rowsError?.message)) {
      const fallbackAnyQuery = await supabase
        .from('products')
        .select('*')
        .limit(500);

      rowsError = fallbackAnyQuery.error;
      rowsData = ((fallbackAnyQuery.data ?? []) as Array<Record<string, unknown>>).map(
        (row) => ({
          id: String(row.id ?? ''),
          source: typeof row.source === 'string' ? row.source : null,
          smartstore_channel_product_no:
            typeof row.smartstore_channel_product_no === 'number' ||
            typeof row.smartstore_channel_product_no === 'string'
              ? row.smartstore_channel_product_no
              : null,
          title: typeof row.title === 'string' ? row.title : null,
          price:
            typeof row.price === 'number' || typeof row.price === 'string'
              ? row.price
              : null,
          thumbnail_url:
            typeof row.thumbnail_url === 'string'
              ? row.thumbnail_url
              : typeof row.image === 'string'
                ? row.image
                : null,
          images: row.images ?? [],
          detail_html:
            typeof row.detail_html === 'string'
              ? row.detail_html
              : typeof row.description === 'string'
                ? row.description
                : null,
          raw: row.raw ?? null,
          synced_at: typeof row.synced_at === 'string' ? row.synced_at : null,
          category_id:
            typeof row.category_id === 'string' ? row.category_id : null,
          category_name_raw:
            typeof row.category_name_raw === 'string'
              ? row.category_name_raw
              : null,
        }),
      );
    }

    if (rowsError) {
      throw rowsError;
    }

    const rows = rowsData ?? [];
    const categoryIds = Array.from(
      new Set(
        rows
          .map((row) => row.category_id)
          .filter((value): value is string => Boolean(value)),
      ),
    );

    const categoryNameById = new Map<string, string>();
    if (categoryIds.length > 0) {
      const categoryQuery = await supabase
        .from('product_categories')
        .select('id, name')
        .in('id', categoryIds);

      if (!categoryQuery.error) {
        for (const category of (categoryQuery.data ?? []) as CategoryRow[]) {
          if (category.id && category.name) {
            categoryNameById.set(category.id, category.name);
          }
        }
      }
    }

    const products = rows.map((row) => ({
      ...row,
      category_name:
        (row.category_id && categoryNameById.get(row.category_id)) || null,
    }));

    return NextResponse.json({ ok: true, products });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: 'products_load_failed',
        message: getErrorMessage(error),
      },
      { status: 500 },
    );
  }
}
