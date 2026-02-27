'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/app/context/AuthContext';
import GoogleLoginButton from '@/app/components/GoogleLoginButton';

type AuthMode = 'login' | 'signup';

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
    signUpWithEmail,
    signInWithGoogle,
    signOut,
    deleteMyAccount,
    refreshProfile,
  } = useAuth();

  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const modeConfig = {
    login: {
      title: '로그인',
      english: '로그인',
      emailLabel: '이메일 로그인',
      emailHint: '이메일/비밀번호로 바로 로그인합니다.',
      submitLabel: '이메일로 로그인',
      helper: '구글 계정으로 바로 로그인도 가능합니다.',
    },
    signup: {
      title: '회원가입',
      english: '회원가입',
      emailLabel: '이메일 회원가입',
      emailHint: '이메일 계정으로 회원가입합니다. 이름은 선택 입력입니다.',
      submitLabel: '이메일로 회원가입',
      helper: '구글 버튼으로도 회원가입 가능합니다 (더 빠름).',
    },
  } as const;
  const currentMode = modeConfig[mode];

  useEffect(() => {
    clearMessages();
  }, [mode, clearMessages]);

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email || !password) {
      return;
    }

    if (mode === 'login') {
      await signInWithEmail({ email, password });
      return;
    }

    await signUpWithEmail({ email, password, fullName });
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
    <div className="space-y-6 font-mono">
      <div className="border border-[#333] bg-[#0a0a0a] p-4 md:p-5">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div>
            <p className="text-[10px] uppercase tracking-[0.18em] text-[#666]">인증 모드</p>
            
            <p className="text-xs text-[#9a9a9a] mt-1">
              원하는 방식으로 로그인/회원가입을 선택하세요.
            </p>
          </div>
          <span className="border border-[#00ffd1]/30 bg-[#00ffd1]/10 text-[#00ffd1] text-[10px] px-2 py-1 uppercase tracking-widest">
            {currentMode.english}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {(['login', 'signup'] as const).map((item, index) => {
            const active = mode === item;
            return (
              <button
                key={item}
                type="button"
                onClick={() => setMode(item)}
                className={`relative border p-4 text-left transition-colors ${
                  active
                    ? 'border-[#00ffd1] bg-[#00ffd1]/10'
                    : 'border-[#333] bg-[#111] hover:border-[#00ffd1]/60'
                }`}
              >
                <span
                  className={`absolute inset-x-0 top-0 h-[2px] transition-opacity ${
                    active ? 'bg-[#00ffd1] opacity-100' : 'bg-[#00ffd1] opacity-0'
                  }`}
                />
                <p className={`text-[10px] tracking-[0.18em] uppercase ${active ? 'text-[#00ffd1]' : 'text-[#666]'}`}>
                  0{index + 1}
                </p>
                <p className={`mt-2 text-sm uppercase tracking-wide font-bold ${active ? 'text-[#eafffb]' : 'text-[#d0d0d0]'}`}>
                  {item === 'login' ? '로그인' : '회원가입'}
                </p>
                <p className="mt-1 text-[10px] text-[#777] uppercase tracking-widest">
                  {item === 'login' ? '기존 계정' : '새 계정 생성'}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      <div className="border border-[#00ffd1]/40 bg-[linear-gradient(180deg,rgba(0,255,209,0.08),rgba(0,0,0,0))] p-5">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <p className="text-[10px] uppercase tracking-[0.18em] text-[#00ffd1]">빠른 접근</p>
            
            <h3 className="text-lg font-bold uppercase mt-2">
              구글 {currentMode.title}
            </h3>
            <p className="text-xs text-[#9a9a9a] mt-2 leading-relaxed">
              구글 버튼 1개로 로그인/회원가입 모두 가능합니다.
            </p>
          </div>
          <span className="border border-[#00ffd1]/40 bg-[#00ffd1]/10 text-[#00ffd1] text-[10px] px-2 py-1 uppercase tracking-widest">
            소셜
          </span>
        </div>

        <GoogleLoginButton
          onLogin={() => signInWithGoogle()}
          disabled={isBusy}
          className="w-full py-4 px-4 bg-[#00ffd1] text-black font-bold uppercase tracking-[0.12em] hover:bg-[#b8fff1] transition-colors disabled:opacity-50 flex items-center justify-center gap-3"
        >
          <span>{isBusy ? '처리중...' : mode === 'signup' ? '구글 회원가입' : '구글 로그인'}</span>
        </GoogleLoginButton>

        <p className="text-[10px] text-[#666] mt-3">
          첫 로그인이어도 자동으로 계정 생성(회원가입)됩니다.
        </p>
      </div>

      <div className="bg-[#0a0a0a] border border-[#333] p-5 md:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-[#222] pb-4 mb-4">
          <div>
            <p className="text-[10px] uppercase tracking-[0.18em] text-[#666]">이메일 절차</p>
            
            <h3 className="text-base font-bold uppercase mt-2 text-[#e5e5e5]">
              {currentMode.emailLabel}
            </h3>
            <p className="text-xs text-[#9a9a9a] mt-2 leading-relaxed">
              {currentMode.emailHint}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 text-center shrink-0">
            <div className="border border-[#333] bg-[#111] px-3 py-2 min-w-[96px]">
              <p className="text-[10px] text-[#666] uppercase tracking-widest">모드</p>
              
              <p className="text-[11px] text-[#00ffd1] uppercase tracking-widest mt-1">
                {currentMode.english}
              </p>
            </div>
            <div className="border border-[#333] bg-[#111] px-3 py-2 min-w-[96px]">
              <p className="text-[10px] text-[#666] uppercase tracking-widest">수단</p>
              <p className="text-[11px] text-[#e5e5e5] uppercase tracking-widest mt-1">
                이메일
              </p>
            </div>
          </div>
        </div>

        <div className="relative my-4">
          <div className="h-px bg-[#333]" />
          <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-[#0a0a0a] px-2 text-[10px] text-[#666] uppercase">
            입력 폼
          </span>
        </div>

        <form onSubmit={handleEmailAuth} className="space-y-4">
          {mode === 'signup' && (
            <div className="border border-[#333] bg-[#0b0b0b] p-3 md:p-4">
              <label className="block text-[10px] text-[#666] mb-2 uppercase">
                이름 (선택)
              </label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full bg-black border border-[#333] py-3 px-3 text-sm focus:outline-none focus:border-[#00ffd1] focus:ring-1 focus:ring-[#00ffd1]/30 text-[#e5e5e5] placeholder:text-[#555]"
                placeholder="이름 입력"
                autoComplete="name"
              />
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 border border-[#222] bg-[#0d0d0d] p-3 md:p-4">
            <div className="border border-[#333] bg-black p-3">
              <label className="block text-[10px] text-[#666] mb-2 uppercase">이메일</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-[#050505] border border-[#333] py-3 px-3 text-sm focus:outline-none focus:border-[#00ffd1] focus:ring-1 focus:ring-[#00ffd1]/30 text-[#e5e5e5] placeholder:text-[#555]"
                placeholder="이메일 주소"
                autoComplete="email"
                required
              />
            </div>

            <div className="border border-[#333] bg-black p-3">
              <label className="block text-[10px] text-[#666] mb-2 uppercase">
                비밀번호
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-[#050505] border border-[#333] py-3 px-3 text-sm focus:outline-none focus:border-[#00ffd1] focus:ring-1 focus:ring-[#00ffd1]/30 text-[#e5e5e5] placeholder:text-[#555]"
                placeholder="••••••••"
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                required
              />
            </div>
          </div>

          <div className="pt-1 grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2 items-stretch">
            <button
              type="submit"
              disabled={isBusy}
              className="w-full py-3.5 bg-[#e5e5e5] text-black font-bold uppercase hover:bg-[#00ffd1] transition-colors disabled:opacity-50"
            >
              {isBusy ? '처리중...' : currentMode.submitLabel}
            </button>
            <div className="border border-[#333] bg-[#111] px-3 py-2 text-center sm:text-left">
              <p className="text-[10px] text-[#666] uppercase tracking-widest">상태</p>
              <p className="text-[11px] text-[#00ffd1] uppercase tracking-widest mt-1">
                {isBusy ? '처리중' : '준비됨'}
              </p>
            </div>
          </div>

          <div className="text-center pt-1">
            <p className="text-[10px] text-[#555] leading-relaxed">
              {currentMode.helper}
            </p>
          </div>
        </form>
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

      <div className="text-center">
        <p className="text-[10px] text-[#444] leading-relaxed">
          구글 로그인은 수파베이스 대시보드의 로그인 수단 + 리디렉트 주소 설정이 먼저 되어 있어야
          정상 동작합니다.
        </p>
      </div>
    </div>
  );
}
