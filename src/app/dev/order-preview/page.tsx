import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Synthetic order component preview', robots: { index: false, follow: false } };

export default async function OrderPreviewPage() {
  // Fixture-only component review; no login, token generation or customer data.
  if (process.env.NODE_ENV !== 'development') notFound();
  const { OrderPreview } = await import('./OrderPreview');
  return <OrderPreview />;
}
