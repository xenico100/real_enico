import Link from 'next/link';
import { getSupabaseAdminClient } from '@/lib/supabaseAdmin';

type ProductRow = {
  id: string;
  title: string | null;
  price: number | null;
  thumbnail_url: string | null;
  category_id: string | null;
  category_name_raw: string | null;
  synced_at: string | null;
};

type CategoryRow = {
  id: string;
  name: string | null;
};

function formatPrice(value: number | null) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '-';
  return `${value.toLocaleString('ko-KR')}원`;
}

export default async function StudioPage() {
  let products: ProductRow[] = [];
  let sections: Array<{ name: string; items: ProductRow[] }> = [];
  let errorMessage: string | null = null;

  try {
    const supabase = getSupabaseAdminClient();
    const orderedQuery = supabase
      .from('products')
      .select('*')
      .order('synced_at', { ascending: false })
      .limit(200);
    let { data, error } = await orderedQuery;

    // Fallback for older schemas that do not have synced_at yet.
    if (error?.message?.includes('synced_at')) {
      const fallback = await supabase.from('products').select('*').limit(200);
      data = fallback.data;
      error = fallback.error;
    }

    if (error) throw error;
    products = ((data ?? []) as Array<Record<string, unknown>>).map((row) => {
      const title =
        (typeof row.title === 'string' && row.title.trim()) ||
        (typeof row.name === 'string' && row.name.trim()) ||
        null;
      const thumbnail =
        (typeof row.thumbnail_url === 'string' && row.thumbnail_url.trim()) ||
        (typeof row.thumbnail === 'string' && row.thumbnail.trim()) ||
        (typeof row.image === 'string' && row.image.trim()) ||
        null;
      const rawPrice = row.price;
      const price =
        typeof rawPrice === 'number'
          ? rawPrice
          : typeof rawPrice === 'string'
            ? Number(rawPrice)
            : null;

      return {
        id: String(row.id ?? ''),
        title,
        price: Number.isFinite(price) ? price : null,
        thumbnail_url: thumbnail,
        category_id:
          typeof row.category_id === 'string' && row.category_id.trim()
            ? row.category_id
            : null,
        category_name_raw:
          typeof row.category_name_raw === 'string' && row.category_name_raw.trim()
            ? row.category_name_raw.trim()
            : null,
        synced_at: typeof row.synced_at === 'string' ? row.synced_at : null,
      };
    });

    const categoryIds = Array.from(
      new Set(
        products
          .map((product) => product.category_id)
          .filter((value): value is string => Boolean(value)),
      ),
    );
    const categoryMap = new Map<string, string>();

    if (categoryIds.length > 0) {
      const categoriesResult = await supabase
        .from('product_categories')
        .select('id, name')
        .in('id', categoryIds);

      if (!categoriesResult.error) {
        for (const row of (categoriesResult.data ?? []) as CategoryRow[]) {
          if (row.id) {
            categoryMap.set(row.id, row.name?.trim() || '기타');
          }
        }
      }
    }

    const grouped = new Map<string, ProductRow[]>();
    for (const product of products) {
      const categoryName =
        (product.category_id && categoryMap.get(product.category_id)) ||
        product.category_name_raw ||
        '기타';
      const current = grouped.get(categoryName) ?? [];
      current.push(product);
      grouped.set(categoryName, current);
    }

    sections = Array.from(grouped.entries()).map(([name, items]) => ({
      name,
      items,
    }));
  } catch (error) {
    if (error && typeof error === 'object' && 'message' in error) {
      const message = (error as { message?: unknown }).message;
      errorMessage = typeof message === 'string' ? message : 'products load failed';
    } else {
      errorMessage = 'products load failed';
    }
  }

  return (
    <main className="min-h-screen bg-[#050505] text-[#e5e5e5] p-6 md:p-10">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 border-b border-[#333] pb-4">
          <h1 className="text-5xl md:text-7xl font-heading font-black uppercase tracking-tight">
            Studio
          </h1>
          <p className="font-mono text-xs text-[#888] mt-2">
            Supabase `products` 목록
          </p>
        </div>

        {errorMessage && (
          <div className="mb-6 border border-red-700 bg-red-950/20 text-red-300 p-3 text-xs font-mono">
            {errorMessage}
          </div>
        )}

        {products.length === 0 ? (
          <div className="border border-[#333] bg-[#0a0a0a] p-8 text-center font-mono text-sm text-[#999]">
            표시할 상품이 없습니다.
          </div>
        ) : (
          <div className="space-y-8">
            {sections.map((section) => (
              <section key={section.name} className="space-y-3">
                <h2 className="font-heading text-3xl uppercase tracking-tight text-[#00ffd1]">
                  {section.name}
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                  {section.items.map((product) => (
                    <Link
                      key={product.id}
                      href={`/studio/${product.id}`}
                      className="border border-[#333] bg-[#0a0a0a] hover:border-[#00ffd1] transition-colors overflow-hidden"
                    >
                      <div className="aspect-[4/5] bg-black border-b border-[#222]">
                        {product.thumbnail_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={product.thumbnail_url}
                            alt={product.title || 'product'}
                            className="w-full h-full object-contain bg-black"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center font-mono text-xs text-[#666]">
                            NO IMAGE
                          </div>
                        )}
                      </div>
                      <div className="p-3 space-y-2">
                        <h2 className="font-heading text-2xl leading-none break-words">
                          {product.title || '(untitled)'}
                        </h2>
                        <p className="font-mono text-sm text-[#00ffd1]">
                          {formatPrice(product.price)}
                        </p>
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
