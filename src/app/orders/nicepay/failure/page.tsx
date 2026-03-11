import Link from 'next/link';

type NicepayFailurePageProps = {
  searchParams: Promise<{
    code?: string;
    message?: string;
  }>;
};

export default async function NicepayFailurePage({ searchParams }: NicepayFailurePageProps) {
  const params = await searchParams;

  return (
    <main className="min-h-screen bg-[#050505] px-4 py-12 text-[#e5e5e5] md:px-6">
      <div className="mx-auto max-w-2xl border border-[#5a2424] bg-[#120909] p-6 shadow-[0_0_0_1px_rgba(255,90,90,0.08)] md:p-8">
        <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-[#ff8f8f]">
          NICE Payments
        </p>
        <h1 className="mt-3 font-heading text-4xl uppercase tracking-tight text-white md:text-5xl">
          결제 실패
        </h1>
        <p className="mt-4 text-sm leading-relaxed text-[#d6aaaa]">
          NICE Payments 승인 또는 주문 저장 단계에서 문제가 발생했습니다. 아래 코드를 확인한 뒤 다시
          시도하세요.
        </p>

        <div className="mt-6 grid gap-3 md:grid-cols-2">
          <div className="border border-[#3a1d1d] bg-black/40 p-4">
            <p className="text-[10px] uppercase tracking-[0.22em] text-[#c98e8e]">에러 코드</p>
            <p className="mt-2 break-all text-lg font-semibold text-white">
              {params.code || '-'}
            </p>
          </div>
          <div className="border border-[#3a1d1d] bg-black/40 p-4">
            <p className="text-[10px] uppercase tracking-[0.22em] text-[#c98e8e]">메시지</p>
            <p className="mt-2 break-words text-sm leading-relaxed text-white">
              {params.message || '결제 실패'}
            </p>
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-3 md:flex-row">
          <Link
            href="/"
            className="inline-flex min-h-[52px] items-center justify-center border border-[#ff8f8f] bg-[#331515] px-4 text-sm font-bold uppercase tracking-[0.16em] text-[#ffe2e2] transition-colors hover:bg-[#4a1d1d]"
          >
            다시 시도
          </Link>
          <Link
            href="/"
            className="inline-flex min-h-[52px] items-center justify-center border border-[#333] bg-[#111] px-4 text-sm uppercase tracking-[0.16em] text-[#d7d7d7] transition-colors hover:border-[#e5e5e5] hover:text-[#e5e5e5]"
          >
            홈으로
          </Link>
        </div>
      </div>
    </main>
  );
}
