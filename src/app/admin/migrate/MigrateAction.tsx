'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

type ImportResponse = {
  ok?: boolean;
  imported?: number;
  failed?: number;
  scanned?: number;
  error?: string;
  message?: string;
};

export default function MigrateAction({ devMode }: { devMode: boolean }) {
  const router = useRouter();
  const [isImporting, setIsImporting] = useState(false);
  const [result, setResult] = useState<ImportResponse | null>(null);

  const runImport = async () => {
    if (!devMode) return;
    setIsImporting(true);
    setResult(null);

    try {
      const response = await fetch('/api/smartstore/import', {
        method: 'POST',
      });
      const payload = (await response.json()) as ImportResponse;
      setResult(payload);
      if (response.ok && payload.ok) {
        router.refresh();
      }
    } catch (error) {
      setResult({
        ok: false,
        error: 'request_failed',
        message: error instanceof Error ? error.message : 'request failed',
      });
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={() => void runImport()}
        disabled={!devMode || isImporting}
        className="w-full py-3 border border-[#00ffd1] text-[#00ffd1] hover:bg-[#00ffd1] hover:text-black transition-colors disabled:opacity-50 font-mono text-xs uppercase tracking-widest"
      >
        {isImporting ? 'Importing...' : 'Import from SmartStore (One-time)'}
      </button>

      {result && (
        <div
          className={`border p-3 text-xs font-mono ${
            result.ok
              ? 'border-[#00ffd1]/40 bg-[#00ffd1]/5 text-[#bafff0]'
              : 'border-red-700 bg-red-950/20 text-red-300'
          }`}
        >
          {result.ok ? (
            <p>
              imported: {result.imported ?? 0}, failed: {result.failed ?? 0}, scanned:{' '}
              {result.scanned ?? 0}
            </p>
          ) : (
            <p>
              failed: {result.error || 'unknown'}
              {result.message ? ` - ${result.message}` : ''}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

