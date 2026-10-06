-- These image buckets are public for reads, but uploads must be bounded.
-- product-images has 404 existing objects (PNG/JPEG/HEIC; largest < 8 MB).
-- The current admin R2 upload API accepts at most 20 MiB per image and
-- validates exactly the image formats listed below. Supabase Storage remains
-- a legacy upload path, so enforce the same maximum at the bucket boundary.
update storage.buckets
set file_size_limit = 20 * 1024 * 1024,
    allowed_mime_types = array[
      'image/jpeg', 'image/png', 'image/webp', 'image/gif',
      'image/avif', 'image/heic', 'image/heif'
    ]::text[]
where id = 'product-images';

-- service-images has no stored objects or current application upload path.
-- Keep this legacy user-writable public bucket image-only with a smaller cap.
update storage.buckets
set file_size_limit = 10 * 1024 * 1024,
    allowed_mime_types = array[
      'image/jpeg', 'image/png', 'image/webp', 'image/gif',
      'image/avif', 'image/heic', 'image/heif'
    ]::text[]
where id = 'service-images';

-- These tables are accessed by server-side service-role clients only. They
-- currently have no client RLS policies, but broad legacy grants would expose
-- order/customer data if a permissive policy were accidentally added later.
-- Service-role and postgres privileges are intentionally left untouched.
revoke all privileges on table
  public.orders,
  public.paypal_customers,
  public.paypal_webhook_events,
  public.site_daily_visitors
from anon, authenticated;

-- Published service posts may be read publicly, but the paid file's direct URL
-- must not be exposed by the row-level publication policy. PostgreSQL cannot
-- revoke one column while a table-level SELECT grant still exists, so replace
-- that grant with explicit non-secret columns. This legacy feature has no rows
-- and no current application queries; service-role retains its full access.
revoke select on table public.service_posts from anon, authenticated;
grant select (
  id, title, slug, category, summary, content, price_from, currency,
  image_urls, is_published, created_at, updated_at, created_by,
  is_paid_file, file_price
) on table public.service_posts to anon, authenticated;

notify pgrst, 'reload schema';
