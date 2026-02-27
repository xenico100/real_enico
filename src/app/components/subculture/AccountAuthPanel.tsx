'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/app/context/AuthContext';

export function AccountAuthPanel() {
  const {
    user,
    profile,
    isAuthenticated,
    isAuthReady,
    isConfigured,
    isBusy,
    statusMessage,
    errorMessage,
    clearMessages,
    signInWithEmail,
    signOut,
    deleteMyAccount,
    refreshProfile,
  } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showEmailForm, setShowEmailForm] = useState(false);

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();

    const normalizedEmail = email.trim();
    if (!normalizedEmail || !password) {
      return;
    }

    await signInWithEmail({ email: normalizedEmail, password });
  };

  const handleDeleteAccount = async () => {
    const confirmed = window.confirm(
      '정말 탈퇴할까요? profiles/auth.users 관련 데이터가 같이 삭제될 수 있습니다.',
    );
    if (!confirmed) return;

    await deleteMyAccount();
  };

  if (!isConfigured) {
    return (
      <div className="space-y-6 font-mono">
        <div className="bg-[#0a0a0a] border border-[#333] p-6">
          <h3 className="text-lg font-bold uppercase mb-3 text-[#00ffd1]">
            수파베이스 설정 필요
          </h3>
          <p className="text-xs text-[#aaa] leading-relaxed">
            `.env.local`에 `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`를
            추가하면 계정 로그인 UI가 활성화됩니다.
          </p>
        </div>
      </div>
    );
  }

  if (!isAuthReady) {
    return (
      <div className="bg-[#0a0a0a] border border-[#333] p-8 flex items-center justify-center gap-3 font-mono">
        <Loader2 className="w-4 h-4 animate-spin text-[#00ffd1]" />
        <span className="text-xs uppercase tracking-widest text-[#aaa]">
          신원 상태 불러오는 중
        </span>
      </div>
    );
  }

  if (isAuthenticated && user) {
    return (
      <div className="space-y-6 font-mono">
        <div className="bg-[#0a0a0a] border border-[#333] p-6">
          <div className="flex items-start justify-between gap-4 border-b border-[#333] pb-4 mb-4">
            <div>
              <p className="text-[10px] text-[#666] uppercase tracking-widest">
                인증된 신원
              </p>
              <h3 className="text-xl font-bold uppercase mt-2">
                {profile?.full_name || user.user_metadata?.full_name || '회원'}
              </h3>
              <p className="text-xs text-[#00ffd1] mt-1 break-all">{user.email}</p>
            </div>
            <div className="w-14 h-14 rounded-full border border-[#333] bg-[#111] flex items-center justify-center text-[#00ffd1] text-xl">
              {(profile?.full_name || user.email || '?').slice(0, 1).toUpperCase()}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            <div className="border border-[#333] bg-[#111] p-3">
              <p className="text-[#666] mb-1">로그인 수단</p>
              <p className="text-[#e5e5e5] uppercase">
                {profile?.provider === 'google' ? '구글' : '이메일'}
              </p>
            </div>
            <div className="border border-[#333] bg-[#111] p-3">
              <p className="text-[#666] mb-1">사용자 식별값</p>
              <p className="text-[#aaa] break-all">{user.id}</p>
            </div>
          </div>
        </div>

        {(statusMessage || errorMessage) && (
          <div
            className={`border p-4 text-xs ${
              errorMessage
                ? 'border-red-700 bg-red-950/20 text-red-300'
                : 'border-[#00ffd1]/40 bg-[#00ffd1]/5 text-[#bafff0]'
            }`}
          >
            {errorMessage || statusMessage}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => void refreshProfile()}
            disabled={isBusy}
            className="py-3 border border-[#333] bg-[#111] text-[#e5e5e5] hover:border-[#00ffd1] hover:text-[#00ffd1] transition-colors uppercase text-xs tracking-widest disabled:opacity-50"
          >
            프로필 새로고침
          </button>
          <button
            type="button"
            onClick={() => void signOut()}
            disabled={isBusy}
            className="py-3 bg-[#e5e5e5] text-black font-bold uppercase hover:bg-[#00ffd1] transition-colors disabled:opacity-50"
          >
            {isBusy ? '처리중...' : '로그아웃'}
          </button>
        </div>

        <div className="border border-red-900/50 bg-red-950/10 p-4">
          <p className="text-[10px] text-red-300/90 uppercase tracking-widest mb-2">
            위험 구역
          </p>
          <p className="text-xs text-[#999] leading-relaxed mb-4">
            회원탈퇴 시 `delete_my_account()` RPC를 호출합니다. `auth.users` 삭제에 연결된
            FK cascade 데이터도 함께 삭제될 수 있습니다.
          </p>
          <button
            type="button"
            onClick={() => void handleDeleteAccount()}
            disabled={isBusy}
            className="w-full py-3 border border-red-700 text-red-300 hover:bg-red-600 hover:text-white transition-colors uppercase text-xs tracking-widest disabled:opacity-50"
          >
            계정 삭제
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 font-mono">
      {!showEmailForm ? (
        <button
          type="button"
          onClick={() => {
            clearMessages();
            setShowEmailForm(true);
          }}
          className="w-full py-3.5 bg-[#e5e5e5] text-black font-bold uppercase hover:bg-[#00ffd1] transition-colors"
        >
          이메일 로그인
        </button>
      ) : (
        <form onSubmit={handleEmailAuth} className="space-y-4 border border-[#333] bg-[#0a0a0a] p-4 md:p-5">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full bg-[#050505] border border-[#333] py-3 px-3 text-sm focus:outline-none focus:border-[#00ffd1] focus:ring-1 focus:ring-[#00ffd1]/30 text-[#e5e5e5] placeholder:text-[#555]"
            placeholder="이메일 주소"
            autoComplete="email"
            required
          />

          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full bg-[#050505] border border-[#333] py-3 px-3 text-sm focus:outline-none focus:border-[#00ffd1] focus:ring-1 focus:ring-[#00ffd1]/30 text-[#e5e5e5] placeholder:text-[#555]"
            placeholder="비밀번호"
            autoComplete="current-password"
            required
          />

          <button
            type="submit"
            disabled={isBusy}
            className="w-full py-3.5 bg-[#e5e5e5] text-black font-bold uppercase hover:bg-[#00ffd1] transition-colors disabled:opacity-50"
          >
            {isBusy ? '처리중...' : '이메일 로그인'}
          </button>
        </form>
      )}

      {(statusMessage || errorMessage) && (
        <div
          className={`border p-4 text-xs ${
            errorMessage
              ? 'border-red-700 bg-red-950/20 text-red-300'
              : 'border-[#00ffd1]/40 bg-[#00ffd1]/5 text-[#bafff0]'
          }`}
        >
          {errorMessage || statusMessage}
        </div>
      )}
    </div>
  );
}
