'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { useAuth } from '@/app/context/AuthContext';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';

export default function ResetPasswordPage() {
  const {
    isAuthReady,
    isAuthenticated,
    isBusy,
    statusMessage,
    errorMessage,
    clearMessages,
    updatePassword,
    deleteMyAccount,
  } = useAuth();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isRecoveryBootstrapping, setIsRecoveryBootstrapping] = useState(true);
  const [recoveryBootstrapError, setRecoveryBootstrapError] = useState<string | null>(
    null,
  );

  useEffect(() => {
    clearMessages();
  }, [clearMessages]);

  useEffect(() => {
    let mounted = true;

    const bootstrapRecoverySession = async () => {
      if (typeof window === 'undefined') {
        if (mounted) setIsRecoveryBootstrapping(false);
        return;
      }

      const supabase = getSupabaseBrowserClient();
      if (!supabase) {
        if (mounted) {
          setRecoveryBootstrapError(
            'Supabase 설정이 없어 복구 링크를 처리할 수 없습니다.',
          );
          setIsRecoveryBootstrapping(false);
        }
        return;
      }

      try {
        const currentUrl = new URL(window.location.href);
        const code = currentUrl.searchParams.get('code');

        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
          currentUrl.searchParams.delete('code');
          currentUrl.searchParams.delete('type');
          window.history.replaceState(
            {},
            document.title,
            `${currentUrl.pathname}${currentUrl.search}`,
          );
        } else {
          const hashParams = new URLSearchParams(
            window.location.hash.startsWith('#')
              ? window.location.hash.slice(1)
              : window.location.hash,
          );
          const type = hashParams.get('type');
          const accessToken = hashParams.get('access_token');
          const refreshToken = hashParams.get('refresh_token');

          if (type === 'recovery' && accessToken && refreshToken) {
            const { error } = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            });
            if (error) throw error;
            window.history.replaceState(
              {},
              document.title,
              `${currentUrl.pathname}${currentUrl.search}`,
            );
          }
        }
      } catch (error) {
        if (mounted) {
          setRecoveryBootstrapError(
            error instanceof Error
              ? error.message
              : '복구 링크 세션을 처리하지 못했습니다.',
          );
        }
      } finally {
        if (mounted) {
          setIsRecoveryBootstrapping(false);
        }
      }
    };

    void bootstrapRecoverySession();

    return () => {
      mounted = false;
    };
  }, []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (password !== confirmPassword) {
      window.alert('비밀번호 확인이 일치하지 않습니다.');
      return;
    }
    await updatePassword(password);
    setPassword('');
    setConfirmPassword('');
  };

  const handleDeleteAccount = async () => {
    const confirmed = window.confirm(
      '정말 회원 탈퇴하시겠습니까? 계정과 연결된 데이터가 함께 삭제될 수 있습니다.',
    );
    if (!confirmed) return;
    await deleteMyAccount();
  };

  return (
    <main className="min-h-screen bg-[#050505] text-[#e5e5e5] px-4 py-10 font-mono">
      <div className="mx-auto w-full max-w-xl border border-[#333] bg-[#0a0a0a] p-6 md:p-8">
        <p className="text-[10px] uppercase tracking-[0.18em] text-[#666]">인증 설정</p>
        <h1 className="mt-2 text-2xl font-bold uppercase text-[#00ffd1]">비밀번호 재설정</h1>
        <p className="mt-2 text-xs text-[#9a9a9a] leading-relaxed">
          복구 링크로 접속한 뒤 새 비밀번호를 입력하세요. 필요하면 아래에서 회원 탈퇴도 가능합니다.
        </p>

        {!isAuthReady || isRecoveryBootstrapping ? (
          <div className="mt-6 border border-[#333] bg-[#111] p-4 text-xs text-[#888]">
            인증 상태 확인 중...
          </div>
        ) : !isAuthenticated ? (
          <div className="mt-6 space-y-3">
            {recoveryBootstrapError ? (
              <div className="border border-red-700 bg-red-950/20 p-4 text-xs text-red-300">
                {recoveryBootstrapError}
              </div>
            ) : null}
            <div className="border border-[#333] bg-[#111] p-4 text-xs text-[#bbb]">
              세션이 없습니다. 이메일로 받은 복구 링크를 다시 열어주세요.
            </div>
            <Link
              href="/"
              className="inline-flex items-center justify-center border border-[#333] px-3 py-2 text-xs uppercase tracking-widest hover:border-[#00ffd1] hover:text-[#00ffd1] transition-colors"
            >
              메인으로 이동
            </Link>
          </div>
        ) : (
          <>
            <form onSubmit={handleSubmit} className="mt-6 space-y-3">
              <div>
                <label className="block text-[10px] uppercase tracking-widest text-[#666] mb-2">
                  새 비밀번호
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="w-full bg-black border border-[#333] py-3 px-3 text-sm focus:outline-none focus:border-[#00ffd1] text-[#e5e5e5]"
                  placeholder="8자 이상"
                  autoComplete="new-password"
                  required
                  minLength={8}
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase tracking-widest text-[#666] mb-2">
                  비밀번호 확인
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  className="w-full bg-black border border-[#333] py-3 px-3 text-sm focus:outline-none focus:border-[#00ffd1] text-[#e5e5e5]"
                  placeholder="동일하게 입력"
                  autoComplete="new-password"
                  required
                  minLength={8}
                />
              </div>

              <button
                type="submit"
                disabled={isBusy}
                className="w-full py-3 border border-[#00ffd1] text-[#00ffd1] hover:bg-[#00ffd1] hover:text-black transition-colors text-xs uppercase tracking-widest disabled:opacity-50"
              >
                {isBusy ? '처리중...' : '비밀번호 변경'}
              </button>
            </form>

            <div className="mt-6 border border-red-900/50 bg-red-950/10 p-4">
              <p className="text-[10px] uppercase tracking-widest text-red-300 mb-2">회원 탈퇴</p>
              <p className="text-xs text-[#999] leading-relaxed mb-3">
                탈퇴하면 계정과 연결된 데이터가 삭제될 수 있습니다.
              </p>
              <button
                type="button"
                onClick={() => void handleDeleteAccount()}
                disabled={isBusy}
                className="w-full py-3 border border-red-700 text-red-300 hover:bg-red-600 hover:text-white transition-colors text-xs uppercase tracking-widest disabled:opacity-50"
              >
                회원 탈퇴 실행
              </button>
            </div>
          </>
        )}

        {(statusMessage || errorMessage) && (
          <div
            className={`mt-6 border p-3 text-xs ${
              errorMessage
                ? 'border-red-700 bg-red-950/20 text-red-300'
                : 'border-[#00ffd1]/40 bg-[#00ffd1]/5 text-[#bafff0]'
            }`}
          >
            {errorMessage || statusMessage}
          </div>
        )}
      </div>
    </main>
  );
}
