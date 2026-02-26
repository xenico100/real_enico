'use client';

import { useMemo } from 'react';
import { useAuth } from '@/app/context/AuthContext';
import { AccountAuthPanel } from './AccountAuthPanel';

function formatDate(value: string | undefined) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function MyPagePanel() {
  const { isAuthenticated, isAuthReady, user, profile } = useAuth();

  const userDisplayName = useMemo(() => {
    if (!user) return null;
    return (
      profile?.full_name ||
      (typeof user.user_metadata?.full_name === 'string'
        ? user.user_metadata.full_name
        : null) ||
      (typeof user.user_metadata?.name === 'string' ? user.user_metadata.name : null) ||
      'Member'
    );
  }, [profile?.full_name, user]);

  if (!isAuthReady || !isAuthenticated || !user) {
    return (
      <div className="space-y-6 font-mono">
        <div className="border border-[#333] bg-[#0a0a0a] p-6">
          <h3 className="text-lg font-bold uppercase text-[#00ffd1] mb-2">My Page</h3>
          <p className="text-xs text-[#999] leading-relaxed">
            로그인 후 주문 내역, 저장한 게시물, 프로필 정보를 여기서 확인할 수 있게 연결됩니다.
            아래에서 먼저 로그인/회원가입을 진행하세요.
          </p>
        </div>
        <AccountAuthPanel />
      </div>
    );
  }

  return (
    <div className="space-y-6 font-mono">
      <div className="border border-[#333] bg-[#0a0a0a] p-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-[#333] pb-4 mb-4">
          <div>
            <p className="text-[10px] tracking-widest uppercase text-[#666]">MYPAGE DASHBOARD</p>
            <h3 className="text-2xl font-bold uppercase text-[#e5e5e5] mt-2">
              {userDisplayName}
            </h3>
            <p className="text-xs text-[#00ffd1] mt-1 break-all">{user.email}</p>
          </div>
          <div className="w-16 h-16 rounded-full bg-[#111] border border-[#333] flex items-center justify-center text-2xl text-[#00ffd1]">
            {(userDisplayName || '?').slice(0, 1).toUpperCase()}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          <div className="border border-[#333] bg-[#111] p-3">
            <p className="text-[#666] mb-1">가입일</p>
            <p className="text-[#e5e5e5]">{formatDate(profile?.created_at || user.created_at)}</p>
          </div>
          <div className="border border-[#333] bg-[#111] p-3">
            <p className="text-[#666] mb-1">로그인 방식</p>
            <p className="text-[#e5e5e5] uppercase">{profile?.provider || 'email'}</p>
          </div>
          <div className="border border-[#333] bg-[#111] p-3">
            <p className="text-[#666] mb-1">주문내역</p>
            <p className="text-[#e5e5e5]">0건 (placeholder)</p>
          </div>
          <div className="border border-[#333] bg-[#111] p-3">
            <p className="text-[#666] mb-1">저장한 게시물</p>
            <p className="text-[#e5e5e5]">0건 (placeholder)</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="border border-[#333] bg-[#0f0f0f] p-4">
          <p className="text-[10px] uppercase tracking-widest text-[#00ffd1] mb-2">Orders</p>
          <p className="text-xs text-[#9a9a9a] leading-relaxed">
            주문 목록 탭 자리. 나중에 `orders` 테이블 연결하면 최근 주문 카드로 교체하면 됩니다.
          </p>
        </div>
        <div className="border border-[#333] bg-[#0f0f0f] p-4">
          <p className="text-[10px] uppercase tracking-widest text-[#00ffd1] mb-2">Saved</p>
          <p className="text-xs text-[#9a9a9a] leading-relaxed">
            저장/찜한 clothes, collection 게시물 표시용 영역.
          </p>
        </div>
        <div className="border border-[#333] bg-[#0f0f0f] p-4">
          <p className="text-[10px] uppercase tracking-widest text-[#00ffd1] mb-2">Profile</p>
          <p className="text-xs text-[#9a9a9a] leading-relaxed">
            프로필 수정 폼(닉네임, 아바타) 연결 예정. 현재는 Supabase `profiles` 읽기 상태만 표시합니다.
          </p>
        </div>
      </div>
    </div>
  );
}
