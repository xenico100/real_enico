'use client';

import { MyPagePanel } from '@/app/components/subculture/MyPagePanel';
import { FashionCartProvider } from '@/app/context/FashionCartContext';

export function OrdersPageClient() {
  return <FashionCartProvider><MyPagePanel initialTab="orders" /></FashionCartProvider>;
}
