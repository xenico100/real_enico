'use client';

import { useEffect, useState } from 'react';
import { ArrowRight, Loader2 } from 'lucide-react';
import { useAuth } from '@/app/context/AuthContext';

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
            Supabase Config Required
          </h3>
          <p className="text-xs text-[#aaa] leading-relaxed">
            `.env.local`에 `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`를
            추가하면 ACCOUNT 로그인 UI가 활성화됩니다.
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
          Loading Identity State
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
                AUTHORIZED_IDENTITY
              </p>
              <h3 className="text-xl font-bold uppercase mt-2">
                {profile?.full_name || user.user_metadata?.full_name || 'Member'}
              </h3>
              <p className="text-xs text-[#00ffd1] mt-1 break-all">{user.email}</p>
            </div>
            <div className="w-14 h-14 rounded-full border border-[#333] bg-[#111] flex items-center justify-center text-[#00ffd1] text-xl">
              {(profile?.full_name || user.email || '?').slice(0, 1).toUpperCase()}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            <div className="border border-[#333] bg-[#111] p-3">
              <p className="text-[#666] mb-1">Provider</p>
              <p className="text-[#e5e5e5] uppercase">{profile?.provider || 'email'}</p>
            </div>
            <div className="border border-[#333] bg-[#111] p-3">
              <p className="text-[#666] mb-1">User ID</p>
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
            Refresh Profile
          </button>
          <button
            type="button"
            onClick={() => void signOut()}
            disabled={isBusy}
            className="py-3 bg-[#e5e5e5] text-black font-bold uppercase hover:bg-[#00ffd1] transition-colors disabled:opacity-50"
          >
            {isBusy ? 'Processing...' : 'Logout'}
          </button>
        </div>

        <div className="border border-red-900/50 bg-red-950/10 p-4">
          <p className="text-[10px] text-red-300/90 uppercase tracking-widest mb-2">
            Danger Zone
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
            Delete My Account
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 font-mono">
      <div className="border border-[#00ffd1]/40 bg-[linear-gradient(180deg,rgba(0,255,209,0.08),rgba(0,0,0,0))] p-5">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <p className="text-[10px] uppercase tracking-[0.18em] text-[#00ffd1]">Quick Access</p>
            <h3 className="text-lg font-bold uppercase mt-2">
              Google {mode === 'signup' ? 'Sign Up' : 'Login'}
            </h3>
            <p className="text-xs text-[#9a9a9a] mt-2 leading-relaxed">
              구글 버튼 1개로 로그인/회원가입 모두 가능합니다.
            </p>
          </div>
          <span className="border border-[#00ffd1]/40 bg-[#00ffd1]/10 text-[#00ffd1] text-[10px] px-2 py-1 uppercase tracking-widest">
            OAuth
          </span>
        </div>

        <button
          type="button"
          onClick={() => void signInWithGoogle()}
          disabled={isBusy}
          className="w-full py-4 px-4 bg-[#00ffd1] text-black font-bold uppercase tracking-[0.16em] hover:bg-[#b8fff1] transition-colors disabled:opacity-50 flex items-center justify-between"
        >
          <span>{isBusy ? 'Processing...' : 'Continue with Google'}</span>
          <ArrowRight size={16} />
        </button>

        <p className="text-[10px] text-[#666] mt-3">
          첫 로그인이어도 자동으로 계정 생성(회원가입)됩니다.
        </p>
      </div>

      <div className="bg-[#0a0a0a] border border-[#333] p-6">
        <div className="flex gap-2 mb-4">
          {(['login', 'signup'] as const).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setMode(item)}
              className={`flex-1 py-2.5 border uppercase text-xs tracking-widest transition-colors ${
                mode === item
                  ? 'bg-[#00ffd1] border-[#00ffd1] text-black font-bold'
                  : 'bg-[#111] border-[#333] text-[#888] hover:text-[#00ffd1] hover:border-[#00ffd1]'
              }`}
            >
              {item === 'login' ? 'Login' : 'Sign Up'}
            </button>
          ))}
        </div>

        <div className="border border-[#333] bg-[#101010] p-3 mb-4">
          <p className="text-[10px] uppercase tracking-widest text-[#666]">
            {mode === 'login' ? 'Email Login' : 'Email Sign Up'}
          </p>
          <p className="text-xs text-[#9a9a9a] mt-2 leading-relaxed">
            {mode === 'login'
              ? '이메일/비밀번호로 로그인합니다.'
              : '이메일 계정으로 회원가입합니다. 이름은 선택 입력입니다.'}
          </p>
        </div>

        <div className="relative my-4">
          <div className="h-px bg-[#333]" />
          <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-[#0a0a0a] px-2 text-[10px] text-[#666] uppercase">
            email form
          </span>
        </div>

        <form onSubmit={handleEmailAuth} className="space-y-4">
          {mode === 'signup' && (
            <div className="border border-[#333] bg-[#0b0b0b] p-3">
              <label className="block text-[10px] text-[#666] mb-2 uppercase">
                Full Name (optional)
              </label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full bg-black border border-[#333] py-3 px-3 text-sm focus:outline-none focus:border-[#00ffd1] text-[#e5e5e5]"
                placeholder="Your name"
                autoComplete="name"
              />
            </div>
          )}

          <div className="grid grid-cols-1 gap-4">
            <div>
              <label className="block text-[10px] text-[#666] mb-2 uppercase">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-black border border-[#333] py-3 px-3 text-sm focus:outline-none focus:border-[#00ffd1] text-[#e5e5e5]"
                placeholder="you@example.com"
                autoComplete="email"
                required
              />
            </div>

            <div>
              <label className="block text-[10px] text-[#666] mb-2 uppercase">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-black border border-[#333] py-3 px-3 text-sm focus:outline-none focus:border-[#00ffd1] text-[#e5e5e5]"
                placeholder="••••••••"
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                required
              />
            </div>
          </div>

          <div className="pt-1">
            <button
              type="submit"
              disabled={isBusy}
              className="w-full py-3.5 bg-[#e5e5e5] text-black font-bold uppercase hover:bg-[#00ffd1] transition-colors disabled:opacity-50"
            >
              {isBusy
                ? 'Processing...'
                : mode === 'login'
                  ? 'Login with Email'
                  : 'Create Account'}
            </button>
          </div>

          <div className="text-center pt-1">
            <p className="text-[10px] text-[#555] leading-relaxed">
              {mode === 'signup'
                ? '구글 버튼으로도 회원가입 가능합니다 (더 빠름).'
                : '구글 계정으로 바로 로그인도 가능합니다.'}
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
          Google 로그인은 Supabase Dashboard의 Provider + Redirect URL 설정이 먼저 되어 있어야
          정상 동작합니다.
        </p>
      </div>
    </div>
  );
}
