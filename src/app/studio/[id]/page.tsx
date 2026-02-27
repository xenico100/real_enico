import Link from 'next/link';
import { notFound } from 'next/navigation';
import sanitizeHtml from 'sanitize-html';
import { getSupabaseAdminClient } from '@/lib/supabaseAdmin';

type ProductDetailRow = {
  id: string;
  title: string | null;
  price: number | null;
  thumbnail_url: string | null;
  detail_html: string | null;
  images: unknown;
  synced_at: string | null;
};

function formatPrice(value: number | null) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '-';
  return `${value.toLocaleString('ko-KR')}원`;
}

function normalizeImages(value: unknown): string[] {
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

function sanitizeDetailHtml(value: string) {
  return sanitizeHtml(value, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat([
      'img',
      'h1',
      'h2',
      'h3',
      'h4',
      'h5',
      'h6',
    ]),
    allowedAttributes: {
      ...sanitizeHtml.defaults.allowedAttributes,
      a: ['href', 'name', 'target', 'rel'],
      img: ['src', 'alt', 'title', 'width', 'height', 'loading'],
      '*': ['style'],
    },
    allowedSchemes: ['http', 'https', 'mailto'],
  });
}

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function StudioDetailPage({ params }: PageProps) {
  const { id } = await params;

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('id', id)
    .maybeSingle<Record<string, unknown>>();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    notFound();
  }

  const title =
    (typeof data.title === 'string' && data.title.trim()) ||
    (typeof data.name === 'string' && data.name.trim()) ||
    null;
  const rawPrice = data.price;
  const price =
    typeof rawPrice === 'number'
      ? rawPrice
      : typeof rawPrice === 'string'
        ? Number(rawPrice)
        : null;
  const thumbnailUrl =
    (typeof data.thumbnail_url === 'string' && data.thumbnail_url.trim()) ||
    (typeof data.thumbnail === 'string' && data.thumbnail.trim()) ||
    (typeof data.image === 'string' && data.image.trim()) ||
    null;
  const detailRaw =
    (typeof data.detail_html === 'string' && data.detail_html) ||
    (typeof data.description === 'string' && data.description) ||
    '';
  const images = normalizeImages(data.images);
  const detailHtml = detailRaw.trim();
  const sanitized = detailHtml ? sanitizeDetailHtml(detailHtml) : '';
  const plainText = detailHtml
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return (
    <main className="min-h-screen bg-[#050505] text-[#e5e5e5] p-6 md:p-10">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6">
          <Link
            href="/studio"
            className="font-mono text-xs text-[#aaa] hover:text-[#00ffd1] underline underline-offset-4"
          >
            ← /studio
          </Link>
        </div>

        <div className="border border-[#333] bg-[#0a0a0a] overflow-hidden">
          <div className="p-6 border-b border-[#222]">
            <h1 className="font-heading text-4xl md:text-6xl leading-none break-words">
              {title || '(untitled)'}
            </h1>
            <p className="mt-3 font-mono text-sm text-[#00ffd1]">
              {formatPrice(Number.isFinite(price) ? price : null)}
            </p>
          </div>

          <div className="p-6 space-y-6">
            <div className="aspect-[4/3] bg-black border border-[#222]">
              {thumbnailUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={thumbnailUrl}
                  alt={title || 'thumbnail'}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center font-mono text-xs text-[#666]">
                  NO IMAGE
                </div>
              )}
            </div>

            {images.length > 0 && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {images.map((image, index) => (
                  <div
                    key={`${image}-${index}`}
                    className="aspect-square border border-[#222] bg-black overflow-hidden"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={image}
                      alt={`${title || 'product'} image ${index + 1}`}
                      className="w-full h-full object-cover"
                    />
                  </div>
                ))}
              </div>
            )}

            <section className="border border-[#222] bg-[#080808] p-4">
              <h2 className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#00ffd1] mb-3">
                Detail
              </h2>

              {sanitized ? (
                <div
                  className="prose prose-invert max-w-none text-sm"
                  dangerouslySetInnerHTML={{ __html: sanitized }}
                />
              ) : (
                <p className="font-mono text-sm text-[#999] whitespace-pre-wrap">
                  {plainText || '상세 설명이 없습니다.'}
                </p>
              )}
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}
