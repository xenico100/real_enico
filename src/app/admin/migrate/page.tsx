import Link from 'next/link';
import MigrateAction from '@/app/admin/migrate/MigrateAction';
import { getSmartStoreImportStatus } from '@/lib/smartstoreImport';

export const dynamic = 'force-dynamic';

function formatDate(value: string | null) {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString('ko-KR');
}

export default async function AdminMigratePage() {
  const devMode = process.env.NODE_ENV === 'development';

  if (!devMode) {
    return (
      <main className="min-h-screen bg-[#050505] text-[#e5e5e5] p-6 font-mono">
        <div className="mx-auto max-w-xl border border-[#333] bg-[#0a0a0a] p-6 space-y-4">
          <h1 className="text-2xl font-bold uppercase text-[#00ffd1]">
            SmartStore One-time Import
          </h1>
          <div className="border border-amber-700 bg-amber-950/20 text-amber-300 p-3 text-xs">
            이 페이지는 development 환경에서만 사용할 수 있습니다.
          </div>
          <Link
            href="/studio"
            className="text-xs text-[#aaa] hover:text-[#00ffd1] underline underline-offset-4 block"
          >
            /studio 보기
          </Link>
        </div>
      </main>
    );
  }

  let status = {
    imported: false,
    importedAt: null as string | null,
    count: 0,
    updatedAt: null as string | null,
  };
  let statusError: string | null = null;

  try {
    status = await getSmartStoreImportStatus();
  } catch (error) {
    statusError = error instanceof Error ? error.message : 'status load failed';
  }

  return (
    <main className="min-h-screen bg-[#050505] text-[#e5e5e5] p-6 font-mono">
      <div className="mx-auto max-w-xl border border-[#333] bg-[#0a0a0a] p-6 space-y-5">
        <h1 className="text-2xl font-bold uppercase text-[#00ffd1]">
          SmartStore One-time Import
        </h1>

        <div className="border border-[#222] bg-black/40 p-4 text-xs space-y-2">
          <div className="flex justify-between gap-3">
            <span className="text-[#888]">Imported</span>
            <span className={status.imported ? 'text-[#00ffd1]' : 'text-[#aaa]'}>
              {status.imported ? 'yes' : 'no'}
            </span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-[#888]">Last imported at</span>
            <span className="text-[#ddd]">{formatDate(status.importedAt)}</span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-[#888]">Count</span>
            <span className="text-[#ddd]">{status.count}</span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-[#888]">Flag updated at</span>
            <span className="text-[#ddd]">{formatDate(status.updatedAt)}</span>
          </div>
        </div>

        {statusError && (
          <div className="border border-red-700 bg-red-950/20 text-red-300 p-3 text-xs">
            {statusError}
          </div>
        )}

        <MigrateAction devMode={devMode} />

        <div className="pt-2 space-y-1 text-xs">
          <Link
            href="/studio"
            className="text-[#aaa] hover:text-[#00ffd1] underline underline-offset-4 block"
          >
            /studio 보기
          </Link>
          <Link
            href="/admin"
            className="text-[#aaa] hover:text-[#00ffd1] underline underline-offset-4 block"
          >
            /admin 돌아가기
          </Link>
        </div>
      </div>
    </main>
  );
}
