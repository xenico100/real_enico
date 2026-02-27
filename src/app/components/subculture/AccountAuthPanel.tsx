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
  const [guestOrderNumber, setGuestOrderNumber] = useState('');
  const [guestOrderPassword, setGuestOrderPassword] = useState('');
  const [isLookupLoading, setIsLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [lookupOrder, setLookupOrder] = useState<GuestLookupOrder | null>(null);

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

    await signUpWithEmail({
      email,
      password,
      fullName,
      phone,
    });
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

    const normalizedOrderNumber = guestOrderNumber.trim().toUpperCase();
    const normalizedPassword = guestOrderPassword.trim();
    if (!normalizedOrderNumber || !normalizedPassword) {
      setLookupError('비회원 주문번호와 비밀번호를 모두 입력해 주세요.');
      return;
    }

    setIsLookupLoading(true);
    try {
      const response = await fetch('/api/orders/guest-lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          guestOrderNumber: normalizedOrderNumber,
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
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <button
          type="button"
          onClick={() => {
            setActiveTab('login');
            clearMessages();
            setSignupError(null);
          }}
          className={`py-3 border text-xs uppercase tracking-widest transition-colors ${
            activeTab === 'login'
              ? 'border-[#00ffd1] bg-[#00ffd1]/10 text-[#00ffd1]'
              : 'border-[#333] bg-[#111] text-[#999] hover:border-[#00ffd1]/60'
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
          className={`py-3 border text-xs uppercase tracking-widest transition-colors ${
            activeTab === 'signup'
              ? 'border-[#00ffd1] bg-[#00ffd1]/10 text-[#00ffd1]'
              : 'border-[#333] bg-[#111] text-[#999] hover:border-[#00ffd1]/60'
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
          className={`py-3 border text-xs uppercase tracking-widest transition-colors ${
            activeTab === 'recover'
              ? 'border-[#00ffd1] bg-[#00ffd1]/10 text-[#00ffd1]'
              : 'border-[#333] bg-[#111] text-[#999] hover:border-[#00ffd1]/60'
          }`}
        >
          아이디/비번 찾기
        </button>
        <button
          type="button"
          onClick={() => {
            setActiveTab('guestOrder');
            clearMessages();
          }}
          className={`py-3 border text-xs uppercase tracking-widest transition-colors ${
            activeTab === 'guestOrder'
              ? 'border-[#00ffd1] bg-[#00ffd1]/10 text-[#00ffd1]'
              : 'border-[#333] bg-[#111] text-[#999] hover:border-[#00ffd1]/60'
          }`}
        >
          비회원 주문조회
        </button>
      </div>

      {activeTab === 'login' && (
        <div className="space-y-4 border border-[#333] bg-[#0a0a0a] p-4 md:p-5">
          <button
            type="button"
            onClick={() => void handleGoogleAuth()}
            disabled={isBusy}
            className="w-full py-3.5 border border-[#00ffd1] text-[#00ffd1] hover:bg-[#00ffd1] hover:text-black transition-colors uppercase text-xs tracking-widest disabled:opacity-50"
          >
            {isBusy ? '처리중...' : '구글 로그인'}
          </button>

          <form onSubmit={handleEmailAuth} className="space-y-3">
            <input
              type="email"
              value={loginEmail}
              onChange={(e) => setLoginEmail(e.target.value)}
              className="w-full bg-[#050505] border border-[#333] py-3 px-3 text-sm focus:outline-none focus:border-[#00ffd1] text-[#e5e5e5]"
              placeholder="이메일 주소"
              autoComplete="email"
              required
            />
            <input
              type="password"
              value={loginPassword}
              onChange={(e) => setLoginPassword(e.target.value)}
              className="w-full bg-[#050505] border border-[#333] py-3 px-3 text-sm focus:outline-none focus:border-[#00ffd1] text-[#e5e5e5]"
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
        </div>
      )}

      {activeTab === 'signup' && (
        <form onSubmit={handleSignUp} className="space-y-3 border border-[#333] bg-[#0a0a0a] p-4 md:p-5">
          <input
            type="text"
            value={signupName}
            onChange={(event) => setSignupName(event.target.value)}
            className="w-full bg-[#050505] border border-[#333] py-3 px-3 text-sm focus:outline-none focus:border-[#00ffd1] text-[#e5e5e5]"
            placeholder="이름"
            required
          />
          <input
            type="tel"
            value={signupPhone}
            onChange={(event) => setSignupPhone(event.target.value)}
            className="w-full bg-[#050505] border border-[#333] py-3 px-3 text-sm focus:outline-none focus:border-[#00ffd1] text-[#e5e5e5]"
            placeholder="전화번호"
            required
          />
          <input
            type="email"
            value={signupEmail}
            onChange={(event) => setSignupEmail(event.target.value)}
            className="w-full bg-[#050505] border border-[#333] py-3 px-3 text-sm focus:outline-none focus:border-[#00ffd1] text-[#e5e5e5]"
            placeholder="이메일"
            required
          />
          <input
            type="password"
            value={signupPassword}
            onChange={(event) => setSignupPassword(event.target.value)}
            className="w-full bg-[#050505] border border-[#333] py-3 px-3 text-sm focus:outline-none focus:border-[#00ffd1] text-[#e5e5e5]"
            placeholder="비밀번호 (8자 이상)"
            required
          />
          <input
            type="password"
            value={signupPasswordConfirm}
            onChange={(event) => setSignupPasswordConfirm(event.target.value)}
            className="w-full bg-[#050505] border border-[#333] py-3 px-3 text-sm focus:outline-none focus:border-[#00ffd1] text-[#e5e5e5]"
            placeholder="비밀번호 확인"
            required
          />
          <button
            type="submit"
            disabled={isBusy}
            className="w-full py-3.5 bg-[#00ffd1] text-black font-bold uppercase hover:bg-white transition-colors disabled:opacity-50"
          >
            {isBusy ? '처리중...' : '이메일 회원가입'}
          </button>
        </form>
      )}

      {activeTab === 'recover' && (
        <div className="space-y-4 border border-[#333] bg-[#0a0a0a] p-4 md:p-5">
          <form onSubmit={handleFindEmail} className="space-y-3">
            <p className="text-xs text-[#00ffd1] uppercase tracking-widest">아이디(이메일) 찾기</p>
            <input
              type="text"
              value={recoverName}
              onChange={(event) => setRecoverName(event.target.value)}
              className="w-full bg-[#050505] border border-[#333] py-3 px-3 text-sm focus:outline-none focus:border-[#00ffd1] text-[#e5e5e5]"
              placeholder="이름"
              required
            />
            <input
              type="tel"
              value={recoverPhone}
              onChange={(event) => setRecoverPhone(event.target.value)}
              className="w-full bg-[#050505] border border-[#333] py-3 px-3 text-sm focus:outline-none focus:border-[#00ffd1] text-[#e5e5e5]"
              placeholder="전화번호"
              required
            />
            <button
              type="submit"
              disabled={isFindingId}
              className="w-full py-3 border border-[#00ffd1] text-[#00ffd1] hover:bg-[#00ffd1] hover:text-black transition-colors uppercase text-xs tracking-widest disabled:opacity-50"
            >
              {isFindingId ? '조회중...' : '아이디 찾기'}
            </button>
          </form>

          {foundEmails.length > 0 && (
            <div className="border border-[#333] bg-black p-3 text-xs">
              <p className="text-[#666] mb-2">조회 결과</p>
              {foundEmails.map((email) => (
                <p key={email} className="text-[#e5e5e5]">{email}</p>
              ))}
            </div>
          )}

          <form onSubmit={handlePasswordReset} className="space-y-3 pt-3 border-t border-[#333]">
            <p className="text-xs text-[#00ffd1] uppercase tracking-widest">비밀번호 찾기</p>
            <input
              type="email"
              value={recoverEmail}
              onChange={(event) => setRecoverEmail(event.target.value)}
              className="w-full bg-[#050505] border border-[#333] py-3 px-3 text-sm focus:outline-none focus:border-[#00ffd1] text-[#e5e5e5]"
              placeholder="가입 이메일"
              required
            />
            <button
              type="submit"
              disabled={isResettingPassword}
              className="w-full py-3 border border-[#00ffd1] text-[#00ffd1] hover:bg-[#00ffd1] hover:text-black transition-colors uppercase text-xs tracking-widest disabled:opacity-50"
            >
              {isResettingPassword ? '전송중...' : '비밀번호 재설정 메일 보내기'}
            </button>
          </form>
        </div>
      )}

      {activeTab === 'guestOrder' && (
        <div className="space-y-4 border border-[#333] bg-[#0a0a0a] p-4 md:p-5">
          <form onSubmit={handleGuestLookup} className="space-y-3">
            <input
              type="text"
              value={guestOrderNumber}
              onChange={(event) => setGuestOrderNumber(event.target.value)}
              className="w-full bg-[#050505] border border-[#333] py-3 px-3 text-sm focus:outline-none focus:border-[#00ffd1] text-[#e5e5e5]"
              placeholder="비회원 주문번호 (예: GUEST-20260228-AB12CD34)"
              required
            />
            <input
              type="password"
              value={guestOrderPassword}
              onChange={(event) => setGuestOrderPassword(event.target.value)}
              className="w-full bg-[#050505] border border-[#333] py-3 px-3 text-sm focus:outline-none focus:border-[#00ffd1] text-[#e5e5e5]"
              placeholder="주문 시 설정한 비밀번호"
              required
            />
            <button
              type="submit"
              disabled={isLookupLoading}
              className="w-full py-3.5 bg-[#00ffd1] text-black font-bold uppercase hover:bg-white transition-colors disabled:opacity-50"
            >
              {isLookupLoading ? '조회중...' : '비회원 주문조회'}
            </button>
          </form>

          {lookupError && (
            <div className="border border-red-700 bg-red-950/20 p-3 text-xs text-red-300">
              {lookupError}
            </div>
          )}

          {lookupOrder && (
            <div className="space-y-3 border border-[#00ffd1]/40 bg-[#00ffd1]/5 p-4">
              <p className="text-xs text-[#00ffd1] uppercase tracking-widest">
                주문번호: {lookupOrder.guestOrderNumber || lookupOrder.orderCode}
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                <div className="border border-[#333] bg-black p-3">
                  <p className="text-[#666] mb-1">배송 상태</p>
                  <p className="text-[#e5e5e5]">
                    {getShippingStatusLabel(lookupOrder.shippingStatus)}
                  </p>
                </div>
                <div className="border border-[#333] bg-black p-3">
                  <p className="text-[#666] mb-1">결제 금액</p>
                  <p className="text-[#e5e5e5]">{formatKrw(lookupOrder.amountTotal || 0)}</p>
                </div>
                <div className="border border-[#333] bg-black p-3">
                  <p className="text-[#666] mb-1">택배사</p>
                  <p className="text-[#e5e5e5]">{lookupOrder.shippingCompany || '-'}</p>
                </div>
                <div className="border border-[#333] bg-black p-3">
                  <p className="text-[#666] mb-1">운송장번호</p>
                  <p className="text-[#e5e5e5] break-all">{lookupOrder.trackingNumber || '-'}</p>
                </div>
              </div>
              <div className="border border-[#333] bg-black p-3 text-xs">
                <p className="text-[#666] mb-1">배송 메모</p>
                <p className="text-[#e5e5e5]">{lookupOrder.shippingNote || '-'}</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                <div className="border border-[#333] bg-black p-3">
                  <p className="text-[#666] mb-1">발송일시</p>
                  <p className="text-[#e5e5e5]">{formatDateTime(lookupOrder.shippedAt)}</p>
                </div>
                <div className="border border-[#333] bg-black p-3">
                  <p className="text-[#666] mb-1">배송완료일시</p>
                  <p className="text-[#e5e5e5]">{formatDateTime(lookupOrder.deliveredAt)}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {(statusMessage || errorMessage || signupError || recoverError || recoverMessage) && (
        <div
          className={`border p-4 text-xs ${
            errorMessage || signupError || recoverError
              ? 'border-red-700 bg-red-950/20 text-red-300'
              : 'border-[#00ffd1]/40 bg-[#00ffd1]/5 text-[#bafff0]'
          }`}
        >
          {signupError || recoverError || errorMessage || recoverMessage || statusMessage}
        </div>
      )}
    </div>
  );
}
