'use client';

const FOOTER_FIELDS = [
  { label: '상호', value: '몽상인' },
  { label: '대표자', value: '백형성' },
  { label: '사업자등록번호', value: '445-03-04118' },
  { label: '연락처', value: '010-9850-7214' },
  { label: '사업장 주소', value: '서울특별시 강서구 강서로17다길 16-5 (화곡동)' },
] as const;

export function SubcultureFooter() {
  return (
    <footer className="relative border-t border-[#17332f] bg-[linear-gradient(180deg,#07110f_0%,#050505_100%)]">
      <div className="absolute inset-0 opacity-[0.08] bg-[linear-gradient(rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.08)_1px,transparent_1px)] bg-[size:20px_20px]" />

      <div className="relative z-10 px-4 py-10 md:px-10 md:py-14">
        <div className="flex flex-col gap-4 border border-[#1f3a35] bg-[#081311]/90 p-5 md:flex-row md:items-end md:justify-between md:p-7">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-[#00ffd1]">
              Shop Info
            </p>
            <h2 className="mt-2 font-heading text-base uppercase tracking-[0.06em] text-[#b6bfbd] md:text-lg">
              Monangsangin
            </h2>
            <p className="mt-1 break-all text-[9px] leading-relaxed text-[#6f7977] md:text-[10px]">
              morba9850@gmail.com. Copyright © Enico Veck. All rights reserved.
            </p>
          </div>

          <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-[#5d8d84]">
            ENICO VECK STORELINE
          </p>
        </div>

        <div className="grid gap-3 border-x border-b border-[#17332f] bg-[#050908]/96 p-4 md:grid-cols-2 md:p-7 xl:grid-cols-4">
          {FOOTER_FIELDS.map((field) => (
            <div key={field.label} className="border border-[#18312c] bg-[#0a1513] px-4 py-4">
              <p className="font-mono text-[9px] uppercase tracking-[0.22em] text-[#68716f] md:text-[10px]">
                {field.label}
              </p>
              <p className="mt-1.5 break-words text-[11px] font-normal leading-relaxed text-[#9ea7a5] md:text-xs">
                {field.value}
              </p>
            </div>
          ))}
        </div>
      </div>
    </footer>
  );
}
