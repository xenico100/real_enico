import Link from 'next/link';

type NicepaySuccessPageProps = {
  searchParams: Promise<{
    orderCode?: string;
    guestOrderNumber?: string;
    channel?: string;
    mail?: string;
  }>;
};

export default async function NicepaySuccessPage({ searchParams }: NicepaySuccessPageProps) {
  const params = await searchParams;

  return (
    <main className="min-h-screen bg-[#050505] px-4 py-12 text-[#e5e5e5] md:px-6">
      <div className="mx-auto max-w-2xl border border-[#1f4a41] bg-[#0b1211] p-6 shadow-[0_0_0_1px_rgba(0,255,209,0.08)] md:p-8">
        <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-[#00ffd1]">
          NICE Payments
        </p>
        <h1 className="mt-3 font-heading text-4xl uppercase tracking-tight text-white md:text-5xl">
          결제 완료
        </h1>
        <p className="mt-4 text-sm leading-relaxed text-[#a5c9c2]">
          NICE Payments 승인과 주문 저장이 완료됐습니다. 주문 조회는 아래 주문번호 기준으로 확인하면
          됩니다.
        </p>

        <div className="mt-6 grid gap-3 md:grid-cols-2">
          <div className="border border-[#18332d] bg-black/40 p-4">
            <p className="text-[10px] uppercase tracking-[0.22em] text-[#6ea59a]">주문번호</p>
            <p className="mt-2 break-all text-lg font-semibold text-white">
              {params.orderCode || '-'}
            </p>
          </div>
          {params.channel === 'guest' ? (
            <div className="border border-[#18332d] bg-black/40 p-4">
              <p className="text-[10px] uppercase tracking-[0.22em] text-[#6ea59a]">
                비회원 조회번호
              </p>
              <p className="mt-2 break-all text-lg font-semibold text-white">
                {params.guestOrderNumber || '-'}
              </p>
            </div>
          ) : null}
        </div>

        {params.mail === 'failed' ? (
          <div className="mt-4 border border-[#6d5a1e] bg-[#2c2507] px-4 py-3 text-sm text-[#f6dd8b]">
            결제와 주문 저장은 완료됐지만 주문 메일 발송은 실패했습니다. 주문은 관리자 목록에
            정상 저장되어 있습니다.
          </div>
        ) : null}

        <div className="mt-6 flex flex-col gap-3 md:flex-row">
          <Link
            href="/"
            className="inline-flex min-h-[52px] items-center justify-center border border-[#00ffd1] bg-[#00ffd1] px-4 text-sm font-bold uppercase tracking-[0.16em] text-black transition-colors hover:bg-[#b7fff2]"
          >
            홈으로
          </Link>
          <Link
            href="/"
            className="inline-flex min-h-[52px] items-center justify-center border border-[#333] bg-[#111] px-4 text-sm uppercase tracking-[0.16em] text-[#d7d7d7] transition-colors hover:border-[#00ffd1] hover:text-[#00ffd1]"
          >
            주문 확인하러 가기
          </Link>
        </div>
      </div>
    </main>
  );
}
