'use client';

const FOOTER_FIELDS = [
  { label: '상호', value: '몽상인' },
  { label: '대표자', value: '백형석' },
  { label: '연락처', value: '010-9850-7214' },
  { label: '사업장 주소', value: '강서로 17다길 16-5' },
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
            <h2 className="mt-3 font-heading text-3xl uppercase tracking-tight text-[#f3f7f6] md:text-5xl">
              Monangsangin
            </h2>
            <p className="mt-3 max-w-xl text-xs leading-relaxed text-[#8bb7af] md:text-sm">
              쇼핑몰 하단 정보 영역입니다. 상호와 대표자, 연락처, 사업장 주소를 바로 확인할
              수 있게 고정했습니다.
            </p>
          </div>

          <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-[#5d8d84]">
            ENICO VECK STORELINE
          </p>
        </div>

        <div className="grid gap-3 border-x border-b border-[#17332f] bg-[#050908]/96 p-4 md:grid-cols-2 md:p-7 xl:grid-cols-4">
          {FOOTER_FIELDS.map((field) => (
            <div key={field.label} className="border border-[#18312c] bg-[#0a1513] px-4 py-4">
              <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-[#6e8f89]">
                {field.label}
              </p>
              <p className="mt-3 break-words text-sm font-semibold leading-relaxed text-[#f1f5f4] md:text-base">
                {field.value}
              </p>
            </div>
          ))}
        </div>
      </div>
    </footer>
  );
}
