import type { Metadata } from 'next';
import Link from 'next/link';
import { OrdersPageClient } from './OrdersPageClient';

export const metadata: Metadata = {
  title: '주문·입금·배송 조회',
  robots: { index: false, follow: false },
};

export default function OrdersPage() {
  return (
    <main className="min-h-screen bg-[#f8f9fa] px-4 py-8 text-[#111827] md:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <Link href="/" className="inline-block text-sm font-bold underline">ENICO VECK 스토어로</Link>
        <div>
          <h1 className="text-2xl font-bold">주문·입금·배송 조회</h1>
          <p className="mt-2 text-sm leading-relaxed text-[#4b5563]">회원은 로그인 후 주문 내역을 확인하세요. 비회원은 주문한 핸드폰 번호와 주문 시 설정한 비밀번호로 조회하세요.</p>
        </div>
        <OrdersPageClient />
      </div>
    </main>
  );
}
