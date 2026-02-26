'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { useAuth } from '@/app/context/AuthContext';
import { useFashionCart } from '@/app/context/FashionCartContext';
import { AccountAuthPanel } from './AccountAuthPanel';

type MyPageTab = 'overview' | 'orders' | 'saved' | 'cart' | 'profile';

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
  const { cart } = useFashionCart();
  const [activeTab, setActiveTab] = useState<MyPageTab>('overview');

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

  const cartSubtotal = cart.reduce(
    (sum, item) => sum + item.price * (item.quantity || 1),
    0,
  );

  const tabs: { id: MyPageTab; label: string; hint: string; count?: number }[] = [
    { id: 'overview', label: 'OVERVIEW', hint: 'summary' },
    { id: 'orders', label: 'ORDERS', hint: 'history', count: 0 },
    { id: 'saved', label: 'SAVED', hint: 'posts', count: 0 },
    { id: 'cart', label: 'CART', hint: 'checkout', count: cart.length },
    { id: 'profile', label: 'PROFILE', hint: 'identity' },
  ];
  const activeTabMeta = tabs.find((tab) => tab.id === activeTab) ?? tabs[0];

  if (!isAuthReady || !isAuthenticated || !user) {
    return (
      <div className="space-y-6 font-mono">
        <div className="border border-[#333] bg-[#0a0a0a] p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-xl font-bold uppercase text-[#00ffd1] mb-2">My Page / Functional Hub</h3>
              <p className="text-xs text-[#999] leading-relaxed">
                주문내역, 저장 게시물, 장바구니 상태, 프로필 정보를 탭으로 관리하는 영역입니다.
                먼저 로그인/회원가입 후 접근하세요.
              </p>
            </div>
            <span className="border border-[#333] bg-[#111] px-2 py-1 text-[10px] text-[#666] uppercase tracking-widest">
              LOCKED
            </span>
          </div>
        </div>
        <AccountAuthPanel />
      </div>
    );
  }

  const tabContent: Record<MyPageTab, ReactNode> = {
    overview: (
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          <div className="border border-[#333] bg-[#111] p-4">
            <p className="text-[#666] mb-1">가입일</p>
            <p className="text-[#e5e5e5]">{formatDate(profile?.created_at || user.created_at)}</p>
          </div>
          <div className="border border-[#333] bg-[#111] p-4">
            <p className="text-[#666] mb-1">로그인 방식</p>
            <p className="text-[#e5e5e5] uppercase">{profile?.provider || 'email'}</p>
          </div>
          <div className="border border-[#333] bg-[#111] p-4">
            <p className="text-[#666] mb-1">장바구니 품목</p>
            <p className="text-[#e5e5e5]">{cart.length} items</p>
          </div>
          <div className="border border-[#333] bg-[#111] p-4">
            <p className="text-[#666] mb-1">장바구니 합계</p>
            <p className="text-[#00ffd1]">{cartSubtotal.toLocaleString()} USD</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="border border-[#333] bg-[#0f0f0f] p-4">
            <p className="text-[10px] uppercase tracking-widest text-[#00ffd1] mb-2">Orders</p>
            <p className="text-xs text-[#9a9a9a] leading-relaxed">
              배송 상태, 주문 상세, 결제 영수증 카드가 들어갈 자리입니다.
            </p>
          </div>
          <div className="border border-[#333] bg-[#0f0f0f] p-4">
            <p className="text-[10px] uppercase tracking-widest text-[#00ffd1] mb-2">Saved Posts</p>
            <p className="text-xs text-[#9a9a9a] leading-relaxed">
              clothes / collection 상세 게시글 저장 기능 연결 영역.
            </p>
          </div>
          <div className="border border-[#333] bg-[#0f0f0f] p-4">
            <p className="text-[10px] uppercase tracking-widest text-[#00ffd1] mb-2">Checkout</p>
            <p className="text-xs text-[#9a9a9a] leading-relaxed">
              장바구니와 결제 UI를 여기서 빠르게 확인할 수 있게 확장 가능.
            </p>
          </div>
        </div>
      </div>
    ),
    orders: (
      <div className="space-y-3">
        <div className="border border-[#333] bg-[#111] p-4">
          <p className="text-[10px] uppercase tracking-widest text-[#00ffd1] mb-2">Orders Feed</p>
          <p className="text-xs text-[#999]">아직 주문 내역이 없습니다. 주문 테이블 연결 시 이 영역이 실제 카드 리스트로 바뀝니다.</p>
        </div>
        <div className="border border-dashed border-[#333] bg-[#0a0a0a] p-4">
          <p className="text-xs text-[#666]">Placeholder rows: ORDER_ID / STATUS / TOTAL / CREATED_AT</p>
        </div>
      </div>
    ),
    saved: (
      <div className="space-y-3">
        <div className="border border-[#333] bg-[#111] p-4">
          <p className="text-[10px] uppercase tracking-widest text-[#00ffd1] mb-2">Saved Board</p>
          <p className="text-xs text-[#999]">
            찜한 의류/컬렉션 게시물 썸네일을 그리드로 배치할 공간입니다.
          </p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="border border-[#333] bg-[#0d0d0d] aspect-[4/5] p-3 flex items-end">
              <p className="text-[10px] text-[#555] uppercase tracking-widest">EMPTY SLOT</p>
            </div>
          ))}
        </div>
      </div>
    ),
    cart: (
      <div className="space-y-4">
        <div className="border border-[#00ffd1]/40 bg-[#00ffd1]/5 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-widest text-[#00ffd1]">Cart Snapshot</p>
              <p className="text-xs text-[#9a9a9a] mt-2">
                장바구니 패널과 결제창으로 이어지는 기능성 탭입니다.
              </p>
            </div>
            <div className="text-right">
              <p className="text-[10px] text-[#666] uppercase">Items</p>
              <p className="text-lg text-[#e5e5e5]">{cart.length}</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          <div className="border border-[#333] bg-[#111] p-4">
            <p className="text-[#666] mb-1">Subtotal</p>
            <p className="text-[#e5e5e5]">{cartSubtotal.toLocaleString()} USD</p>
          </div>
          <div className="border border-[#333] bg-[#111] p-4">
            <p className="text-[#666] mb-1">Checkout Window</p>
            <p className="text-[#00ffd1]">Use header CART panel</p>
          </div>
        </div>

        {cart.length > 0 ? (
          <div className="space-y-2">
            {cart.map((item) => (
              <div key={`${item.id}-${item.selectedSize ?? ''}`} className="border border-[#333] bg-[#0f0f0f] p-3 flex items-center gap-3">
                <div className="w-12 h-14 border border-[#333] bg-black overflow-hidden shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={item.image} alt="" className="w-full h-full object-cover" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-[#e5e5e5] truncate">{item.name}</p>
                  <p className="text-[10px] text-[#666] mt-1">
                    {item.category || 'ITEM'} {item.selectedSize ? `// SIZE ${item.selectedSize}` : ''}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-[#666]">x{item.quantity || 1}</p>
                  <p className="text-xs text-[#00ffd1]">${item.price}</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="border border-dashed border-[#333] bg-[#0a0a0a] p-4 text-xs text-[#666]">
            장바구니가 비어 있습니다.
          </div>
        )}
      </div>
    ),
    profile: (
      <div className="space-y-4">
        <div className="border border-[#333] bg-[#111] p-4">
          <p className="text-[10px] uppercase tracking-widest text-[#00ffd1] mb-3">Identity Profile</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            <div className="border border-[#333] bg-black p-3">
              <p className="text-[#666] mb-1">Name</p>
              <p className="text-[#e5e5e5]">{userDisplayName}</p>
            </div>
            <div className="border border-[#333] bg-black p-3">
              <p className="text-[#666] mb-1">Email</p>
              <p className="text-[#e5e5e5] break-all">{user.email}</p>
            </div>
            <div className="border border-[#333] bg-black p-3">
              <p className="text-[#666] mb-1">Provider</p>
              <p className="text-[#e5e5e5] uppercase">{profile?.provider || 'email'}</p>
            </div>
            <div className="border border-[#333] bg-black p-3">
              <p className="text-[#666] mb-1">Avatar URL</p>
              <p className="text-[#999] break-all">{profile?.avatar_url || '-'}</p>
            </div>
          </div>
        </div>
        <div className="border border-dashed border-[#333] bg-[#0a0a0a] p-4">
          <p className="text-xs text-[#666]">향후 프로필 수정 폼(닉네임, 아바타 업로드) 연결 예정</p>
        </div>
      </div>
    ),
  };

  return (
    <div className="space-y-6 font-mono">
      <div className="border border-[#333] bg-[#0a0a0a] p-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-[#333] pb-4 mb-4">
          <div>
            <p className="text-[10px] tracking-[0.18em] uppercase text-[#666]">MYPAGE DASHBOARD</p>
            <h3 className="text-2xl md:text-3xl font-bold uppercase text-[#e5e5e5] mt-2">
              {userDisplayName}
            </h3>
            <p className="text-xs text-[#00ffd1] mt-1 break-all">{user.email}</p>
          </div>
          <div className="w-16 h-16 rounded-full bg-[#111] border border-[#333] flex items-center justify-center text-2xl text-[#00ffd1]">
            {(userDisplayName || '?').slice(0, 1).toUpperCase()}
          </div>
        </div>

        <div className="border border-[#222] bg-black/40 p-2">
          <div className="flex items-center justify-between gap-3 mb-2 px-1">
            <p className="text-[10px] uppercase tracking-[0.18em] text-[#666]">MYPAGE TABS</p>
            <p className="text-[10px] uppercase tracking-[0.18em] text-[#00ffd1]">
              active: {activeTabMeta.label}
            </p>
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [-ms-overflow-style:none]">
            {tabs.map((tab, index) => {
              const active = activeTab === tab.id;

              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`relative min-w-[140px] flex-1 text-left border p-3 md:p-4 transition-colors ${
                    active
                      ? 'border-[#00ffd1] bg-[linear-gradient(180deg,rgba(0,255,209,0.12),rgba(0,0,0,0.5))]'
                      : 'border-[#333] bg-[#111] hover:border-[#00ffd1]/70'
                  }`}
                >
                  <span
                    className={`absolute inset-y-0 left-0 w-[2px] ${
                      active ? 'bg-[#00ffd1]' : 'bg-transparent'
                    }`}
                  />

                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className={`text-[10px] tracking-[0.18em] uppercase ${active ? 'text-[#00ffd1]' : 'text-[#666]'}`}>
                        0{index + 1} / {tab.hint}
                      </p>
                      <p className={`mt-2 text-sm uppercase tracking-[0.14em] font-bold ${active ? 'text-[#ecfffb]' : 'text-[#d4d4d4]'}`}>
                        {tab.label}
                      </p>
                    </div>

                    {typeof tab.count === 'number' && (
                      <span
                        className={`px-2 py-1 text-[10px] border uppercase tracking-widest ${
                          active
                            ? 'border-[#00ffd1]/50 bg-[#00ffd1]/10 text-[#00ffd1]'
                            : 'border-[#333] bg-black text-[#777]'
                        }`}
                      >
                        {tab.count}
                      </span>
                    )}
                  </div>

                  <p className={`mt-3 text-[10px] uppercase tracking-widest ${active ? 'text-[#9cf7e8]' : 'text-[#555]'}`}>
                    {active ? 'SELECTED_TAB' : 'CLICK_TO_OPEN'}
                  </p>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="border border-[#333] bg-[#0a0a0a] p-5">
        <div className="flex items-center justify-between gap-3 border-b border-[#222] pb-3 mb-4">
          <p className="text-[10px] uppercase tracking-[0.18em] text-[#00ffd1]">
            {activeTabMeta.label} TAB
          </p>
          <p className="text-[10px] text-[#666] uppercase">functional ui / visible controls</p>
        </div>
        {tabContent[activeTab]}
      </div>
    </div>
  );
}
