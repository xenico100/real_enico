const FOOTER_FIELDS = [
  { label: '상호', value: '몽상인' },
  { label: '대표자', value: '백형석' },
  { label: '사업자등록번호', value: '445-03-04118' },
  { label: '통신판매업신고번호', value: '2026-서울강서-0900호' },
  { label: '연락처', value: '010-9850-7214' },
  { label: '사업장 주소', value: '서울특별시 강서구 강서로17다길 16-5 (화곡동)' },
] as const;

export function SubcultureFooter() {
  return (
    <footer className="relative border-t border-[#d1d5db] bg-[linear-gradient(180deg,#ffffff_0%,#f8f9fa_100%)]">
      <div className="absolute inset-0 opacity-[0.06] bg-[linear-gradient(rgba(0,0,0,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(0,0,0,0.08)_1px,transparent_1px)] bg-[size:20px_20px]" />

      <div className="relative z-10 px-4 py-5 md:px-10 md:py-6">
        <div className="flex flex-col gap-2 border-b border-[#e5e7eb] pb-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="font-mono text-[9px] uppercase tracking-[0.08em] text-[#999999] font-normal">
              Shop Info
            </p>
            <h2 className="mt-1 font-mono text-[10px] uppercase tracking-[0.04em] text-[#999999] font-normal">
              Monangsangin
            </h2>
            <p className="mt-1 break-all text-[9px] leading-relaxed text-[#999999]">
              morba9850@gmail.com. Copyright © Enico Veck. All rights reserved.
            </p>
          </div>

          <p className="font-mono text-[9px] uppercase tracking-[0.08em] text-[#999999] font-normal">
            ENICO VECK STORELINE
          </p>
        </div>

        <div className="grid gap-x-4 gap-y-2 pt-3 md:grid-cols-2 xl:grid-cols-4">
          {FOOTER_FIELDS.map((field) => (
            <div key={field.label} className="min-w-0 py-1">
              <p className="font-mono text-[9px] uppercase tracking-[0.06em] text-[#999999] font-normal">
                {field.label}
              </p>
              <p className="mt-1 break-words text-[9px] font-normal leading-relaxed text-[#999999] md:text-[10px]">
                {field.value}
              </p>
            </div>
          ))}
        </div>
      </div>
    </footer>
  );
}
