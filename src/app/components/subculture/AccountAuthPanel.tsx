'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/app/context/AuthContext';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';

type AuthTab = 'login' | 'signup' | 'recover' | 'guestOrder';
type ShippingStatus = 'preparing' | 'shipping' | 'delivered';

type GuestLookupOrder = {
  orderCode: string;
  guestOrderNumber: string;
  paymentMethod: string;
  paymentStatus: string;
  amountTotal: number;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  customerAddress: string;
  shippingStatus: ShippingStatus;
  shippingCompany: string;
  trackingNumber: string;
  shippingNote: string;
  shippedAt: string | null;
  deliveredAt: string | null;
  createdAt: string | null;
};

function formatKrw(value: number) {
  return `${Math.round(value).toLocaleString('ko-KR')}원`;
}

function formatDateTime(value: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function getShippingStatusLabel(status: ShippingStatus) {
  if (status === 'shipping') return '배송중';
  if (status === 'delivered') return '배송완료';
  return '배송준비중';
}

function GoogleIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-4 w-4"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M22 12.2727C22 11.4218 21.9236 10.6036 21.7818 9.81818H12V13.84H17.5855C17.3455 15.1331 16.6182 16.2291 15.5222 16.9636V19.5727H18.8836C20.8509 17.7618 22 15.0964 22 12.2727Z"
        fill="#4285F4"
      />
      <path
        d="M12 22.4545C14.8036 22.4545 17.1527 21.5255 18.8836 19.5727L15.5222 16.9636C14.5931 17.5855 13.4055 17.9545 12 17.9545C9.29454 17.9545 7.00363 16.1273 6.18726 13.6709H2.71271V16.3655C4.43635 19.7909 7.9818 22.4545 12 22.4545Z"
        fill="#34A853"
      />
      <path
        d="M6.18727 13.6709C5.97909 13.0482 5.86091 12.3818 5.86091 11.6955C5.86091 11.0091 5.97909 10.3427 6.18727 9.72001V7.02545H2.71272C2.00454 8.43636 1.6 10.0309 1.6 11.6955C1.6 13.36 2.00454 14.9545 2.71272 16.3655L6.18727 13.6709Z"
        fill="#FBBC04"
      />
      <path
        d="M12 5.43636C13.5331 5.43636 14.9091 5.96364 15.9909 7L18.96 4.03091C17.1482 2.34636 14.7991 1.27273 12 1.27273C7.98182 1.27273 4.43636 3.93636 2.71272 7.36182L6.18727 10.0564C7.00364 7.60001 9.29455 5.43636 12 5.43636Z"
        fill="#EA4335"
      />
    </svg>
  );
}

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

  const [activeTab, setActiveTab] = useState<AuthTab>('login');
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [signupName, setSignupName] = useState('');
  const [signupPhone, setSignupPhone] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [signupPasswordConfirm, setSignupPasswordConfirm] = useState('');
  const [signupError, setSignupError] = useState<string | null>(null);
  const [recoverName, setRecoverName] = useState('');
  const [recoverPhone, setRecoverPhone] = useState('');
  const [recoverEmail, setRecoverEmail] = useState('');
  const [recoverError, setRecoverError] = useState<string | null>(null);
  const [recoverMessage, setRecoverMessage] = useState<string | null>(null);
  const [foundEmails, setFoundEmails] = useState<string[]>([]);
  const [isFindingId, setIsFindingId] = useState(false);
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  const [guestLookupPhone, setGuestLookupPhone] = useState('');
  const [guestOrderPassword, setGuestOrderPassword] = useState('');
  const [isLookupLoading, setIsLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [lookupOrder, setLookupOrder] = useState<GuestLookupOrder | null>(null);

  const openLoginTab = () => {
    setActiveTab('login');
    clearMessages();
    setSignupError(null);
    setRecoverError(null);
    setRecoverMessage(null);
    setLookupError(null);
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setSignupError(null);

    const normalizedEmail = loginEmail.trim();
    if (!normalizedEmail || !loginPassword) return;

    await signInWithEmail({ email: normalizedEmail, password: loginPassword });
  };

  const handleGoogleAuth = async () => {
    setSignupError(null);
    await signInWithGoogle();
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setSignupError(null);

    const fullName = signupName.trim();
    const phone = signupPhone.trim();
    const email = signupEmail.trim();
    const password = signupPassword;
    const passwordConfirm = signupPasswordConfirm;

    if (!fullName || !phone || !email || !password || !passwordConfirm) {
      setSignupError('이름, 전화번호, 이메일, 비밀번호를 모두 입력해 주세요.');
      return;
    }

    if (password.length < 8) {
      setSignupError('비밀번호는 8자 이상 입력해 주세요.');
      return;
    }

    if (password !== passwordConfirm) {
      setSignupError('비밀번호 확인이 일치하지 않습니다.');
      return;
    }

    const result = await signUpWithEmail({
      email,
      password,
      fullName,
      phone,
    });

    if (result?.requiresEmailConfirmation) {
      window.alert('회원가입이 완료되었습니다. 메일함에서 인증 메일을 확인해 주세요.');
      setSignupPassword('');
      setSignupPasswordConfirm('');
      openLoginTab();
    }
  };

  const handleFindEmail = async (event: React.FormEvent) => {
    event.preventDefault();
    setRecoverError(null);
    setRecoverMessage(null);
    setFoundEmails([]);

    const fullName = recoverName.trim();
    const phone = recoverPhone.trim();
    if (!fullName || !phone) {
      setRecoverError('이름과 전화번호를 모두 입력해 주세요.');
      return;
    }

    setIsFindingId(true);
    try {
      const response = await fetch('/api/auth/find-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fullName, phone }),
      });

      const payload = (await response.json()) as {
        message?: string;
        emails?: string[];
      };
      if (!response.ok) {
        throw new Error(payload.message || '아이디 찾기 실패');
      }

      const emails = Array.isArray(payload.emails) ? payload.emails : [];
      setFoundEmails(emails);
      setRecoverMessage(payload.message || '일치하는 계정을 찾았습니다.');
    } catch (error) {
      setRecoverError(error instanceof Error ? error.message : '아이디 찾기 실패');
    } finally {
      setIsFindingId(false);
    }
  };

  const handlePasswordReset = async (event: React.FormEvent) => {
    event.preventDefault();
    setRecoverError(null);
    setRecoverMessage(null);

    const email = recoverEmail.trim();
    if (!email) {
      setRecoverError('비밀번호 재설정 이메일을 입력해 주세요.');
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setRecoverError('Supabase 설정이 없어 비밀번호 재설정을 진행할 수 없습니다.');
      return;
    }

    setIsResettingPassword(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/reset_password`,
      });
      if (error) throw error;

      setRecoverMessage('비밀번호 재설정 메일을 보냈습니다. 메일함을 확인해 주세요.');
    } catch (error) {
      setRecoverError(error instanceof Error ? error.message : '비밀번호 재설정 요청 실패');
    } finally {
      setIsResettingPassword(false);
    }
  };

  const handleDeleteAccount = async () => {
    const confirmed = window.confirm(
      '정말 탈퇴할까요? profiles/auth.users 관련 데이터가 같이 삭제될 수 있습니다.',
    );
    if (!confirmed) return;

    await deleteMyAccount();
  };

  const handleGuestLookup = async (event: React.FormEvent) => {
    event.preventDefault();
    setLookupError(null);
    setLookupOrder(null);

    const normalizedPhone = guestLookupPhone.trim();
    const normalizedPassword = guestOrderPassword.trim();
    if (!normalizedPhone || !normalizedPassword) {
      setLookupError('주문한 핸드폰 번호와 주문 비밀번호를 입력해 주세요.');
      return;
    }

    setIsLookupLoading(true);
    try {
      const response = await fetch('/api/orders/guest-lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: normalizedPhone,
          password: normalizedPassword,
        }),
      });

      const payload = (await response.json()) as {
        message?: string;
        order?: GuestLookupOrder;
      };
      if (!response.ok) {
        throw new Error(payload.message || '비회원 주문조회 실패');
      }

      if (!payload.order) {
        throw new Error('주문 정보를 찾을 수 없습니다.');
      }

      setLookupOrder(payload.order);
    } catch (error) {
      setLookupError(error instanceof Error ? error.message : '비회원 주문조회 실패');
    } finally {
      setIsLookupLoading(false);
    }
  };

  if (!isConfigured) {
    return (
      <div className="space-y-6 font-mono">
        <div className="bg-white border border-[#d1d5db] p-6 shadow-sm">
          <h3 className="text-lg font-bold uppercase mb-3 text-[#b8001f]">
            수파베이스 설정 필요
          </h3>
          <p className="text-xs text-[#4b5563] leading-relaxed font-medium">
            `.env.local`에 `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`를
            추가하면 계정 로그인 UI가 활성화됩니다.
          </p>
        </div>
      </div>
    );
  }

  if (!isAuthReady) {
    return (
      <div className="bg-white border border-[#d1d5db] p-8 flex items-center justify-center gap-3 font-mono shadow-sm">
        <Loader2 className="w-4 h-4 animate-spin text-[#b8001f]" />
        <span className="text-xs uppercase tracking-widest text-[#4b5563] font-bold">
          신원 상태 불러오는 중
        </span>
      </div>
    );
  }

  if (isAuthenticated && user) {
    return (
      <div className="space-y-6 font-mono">
        <div className="bg-white border border-[#d1d5db] p-6 shadow-sm">
          <div className="flex items-start justify-between gap-4 border-b border-[#d1d5db] pb-4 mb-4">
            <div>
              <p className="text-[10px] text-[#6b7280] uppercase tracking-widest font-bold">
                인증된 신원
              </p>
              <h3 className="text-xl font-bold uppercase mt-2 text-[#111827]">
                {profile?.full_name || user.user_metadata?.full_name || '회원'}
              </h3>
              <p className="text-xs text-[#b8001f] mt-1 break-all font-semibold">{user.email}</p>
            </div>
            <div className="w-14 h-14 rounded-full border border-[#d1d5db] bg-[#f8f9fa] flex items-center justify-center text-[#b8001f] text-xl font-black shadow-inner">
              {(profile?.full_name || user.email || '?').slice(0, 1).toUpperCase()}
            </div>
          </div>
        </div>

        {(statusMessage || errorMessage) && (
          <div
            className={`border p-4 text-xs font-semibold ${
              errorMessage
                ? 'border-red-500 bg-red-50 text-red-800'
                : 'border-[#b8001f]/40 bg-[#fff1f2] text-[#8f0018]'
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
            className="py-3 border border-[#d1d5db] bg-white text-[#111827] hover:border-[#b8001f] hover:text-[#b8001f] transition-colors uppercase text-xs font-bold tracking-widest disabled:opacity-50 shadow-sm"
          >
            프로필 새로고침
          </button>
          <button
            type="button"
            onClick={() => void signOut()}
            disabled={isBusy}
            className="py-3 bg-[#111827] text-white font-bold uppercase hover:bg-[#b8001f] transition-colors disabled:opacity-50 shadow-sm"
          >
            {isBusy ? '처리중...' : '로그아웃'}
          </button>
        </div>

        <div className="border border-red-200 bg-red-50 p-4 shadow-sm">
          <p className="text-[10px] text-red-600 font-bold uppercase tracking-widest mb-2">
            위험 구역
          </p>
          <p className="text-xs text-[#4b5563] font-medium leading-relaxed mb-4">
            회원탈퇴 시 `delete_my_account()` RPC를 호출합니다. `auth.users` 삭제에 연결된
            FK cascade 데이터도 함께 삭제될 수 있습니다.
          </p>
          <button
            type="button"
            onClick={() => void handleDeleteAccount()}
            disabled={isBusy}
            className="w-full py-3 border border-red-500 text-red-600 hover:bg-red-600 hover:text-white transition-colors uppercase text-xs font-bold tracking-widest disabled:opacity-50 shadow-sm"
          >
            계정 삭제
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[860px] space-y-5 font-mono text-[#111827]">
      <div className="mx-auto grid w-full max-w-[760px] grid-cols-1 gap-2 rounded-[1.9rem] border border-[#d1d5db] bg-[#f8f9fa] p-2 shadow-sm sm:grid-cols-3">
        <button
          type="button"
          onClick={openLoginTab}
          className={`min-h-[64px] rounded-[1.2rem] border px-4 py-4 text-center text-[13px] font-bold leading-tight transition-all duration-200 ${
            activeTab === 'login'
              ? 'border-[#b8001f] bg-white text-[#b8001f] shadow-md'
              : 'border-transparent bg-transparent text-[#4b5563] hover:-translate-y-[1px] hover:border-[#d1d5db] hover:bg-white hover:text-[#111827]'
          }`}
        >
          로그인
        </button>
        <button
          type="button"
          onClick={() => {
            setActiveTab('signup');
            clearMessages();
            setSignupError(null);
          }}
          className={`min-h-[64px] rounded-[1.2rem] border px-4 py-4 text-center text-[13px] font-bold leading-tight transition-all duration-200 ${
            activeTab === 'signup'
              ? 'border-[#b8001f] bg-white text-[#b8001f] shadow-md'
              : 'border-transparent bg-transparent text-[#4b5563] hover:-translate-y-[1px] hover:border-[#d1d5db] hover:bg-white hover:text-[#111827]'
          }`}
        >
          회원가입
        </button>
        <button
          type="button"
          onClick={() => {
            setActiveTab('recover');
            clearMessages();
          }}
          className={`min-h-[64px] rounded-[1.2rem] border px-4 py-4 text-center text-[13px] font-bold leading-tight transition-all duration-200 ${
            activeTab === 'recover'
              ? 'border-[#b8001f] bg-white text-[#b8001f] shadow-md'
              : 'border-transparent bg-transparent text-[#4b5563] hover:-translate-y-[1px] hover:border-[#d1d5db] hover:bg-white hover:text-[#111827]'
          }`}
        >
          아이디/비번 찾기
        </button>
      </div>

      {activeTab === 'login' && (
        <div className="mx-auto w-full max-w-[760px] rounded-[2rem] border border-[#d1d5db] bg-white p-4 md:p-6 shadow-sm">
          <div className="flex w-full justify-center">
            <form
              onSubmit={handleEmailAuth}
              className="mx-auto w-full max-w-[580px] space-y-5 rounded-[1.9rem] border border-[#d1d5db] bg-[#f8f9fa] p-5 shadow-sm md:p-7"
            >
              <div className="space-y-2 border-b border-[#d1d5db] pb-4">
                <p className="text-[11px] font-bold tracking-[0.24em] text-[#b8001f]">이메일 로그인</p>
                <div className="space-y-1">
                  <h4 className="text-xl font-bold text-[#111827]">로그인 / 주문조회</h4>
                  <p className="text-sm leading-6 text-[#4b5563] font-medium">
                    이메일과 비밀번호를 입력하고 로그인하세요.
                  </p>
                </div>
              </div>
              <div className="space-y-2">
                <label className="block text-[12px] font-bold text-[#111827]">이메일</label>
                <input
                  type="email"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  className="min-h-[58px] w-full rounded-2xl border border-[#d1d5db] bg-white px-4 text-base text-[#111827] placeholder:text-[#9ca3af] focus:border-[#b8001f] focus:outline-none font-medium shadow-inner"
                  placeholder="이메일 주소"
                  autoComplete="email"
                  required
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <label className="block text-[12px] font-bold text-[#111827]">비밀번호</label>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab('recover');
                      clearMessages();
                    }}
                    className="text-[12px] font-bold text-[#b8001f] transition-colors hover:underline"
                  >
                    아이디/비번 찾기
                  </button>
                </div>
                <input
                  type="password"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  className="min-h-[58px] w-full rounded-2xl border border-[#d1d5db] bg-white px-4 text-base text-[#111827] placeholder:text-[#9ca3af] focus:border-[#b8001f] focus:outline-none font-medium shadow-inner"
                  placeholder="비밀번호"
                  autoComplete="current-password"
                  required
                />
              </div>
              <button
                type="submit"
                disabled={isBusy}
                className="min-h-[60px] w-full rounded-2xl border border-[#b8001f] bg-[#b8001f] px-4 py-3 text-base font-bold text-white transition-all hover:-translate-y-[1px] hover:bg-[#9a0019] shadow-md disabled:opacity-50"
              >
                <span className="text-white font-bold">{isBusy ? '처리중...' : '이메일 로그인'}</span>
              </button>
              <div className="flex items-center gap-3 py-1.5">
                <div className="h-px flex-1 bg-[#d1d5db]" />
                <span className="text-[11px] tracking-[0.22em] text-[#6b7280] font-bold">또는</span>
                <div className="h-px flex-1 bg-[#d1d5db]" />
              </div>
              <button
                type="button"
                onClick={() => void handleGoogleAuth()}
                disabled={isBusy}
                className="inline-flex min-h-[60px] w-full items-center justify-center gap-3 rounded-2xl border border-[#d1d5db] bg-white px-4 py-3 text-base font-bold text-[#111827] transition-all hover:-translate-y-[1px] hover:border-[#b8001f] shadow-sm disabled:opacity-50"
              >
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[#f8f9fa] text-[#111827] border border-[#e5e7eb]">
                  <GoogleIcon />
                </span>
                <span>{isBusy ? '처리중...' : '구글 로그인'}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveTab('guestOrder');
                  clearMessages();
                }}
                className="inline-flex min-h-[60px] w-full items-center justify-center rounded-2xl border border-[#d1d5db] bg-white px-4 py-3 text-base font-bold text-[#111827] transition-all hover:-translate-y-[1px] hover:border-[#b8001f] hover:text-[#b8001f] shadow-sm"
              >
                비회원 주문조회
              </button>
            </form>
          </div>
        </div>
      )}

      {activeTab === 'signup' && (
        <form onSubmit={handleSignUp} className="mx-auto w-full max-w-[760px] space-y-3 border border-[#d1d5db] bg-white p-4 md:p-5 shadow-sm rounded-[2rem]">
          <input
            type="text"
            value={signupName}
            onChange={(event) => setSignupName(event.target.value)}
            className="w-full bg-[#f8f9fa] border border-[#d1d5db] py-3 px-3 text-sm focus:outline-none focus:border-[#b8001f] text-[#111827] font-medium rounded-xl"
            placeholder="이름"
            required
          />
          <input
            type="tel"
            value={signupPhone}
            onChange={(event) => setSignupPhone(event.target.value)}
            className="w-full bg-[#f8f9fa] border border-[#d1d5db] py-3 px-3 text-sm focus:outline-none focus:border-[#b8001f] text-[#111827] font-medium rounded-xl"
            placeholder="전화번호"
            required
          />
          <input
            type="email"
            value={signupEmail}
            onChange={(event) => setSignupEmail(event.target.value)}
            className="w-full bg-[#f8f9fa] border border-[#d1d5db] py-3 px-3 text-sm focus:outline-none focus:border-[#b8001f] text-[#111827] font-medium rounded-xl"
            placeholder="이메일"
            required
          />
          <input
            type="password"
            value={signupPassword}
            onChange={(event) => setSignupPassword(event.target.value)}
            className="w-full bg-[#f8f9fa] border border-[#d1d5db] py-3 px-3 text-sm focus:outline-none focus:border-[#b8001f] text-[#111827] font-medium rounded-xl"
            placeholder="비밀번호 (8자 이상)"
            required
          />
          <input
            type="password"
            value={signupPasswordConfirm}
            onChange={(event) => setSignupPasswordConfirm(event.target.value)}
            className="w-full bg-[#f8f9fa] border border-[#d1d5db] py-3 px-3 text-sm focus:outline-none focus:border-[#b8001f] text-[#111827] font-medium rounded-xl"
            placeholder="비밀번호 확인"
            required
          />
          <button
            type="submit"
            disabled={isBusy}
            className="w-full py-3.5 bg-[#b8001f] text-white font-bold uppercase hover:bg-[#9a0019] transition-colors rounded-xl shadow-md disabled:opacity-50"
          >
            {isBusy ? '처리중...' : '이메일 회원가입'}
          </button>
          <button
            type="button"
            onClick={openLoginTab}
            className="w-full py-3 text-xs font-bold uppercase tracking-widest text-[#6b7280] transition-colors hover:text-[#b8001f]"
          >
            로그인으로 돌아가기
          </button>
        </form>
      )}

      {activeTab === 'recover' && (
        <div className="mx-auto w-full max-w-[760px] space-y-4 border border-[#d1d5db] bg-white p-4 md:p-5 shadow-sm rounded-[2rem]">
          <form onSubmit={handleFindEmail} className="space-y-3">
            <p className="text-xs text-[#b8001f] font-bold uppercase tracking-widest">아이디(이메일) 찾기</p>
            <input
              type="text"
              value={recoverName}
              onChange={(event) => setRecoverName(event.target.value)}
              className="w-full bg-[#f8f9fa] border border-[#d1d5db] py-3 px-3 text-sm focus:outline-none focus:border-[#b8001f] text-[#111827] font-medium rounded-xl"
              placeholder="이름"
              required
            />
            <input
              type="tel"
              value={recoverPhone}
              onChange={(event) => setRecoverPhone(event.target.value)}
              className="w-full bg-[#f8f9fa] border border-[#d1d5db] py-3 px-3 text-sm focus:outline-none focus:border-[#b8001f] text-[#111827] font-medium rounded-xl"
              placeholder="전화번호"
              required
            />
            <button
              type="submit"
              disabled={isFindingId}
              className="w-full py-3 border border-[#b8001f] text-[#b8001f] hover:bg-[#b8001f] hover:text-white transition-colors uppercase text-xs font-bold tracking-widest rounded-xl shadow-sm disabled:opacity-50"
            >
              {isFindingId ? '조회중...' : '아이디 찾기'}
            </button>
          </form>

          {foundEmails.length > 0 && (
            <div className="border border-[#d1d5db] bg-[#f8f9fa] p-3 text-xs rounded-xl">
              <p className="text-[#4b5563] font-bold mb-2">조회 결과</p>
              {foundEmails.map((email) => (
                <p key={email} className="text-[#111827] font-semibold">{email}</p>
              ))}
            </div>
          )}

          <form onSubmit={handlePasswordReset} className="space-y-3 pt-3 border-t border-[#d1d5db]">
            <p className="text-xs text-[#b8001f] font-bold uppercase tracking-widest">비밀번호 찾기</p>
            <input
              type="email"
              value={recoverEmail}
              onChange={(event) => setRecoverEmail(event.target.value)}
              className="w-full bg-[#f8f9fa] border border-[#d1d5db] py-3 px-3 text-sm focus:outline-none focus:border-[#b8001f] text-[#111827] font-medium rounded-xl"
              placeholder="가입 이메일"
              required
            />
            <button
              type="submit"
              disabled={isResettingPassword}
              className="w-full py-3 border border-[#b8001f] text-[#b8001f] hover:bg-[#b8001f] hover:text-white transition-colors uppercase text-xs font-bold tracking-widest rounded-xl shadow-sm disabled:opacity-50"
            >
              {isResettingPassword ? '전송중...' : '비밀번호 재설정 메일 보내기'}
            </button>
          </form>
          <button
            type="button"
            onClick={openLoginTab}
            className="w-full py-3 text-xs font-bold uppercase tracking-widest text-[#6b7280] transition-colors hover:text-[#b8001f]"
          >
            로그인으로 돌아가기
          </button>
        </div>
      )}

      {activeTab === 'guestOrder' && (
        <div className="mx-auto w-full max-w-[760px] space-y-4 border border-[#d1d5db] bg-white p-4 md:p-5 shadow-sm rounded-[2rem]">
          <div className="border border-[#b8001f]/35 bg-[#fff1f2] px-4 py-3 rounded-xl">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#b8001f]">
              Mobile Guest Lookup
            </p>
            <p className="mt-2 text-xs font-medium leading-relaxed text-[#881337]">
              모바일에서 주문한 핸드폰 번호와 주문 비밀번호로 바로 배송조회할 수 있습니다.
            </p>
          </div>
          <form onSubmit={handleGuestLookup} className="space-y-3">
            <input
              type="tel"
              value={guestLookupPhone}
              onChange={(event) => setGuestLookupPhone(event.target.value)}
              className="w-full bg-[#f8f9fa] border border-[#d1d5db] py-3 px-3 text-sm focus:outline-none focus:border-[#b8001f] text-[#111827] font-medium rounded-xl"
              placeholder="주문한 핸드폰 번호"
            />
            <input
              type="password"
              value={guestOrderPassword}
              onChange={(event) => setGuestOrderPassword(event.target.value)}
              className="w-full bg-[#f8f9fa] border border-[#d1d5db] py-3 px-3 text-sm focus:outline-none focus:border-[#b8001f] text-[#111827] font-medium rounded-xl"
              placeholder="주문 시 설정한 비밀번호"
              required
            />
            <p className="text-[11px] font-medium leading-relaxed text-[#4b5563]">
              주문 직후 안내받은 비회원 주문 비밀번호를 함께 입력하면 바로 조회됩니다.
            </p>
            <button
              type="submit"
              disabled={isLookupLoading}
              className="w-full py-3.5 bg-[#b8001f] text-white font-bold uppercase hover:bg-[#9a0019] transition-colors rounded-xl shadow-md disabled:opacity-50"
            >
              {isLookupLoading ? '조회중...' : '비회원 주문조회'}
            </button>
          </form>
          <button
            type="button"
            onClick={openLoginTab}
            className="w-full py-3 text-xs font-bold uppercase tracking-widest text-[#6b7280] transition-colors hover:text-[#b8001f]"
          >
            로그인으로 돌아가기
          </button>

          {lookupError && (
            <div className="border border-red-500 bg-red-50 p-3 text-xs font-semibold text-red-800 rounded-xl">
              {lookupError}
            </div>
          )}

          {lookupOrder && (
            <div className="space-y-3 border border-[#b8001f]/40 bg-[#fff1f2] p-4 rounded-xl">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-bold text-[#b8001f] uppercase tracking-widest">
                  비회원 주문 조회 결과
                </p>
                <p className="text-[11px] font-semibold text-[#881337]">{lookupOrder.customerPhone || '-'}</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                <div className="border border-[#d1d5db] bg-white p-3 rounded-lg shadow-sm">
                  <p className="text-[#6b7280] font-bold mb-1">배송 상태</p>
                  <p className="text-[#111827] font-semibold">
                    {getShippingStatusLabel(lookupOrder.shippingStatus)}
                  </p>
                </div>
                <div className="border border-[#d1d5db] bg-white p-3 rounded-lg shadow-sm">
                  <p className="text-[#6b7280] font-bold mb-1">결제 금액</p>
                  <p className="text-[#111827] font-semibold">{formatKrw(lookupOrder.amountTotal || 0)}</p>
                </div>
                <div className="border border-[#d1d5db] bg-white p-3 rounded-lg shadow-sm">
                  <p className="text-[#6b7280] font-bold mb-1">택배사</p>
                  <p className="text-[#111827] font-semibold">{lookupOrder.shippingCompany || '-'}</p>
                </div>
                <div className="border border-[#d1d5db] bg-white p-3 rounded-lg shadow-sm">
                  <p className="text-[#6b7280] font-bold mb-1">운송장번호</p>
                  <p className="text-[#111827] font-semibold break-all">{lookupOrder.trackingNumber || '-'}</p>
                </div>
              </div>
              <div className="border border-[#d1d5db] bg-white p-3 text-xs rounded-lg shadow-sm">
                <p className="text-[#6b7280] font-bold mb-1">배송 메모</p>
                <p className="text-[#111827] font-semibold">{lookupOrder.shippingNote || '-'}</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                <div className="border border-[#d1d5db] bg-white p-3 rounded-lg shadow-sm">
                  <p className="text-[#6b7280] font-bold mb-1">발송일시</p>
                  <p className="text-[#111827] font-semibold">{formatDateTime(lookupOrder.shippedAt)}</p>
                </div>
                <div className="border border-[#d1d5db] bg-white p-3 rounded-lg shadow-sm">
                  <p className="text-[#6b7280] font-bold mb-1">배송완료일시</p>
                  <p className="text-[#111827] font-semibold">{formatDateTime(lookupOrder.deliveredAt)}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {(statusMessage || errorMessage || signupError || recoverError || recoverMessage) && (
        <div
          className={`border p-4 text-xs font-semibold rounded-xl ${
            errorMessage || signupError || recoverError
              ? 'border-red-500 bg-red-50 text-red-800'
              : 'border-[#b8001f]/40 bg-[#fff1f2] text-[#8f0018]'
          }`}
        >
          {signupError || recoverError || errorMessage || recoverMessage || statusMessage}
        </div>
      )}
    </div>
  );
}
