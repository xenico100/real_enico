'use client';

import Link from 'next/link';
import { useState } from 'react';

type SyncResponse = {
  ok?: boolean;
  count?: number;
  error?: string;
  message?: string;
};

export default function AdminSyncPage() {
  const [isSyncing, setIsSyncing] = useState(false);
  const [result, setResult] = useState<SyncResponse | null>(null);

  const handleSync = async () => {
    setResult(null);
    setIsSyncing(true);
    try {
      const res = await fetch('/api/smartstore/sync', {
        method: 'POST',
      });
      const payload = (await res.json()) as SyncResponse;
      setResult(payload);
    } catch (error) {
      setResult({
        ok: false,
        error: 'request_failed',
        message: error instanceof Error ? error.message : 'request failed',
      });
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#050505] text-[#e5e5e5] p-6 font-mono">
      <div className="mx-auto max-w-xl border border-[#333] bg-[#0a0a0a] p-6 space-y-4">
        <h1 className="text-2xl font-bold uppercase text-[#00ffd1]">SmartStore Sync</h1>
        <p className="text-xs text-[#999]">
          개발환경에서만 동작합니다. 버튼 클릭 시 `/api/smartstore/sync`를 POST 호출합니다.
        </p>

        <button
          type="button"
          onClick={() => void handleSync()}
          disabled={isSyncing}
          className="w-full py-3 border border-[#00ffd1] text-[#00ffd1] hover:bg-[#00ffd1] hover:text-black transition-colors disabled:opacity-50 uppercase text-xs tracking-widest"
        >
          {isSyncing ? 'Syncing...' : 'SmartStore Sync'}
        </button>

        {result && (
          <div
            className={`border p-3 text-xs ${
              result.ok
                ? 'border-[#00ffd1]/40 bg-[#00ffd1]/5 text-[#bafff0]'
                : 'border-red-700 bg-red-950/20 text-red-300'
            }`}
          >
            {result.ok
              ? `동기화 완료: ${result.count ?? 0}건`
              : `실패: ${result.error || 'unknown'}${
                  result.message ? ` - ${result.message}` : ''
                }`}
          </div>
        )}

        <div className="pt-2">
          <Link
            href="/studio"
            className="text-xs text-[#aaa] hover:text-[#00ffd1] underline underline-offset-4"
          >
            /studio 보기
          </Link>
        </div>
      </div>
    </main>
  );
}
