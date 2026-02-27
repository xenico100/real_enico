'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useAuth } from '@/app/context/AuthContext';
import { useFashionCart } from '@/app/context/FashionCartContext';
import { AccountAuthPanel } from './AccountAuthPanel';

type MyPageTab =
  | 'overview'
  | 'orders'
  | 'saved'
  | 'cart'
  | 'profile'
  | 'members'
  | 'adminOrders';
const PRIMARY_ADMIN_EMAIL = 'morba9850@gmail.com';

type MemberRecord = {
  id: string;
  email: string;
  fullName: string;
  phone: string;
  address: string;
  createdAt: string | null;
  updatedAt: string | null;
  isPrimaryAdmin: boolean;
};

type MemberDraft = {
  email: string;
  fullName: string;
  phone: string;
  address: string;
  password: string;
};

type AdminOrderItem = {
  id: string;
  name: string;
  category: string;
  selectedSize: string | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
};

type AdminOrderRecord = {
  id: string;
  orderCode: string;
  channel: string;
  paymentMethod: string;
  paymentStatus: string;
  currency: string;
  amountSubtotal: number;
  amountShipping: number;
  amountTax: number;
  amountTotal: number;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  customerCountry: string;
  customerAddress: string;
  bankName: string;
  bankAccountNumber: string;
  paypalOrderId: string;
  paypalCaptureId: string;
  paypalCurrency: string;
  paypalValue: string;
  items: AdminOrderItem[];
  createdAt: string | null;
  updatedAt: string | null;
};

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

function createMemberDraft(member: MemberRecord): MemberDraft {
  return {
    email: member.email || '',
    fullName: member.fullName || '',
    phone: member.phone || '',
    address: member.address || '',
    password: '',
  };
}

export function MyPagePanel() {
  const { session, isAuthenticated, isAuthReady, user, profile } = useAuth();
  const { cart } = useFashionCart();
  const [activeTab, setActiveTab] = useState<MyPageTab>('overview');
  const [members, setMembers] = useState<MemberRecord[]>([]);
  const [memberDrafts, setMemberDrafts] = useState<Record<string, MemberDraft>>({});
  const [isLoadingMembers, setIsLoadingMembers] = useState(false);
  const [membersLoaded, setMembersLoaded] = useState(false);
  const [memberMessage, setMemberMessage] = useState<string | null>(null);
  const [memberError, setMemberError] = useState<string | null>(null);
  const [adminOrders, setAdminOrders] = useState<AdminOrderRecord[]>([]);
  const [adminOrdersLoaded, setAdminOrdersLoaded] = useState(false);
  const [isLoadingAdminOrders, setIsLoadingAdminOrders] = useState(false);
  const [adminOrderMessage, setAdminOrderMessage] = useState<string | null>(null);
  const [adminOrderError, setAdminOrderError] = useState<string | null>(null);
  const isPrimaryAdmin = (user?.email || '').toLowerCase() === PRIMARY_ADMIN_EMAIL;

  const userDisplayName = useMemo(() => {
    if (!user) return null;
    return (
      profile?.full_name ||
      (typeof user.user_metadata?.full_name === 'string'
        ? user.user_metadata.full_name
        : null) ||
      (typeof user.user_metadata?.name === 'string' ? user.user_metadata.name : null) ||
      '회원'
    );
  }, [profile?.full_name, user]);

  const cartSubtotal = cart.reduce(
    (sum, item) => sum + item.price * (item.quantity || 1),
    0,
  );

  const tabs: { id: MyPageTab; label: string; hint: string; count?: number }[] = [
    { id: 'overview', label: '개요', hint: '요약' },
    { id: 'orders', label: '주문', hint: '이력', count: 0 },
    { id: 'saved', label: '저장됨', hint: '게시물', count: 0 },
    { id: 'cart', label: '장바구니', hint: '결제', count: cart.length },
    { id: 'profile', label: '프로필', hint: '신원', count: undefined },
  ];
  if (isPrimaryAdmin) {
    tabs.push({ id: 'members', label: '회원관리', hint: '관리', count: members.length });
    tabs.push({ id: 'adminOrders', label: '주문관리', hint: '거래', count: adminOrders.length });
  }
  const activeTabMeta = tabs.find((tab) => tab.id === activeTab) ?? tabs[0];

  const resetMemberMessages = () => {
    setMemberMessage(null);
    setMemberError(null);
  };

  const resetAdminOrderMessages = () => {
    setAdminOrderMessage(null);
    setAdminOrderError(null);
  };

  const loadMembers = useCallback(async () => {
    if (!isPrimaryAdmin) return;
    if (!session?.access_token) return;

    resetMemberMessages();
    setIsLoadingMembers(true);
    try {
      const response = await fetch('/api/admin/users', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      const payload = (await response.json()) as { members?: MemberRecord[]; message?: string };
      if (!response.ok) {
        throw new Error(payload.message || '회원 목록 로드 실패');
      }

      const nextMembers = Array.isArray(payload.members) ? payload.members : [];
      setMembers(nextMembers);
      setMemberDrafts((prev) => {
        const merged: Record<string, MemberDraft> = {};
        nextMembers.forEach((member) => {
          const previousDraft = prev[member.id];
          merged[member.id] = previousDraft
            ? { ...createMemberDraft(member), password: previousDraft.password }
            : createMemberDraft(member);
        });
        return merged;
      });
      setMembersLoaded(true);
    } catch (error) {
      setMemberError(error instanceof Error ? error.message : '회원 목록 로드 실패');
    } finally {
      setIsLoadingMembers(false);
    }
  }, [isPrimaryAdmin, session?.access_token]);

  const updateMemberDraft = (
    memberId: string,
    field: keyof MemberDraft,
    value: string,
  ) => {
    setMemberDrafts((prev) => ({
      ...prev,
      [memberId]: {
        ...(prev[memberId] || {
          email: '',
          fullName: '',
          phone: '',
          address: '',
          password: '',
        }),
        [field]: value,
      },
    }));
  };

  const handleSaveMember = async (memberId: string) => {
    if (!session?.access_token) return;
    const draft = memberDrafts[memberId];
    if (!draft) return;

    resetMemberMessages();
    try {
      const response = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          id: memberId,
          email: draft.email,
          fullName: draft.fullName,
          phone: draft.phone,
          address: draft.address,
          password: draft.password,
        }),
      });

      const payload = (await response.json()) as {
        member?: MemberRecord;
        message?: string;
      };
      if (!response.ok) {
        throw new Error(payload.message || '회원 정보 수정 실패');
      }

      if (payload.member) {
        setMembers((prev) =>
          prev.map((member) => (member.id === memberId ? payload.member || member : member)),
        );
        setMemberDrafts((prev) => ({
          ...prev,
          [memberId]: {
            ...(payload.member ? createMemberDraft(payload.member) : prev[memberId]),
            password: '',
          },
        }));
      }

      setMemberMessage(payload.message || '회원 정보가 수정되었습니다.');
    } catch (error) {
      setMemberError(error instanceof Error ? error.message : '회원 정보 수정 실패');
    }
  };

  const handleDeleteMember = async (memberId: string) => {
    if (!session?.access_token) return;

    const confirmed = window.confirm('해당 회원을 삭제할까요? 이 작업은 되돌릴 수 없습니다.');
    if (!confirmed) return;

    resetMemberMessages();
    try {
      const response = await fetch('/api/admin/users', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ id: memberId }),
      });

      const payload = (await response.json()) as { message?: string };
      if (!response.ok) {
        throw new Error(payload.message || '회원 삭제 실패');
      }

      setMembers((prev) => prev.filter((member) => member.id !== memberId));
      setMemberDrafts((prev) => {
        const next = { ...prev };
        delete next[memberId];
        return next;
      });
      setMemberMessage(payload.message || '회원이 삭제되었습니다.');
    } catch (error) {
      setMemberError(error instanceof Error ? error.message : '회원 삭제 실패');
    }
  };

  const loadAdminOrders = useCallback(async () => {
    if (!isPrimaryAdmin) return;
    if (!session?.access_token) return;

    resetAdminOrderMessages();
    setIsLoadingAdminOrders(true);
    try {
      const response = await fetch('/api/admin/orders?limit=300', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      const payload = (await response.json()) as {
        orders?: AdminOrderRecord[];
        message?: string;
      };
      if (!response.ok) {
        throw new Error(payload.message || '주문 목록 로드 실패');
      }

      const nextOrders = Array.isArray(payload.orders) ? payload.orders : [];
      setAdminOrders(nextOrders);
      setAdminOrdersLoaded(true);
      setAdminOrderMessage(`주문 ${nextOrders.length}건 로드 완료`);
    } catch (error) {
      setAdminOrderError(error instanceof Error ? error.message : '주문 목록 로드 실패');
    } finally {
      setIsLoadingAdminOrders(false);
    }
  }, [isPrimaryAdmin, session?.access_token]);

  useEffect(() => {
    if (!isPrimaryAdmin && (activeTab === 'members' || activeTab === 'adminOrders')) {
      setActiveTab('overview');
    }
  }, [activeTab, isPrimaryAdmin]);

  useEffect(() => {
    if (!isPrimaryAdmin) return;
    if (activeTab !== 'members') return;
    if (membersLoaded) return;
    void loadMembers();
  }, [activeTab, isPrimaryAdmin, membersLoaded, loadMembers]);

  useEffect(() => {
    if (!isPrimaryAdmin) return;
    if (activeTab !== 'adminOrders') return;
    if (adminOrdersLoaded) return;
    void loadAdminOrders();
  }, [activeTab, adminOrdersLoaded, isPrimaryAdmin, loadAdminOrders]);

  if (!isAuthReady || !isAuthenticated || !user) {
    return (
      <div className="space-y-6 font-mono">
        <div className="border border-[#333] bg-[#0a0a0a] p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-xl font-bold uppercase text-[#00ffd1] mb-2">마이페이지 / 기능 허브</h3>
            </div>
            <span className="border border-[#333] bg-[#111] px-2 py-1 text-[10px] text-[#666] uppercase tracking-widest">
              잠김
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
            <p className="text-[#e5e5e5] uppercase">{profile?.provider === 'google' ? '구글' : '이메일'}</p>
          </div>
          <div className="border border-[#333] bg-[#111] p-4">
            <p className="text-[#666] mb-1">장바구니 품목</p>
            <p className="text-[#e5e5e5]">{cart.length}개</p>
          </div>
          <div className="border border-[#333] bg-[#111] p-4">
            <p className="text-[#666] mb-1">장바구니 합계</p>
            <p className="text-[#00ffd1]">{cartSubtotal.toLocaleString('ko-KR')}원</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="border border-[#333] bg-[#0f0f0f] p-4">
            <p className="text-[10px] uppercase tracking-widest text-[#00ffd1] mb-2">주문</p>
            <p className="text-xs text-[#9a9a9a] leading-relaxed">
              배송 상태, 주문 상세, 결제 영수증 카드가 들어갈 자리입니다.
            </p>
          </div>
          <div className="border border-[#333] bg-[#0f0f0f] p-4">
            <p className="text-[10px] uppercase tracking-widest text-[#00ffd1] mb-2">저장 게시물</p>
            <p className="text-xs text-[#9a9a9a] leading-relaxed">
              의류 / 컬렉션 상세 게시글 저장 기능 연결 영역.
            </p>
          </div>
          <div className="border border-[#333] bg-[#0f0f0f] p-4">
            <p className="text-[10px] uppercase tracking-widest text-[#00ffd1] mb-2">결제</p>
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
          <p className="text-[10px] uppercase tracking-widest text-[#00ffd1] mb-2">주문 피드</p>
          <p className="text-xs text-[#999]">아직 주문 내역이 없습니다. 주문 테이블 연결 시 이 영역이 실제 카드 리스트로 바뀝니다.</p>
        </div>
        <div className="border border-dashed border-[#333] bg-[#0a0a0a] p-4">
          <p className="text-xs text-[#666]">자리표시 행: 주문식별값 / 상태 / 합계 / 생성일시</p>
        </div>
      </div>
    ),
    saved: (
      <div className="space-y-3">
        <div className="border border-[#333] bg-[#111] p-4">
          <p className="text-[10px] uppercase tracking-widest text-[#00ffd1] mb-2">저장 보드</p>
          <p className="text-xs text-[#999]">
            찜한 의류/컬렉션 게시물 썸네일을 그리드로 배치할 공간입니다.
          </p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="border border-[#333] bg-[#0d0d0d] aspect-[4/5] p-3 flex items-end">
              <p className="text-[10px] text-[#555] uppercase tracking-widest">빈 슬롯</p>
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
              <p className="text-[10px] uppercase tracking-widest text-[#00ffd1]">장바구니 스냅샷</p>
              
              <p className="text-xs text-[#9a9a9a] mt-2">
                장바구니 패널과 결제창으로 이어지는 기능성 탭입니다.
              </p>
            </div>
            <div className="text-right">
              <p className="text-[10px] text-[#666] uppercase">수량</p>
              <p className="text-lg text-[#e5e5e5]">{cart.length}</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          <div className="border border-[#333] bg-[#111] p-4">
            <p className="text-[#666] mb-1">상품합계</p>
            <p className="text-[#e5e5e5]">{cartSubtotal.toLocaleString('ko-KR')}원</p>
          </div>
          <div className="border border-[#333] bg-[#111] p-4">
            <p className="text-[#666] mb-1">결제 창</p>
            <p className="text-[#00ffd1]">헤더 장바구니 패널 사용</p>
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
                    {item.category || '항목'} {item.selectedSize ? `// 사이즈 ${item.selectedSize}` : ''}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-[#666]">×{item.quantity || 1}</p>
                  <p className="text-xs text-[#00ffd1]">{item.price.toLocaleString('ko-KR')}원</p>
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
          <p className="text-[10px] uppercase tracking-widest text-[#00ffd1] mb-3">신원 프로필</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            <div className="border border-[#333] bg-black p-3">
              <p className="text-[#666] mb-1">이름</p>
              <p className="text-[#e5e5e5]">{userDisplayName}</p>
            </div>
            <div className="border border-[#333] bg-black p-3">
              <p className="text-[#666] mb-1">이메일</p>
              <p className="text-[#e5e5e5] break-all">{user.email}</p>
            </div>
            <div className="border border-[#333] bg-black p-3">
              <p className="text-[#666] mb-1">로그인 수단</p>
              <p className="text-[#e5e5e5] uppercase">{profile?.provider === 'google' ? '구글' : '이메일'}</p>
            </div>
            <div className="border border-[#333] bg-black p-3">
              <p className="text-[#666] mb-1">아바타 주소</p>
              <p className="text-[#999] break-all">{profile?.avatar_url || '-'}</p>
            </div>
          </div>
        </div>
        <div className="border border-dashed border-[#333] bg-[#0a0a0a] p-4">
          <p className="text-xs text-[#666]">향후 프로필 수정 폼(닉네임, 아바타 업로드) 연결 예정</p>
        </div>
      </div>
    ),
    adminOrders: (
      <div className="space-y-4">
        {!isPrimaryAdmin ? (
          <div className="border border-[#333] bg-[#111] p-4 text-xs text-[#888]">
            관리자 계정에서만 접근 가능한 탭입니다.
          </div>
        ) : (
          <>
            <div className="border border-[#00ffd1]/40 bg-[#00ffd1]/5 p-4">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-[#00ffd1]">주문 관리</p>
                  <p className="text-xs text-[#9a9a9a] mt-2">
                    계좌이체/PayPal 주문 목록을 확인할 수 있습니다.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void loadAdminOrders()}
                  disabled={isLoadingAdminOrders}
                  className="px-3 py-2 border border-[#333] bg-[#111] text-xs uppercase tracking-widest hover:border-[#00ffd1] hover:text-[#00ffd1] transition-colors disabled:opacity-50"
                >
                  {isLoadingAdminOrders ? '새로고침 중...' : '주문 새로고침'}
                </button>
              </div>
            </div>

            {(adminOrderMessage || adminOrderError) && (
              <div
                className={`border p-3 text-xs ${
                  adminOrderError
                    ? 'border-red-700 bg-red-950/20 text-red-300'
                    : 'border-[#00ffd1]/40 bg-[#00ffd1]/5 text-[#bafff0]'
                }`}
              >
                {adminOrderError || adminOrderMessage}
              </div>
            )}

            {isLoadingAdminOrders && adminOrders.length === 0 ? (
              <div className="border border-[#333] bg-[#111] p-4 text-xs text-[#888]">
                주문 목록을 불러오는 중입니다...
              </div>
            ) : adminOrders.length === 0 ? (
              <div className="border border-dashed border-[#333] bg-[#0a0a0a] p-4 text-xs text-[#666]">
                저장된 주문이 없습니다. 결제 완료 후 목록이 표시됩니다.
              </div>
            ) : (
              <div className="space-y-3">
                {adminOrders.map((order) => (
                  <article key={order.id} className="border border-[#333] bg-[#111] p-4 space-y-3">
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                      <div>
                        <p className="text-xs text-[#e5e5e5] break-all">
                          주문번호: {order.orderCode || order.id}
                        </p>
                        <p className="text-[10px] text-[#666] mt-1">
                          생성일: {formatDate(order.createdAt || undefined)}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2 text-[10px] uppercase tracking-widest">
                        <span className="px-2 py-1 border border-[#00ffd1]/50 bg-[#00ffd1]/10 text-[#00ffd1]">
                          {order.paymentMethod || '-'}
                        </span>
                        <span className="px-2 py-1 border border-[#333] bg-black text-[#aaa]">
                          {order.paymentStatus || '-'}
                        </span>
                        <span className="px-2 py-1 border border-[#333] bg-black text-[#aaa]">
                          {order.channel || '-'}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
                      <div className="border border-[#333] bg-black p-3">
                        <p className="text-[#666] mb-1">주문자</p>
                        <p className="text-[#e5e5e5]">{order.customerName || '-'}</p>
                        <p className="text-[#888] mt-1 break-all">{order.customerEmail || '-'}</p>
                      </div>
                      <div className="border border-[#333] bg-black p-3">
                        <p className="text-[#666] mb-1">연락처</p>
                        <p className="text-[#e5e5e5]">{order.customerPhone || '-'}</p>
                        <p className="text-[#888] mt-1">{order.customerCountry || '-'}</p>
                      </div>
                      <div className="border border-[#333] bg-black p-3">
                        <p className="text-[#666] mb-1">주문 금액</p>
                        <p className="text-[#00ffd1] font-bold">
                          {Number(order.amountTotal || 0).toLocaleString('ko-KR')}원
                        </p>
                        <p className="text-[#888] mt-1">
                          항목 {Array.isArray(order.items) ? order.items.length : 0}개
                        </p>
                      </div>
                    </div>

                    <div className="border border-[#333] bg-[#0d0d0d] p-3">
                      <p className="text-[10px] uppercase tracking-widest text-[#666] mb-2">배송지</p>
                      <p className="text-xs text-[#9a9a9a] break-all">{order.customerAddress || '-'}</p>
                    </div>

                    {Array.isArray(order.items) && order.items.length > 0 && (
                      <div className="space-y-2">
                        {order.items.map((item, index) => (
                          <div
                            key={`${order.id}-${item.id}-${index}`}
                            className="border border-[#333] bg-[#0f0f0f] px-3 py-2 flex items-center justify-between gap-3 text-xs"
                          >
                            <p className="text-[#e5e5e5] truncate">
                              {item.name} ({item.category || '-'})
                              {item.selectedSize ? ` / 사이즈 ${item.selectedSize}` : ''}
                            </p>
                            <p className="text-[#00ffd1] shrink-0">
                              ×{item.quantity || 1} / {Number(item.lineTotal || 0).toLocaleString('ko-KR')}원
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </article>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    ),
    members: (
      <div className="space-y-4">
        {!isPrimaryAdmin ? (
          <div className="border border-[#333] bg-[#111] p-4 text-xs text-[#888]">
            관리자 계정에서만 접근 가능한 탭입니다.
          </div>
        ) : (
          <>
            <div className="border border-[#00ffd1]/40 bg-[#00ffd1]/5 p-4">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-[#00ffd1]">회원 관리</p>
                  <p className="text-xs text-[#9a9a9a] mt-2">
                    이름, 전화번호, 주소, 이메일, 비밀번호를 수정하고 회원 삭제를 수행할 수 있습니다.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void loadMembers()}
                  disabled={isLoadingMembers}
                  className="px-3 py-2 border border-[#333] bg-[#111] text-xs uppercase tracking-widest hover:border-[#00ffd1] hover:text-[#00ffd1] transition-colors disabled:opacity-50"
                >
                  {isLoadingMembers ? '새로고침 중...' : '회원 새로고침'}
                </button>
              </div>
            </div>

            {(memberMessage || memberError) && (
              <div
                className={`border p-3 text-xs ${
                  memberError
                    ? 'border-red-700 bg-red-950/20 text-red-300'
                    : 'border-[#00ffd1]/40 bg-[#00ffd1]/5 text-[#bafff0]'
                }`}
              >
                {memberError || memberMessage}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Link
                href="/admin"
                className="inline-flex items-center justify-center border border-[#00ffd1] bg-[#00ffd1]/15 px-3 py-2 text-xs uppercase tracking-widest text-[#eafffb] hover:bg-[#00ffd1] hover:text-black transition-colors"
              >
                clothes 게시물 작성/수정
              </Link>
              <Link
                href="/admin/collections"
                className="inline-flex items-center justify-center border border-[#00ffd1] bg-[#00ffd1]/15 px-3 py-2 text-xs uppercase tracking-widest text-[#eafffb] hover:bg-[#00ffd1] hover:text-black transition-colors"
              >
                collection 게시물 작성/수정
              </Link>
            </div>

            {isLoadingMembers && members.length === 0 ? (
              <div className="border border-[#333] bg-[#111] p-4 text-xs text-[#888]">
                회원 목록을 불러오는 중입니다...
              </div>
            ) : members.length === 0 ? (
              <div className="border border-dashed border-[#333] bg-[#0a0a0a] p-4 text-xs text-[#666]">
                등록된 회원이 없습니다.
              </div>
            ) : (
              <div className="space-y-3">
                {members.map((member) => {
                  const draft = memberDrafts[member.id] || createMemberDraft(member);
                  return (
                    <div key={member.id} className="border border-[#333] bg-[#111] p-4 space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-xs text-[#e5e5e5] break-all">{member.email || '-'}</p>
                          <p className="text-[10px] text-[#666] mt-1">
                            생성일: {formatDate(member.createdAt || undefined)}
                          </p>
                        </div>
                        {member.isPrimaryAdmin && (
                          <span className="px-2 py-1 border border-[#00ffd1]/50 bg-[#00ffd1]/10 text-[10px] uppercase tracking-widest text-[#00ffd1]">
                            주 관리자
                          </span>
                        )}
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                        <input
                          type="text"
                          value={draft.fullName}
                          onChange={(event) =>
                            updateMemberDraft(member.id, 'fullName', event.target.value)
                          }
                          className="w-full bg-black border border-[#333] py-2 px-3 focus:outline-none focus:border-[#00ffd1] text-[#e5e5e5]"
                          placeholder="이름"
                        />
                        <input
                          type="text"
                          value={draft.phone}
                          onChange={(event) =>
                            updateMemberDraft(member.id, 'phone', event.target.value)
                          }
                          className="w-full bg-black border border-[#333] py-2 px-3 focus:outline-none focus:border-[#00ffd1] text-[#e5e5e5]"
                          placeholder="전화번호"
                        />
                        <input
                          type="text"
                          value={draft.address}
                          onChange={(event) =>
                            updateMemberDraft(member.id, 'address', event.target.value)
                          }
                          className="w-full md:col-span-2 bg-black border border-[#333] py-2 px-3 focus:outline-none focus:border-[#00ffd1] text-[#e5e5e5]"
                          placeholder="주소"
                        />
                        <input
                          type="email"
                          value={draft.email}
                          onChange={(event) =>
                            updateMemberDraft(member.id, 'email', event.target.value)
                          }
                          className="w-full bg-black border border-[#333] py-2 px-3 focus:outline-none focus:border-[#00ffd1] text-[#e5e5e5]"
                          placeholder="이메일"
                        />
                        <input
                          type="password"
                          value={draft.password}
                          onChange={(event) =>
                            updateMemberDraft(member.id, 'password', event.target.value)
                          }
                          className="w-full bg-black border border-[#333] py-2 px-3 focus:outline-none focus:border-[#00ffd1] text-[#e5e5e5]"
                          placeholder="비밀번호 변경 시에만 입력"
                        />
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => void handleSaveMember(member.id)}
                          disabled={isLoadingMembers}
                          className="py-2 border border-[#00ffd1] text-[#00ffd1] hover:bg-[#00ffd1] hover:text-black transition-colors text-xs uppercase tracking-widest disabled:opacity-50"
                        >
                          회원정보 저장
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDeleteMember(member.id)}
                          disabled={isLoadingMembers || member.isPrimaryAdmin}
                          className="py-2 border border-red-700 text-red-300 hover:bg-red-600 hover:text-white transition-colors text-xs uppercase tracking-widest disabled:opacity-50"
                        >
                          회원 삭제
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    ),
  };

  return (
    <div className="space-y-6 font-mono">
      <div className="border border-[#333] bg-[#0a0a0a] p-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-[#333] pb-4 mb-4">
          <div>
            <p className="text-[10px] tracking-[0.18em] uppercase text-[#666]">마이페이지 대시보드</p>
            
            <h3 className="text-2xl md:text-3xl font-bold uppercase text-[#e5e5e5] mt-2">
              {userDisplayName}
            </h3>
            <p className="text-xs text-[#00ffd1] mt-1 break-all">{user.email}</p>
          </div>
          <div className="w-16 h-16 rounded-full bg-[#111] border border-[#333] flex items-center justify-center text-2xl text-[#00ffd1]">
            {(userDisplayName || '?').slice(0, 1).toUpperCase()}
          </div>
        </div>

        {isPrimaryAdmin && (
          <div className="border border-[#00ffd1]/40 bg-[#00ffd1]/5 p-4 mb-4">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div>
                <p className="text-[10px] uppercase tracking-[0.18em] text-[#00ffd1]">관리자 작성 도구</p>
                <p className="text-xs text-[#9a9a9a] mt-2">
                  의류(clothes)와 컬렉션(collection) 게시물 작성/수정은 관리자 계정에서만 가능합니다.
                </p>
              </div>
              <span className="border border-[#00ffd1]/40 bg-black px-2 py-1 text-[10px] uppercase tracking-widest text-[#00ffd1]">
                {PRIMARY_ADMIN_EMAIL}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mt-3">
              <Link
                href="/admin"
                className="inline-flex items-center justify-center border border-[#00ffd1] bg-[#00ffd1]/15 px-3 py-2 text-xs uppercase tracking-widest text-[#eafffb] hover:bg-[#00ffd1] hover:text-black transition-colors"
              >
                clothes 게시물 관리
              </Link>
              <Link
                href="/admin/collections"
                className="inline-flex items-center justify-center border border-[#00ffd1] bg-[#00ffd1]/15 px-3 py-2 text-xs uppercase tracking-widest text-[#eafffb] hover:bg-[#00ffd1] hover:text-black transition-colors"
              >
                collection 게시물 관리
              </Link>
              <button
                type="button"
                onClick={() => setActiveTab('adminOrders')}
                className="inline-flex items-center justify-center border border-[#00ffd1] bg-[#00ffd1]/15 px-3 py-2 text-xs uppercase tracking-widest text-[#eafffb] hover:bg-[#00ffd1] hover:text-black transition-colors"
              >
                주문 목록 보기
              </button>
            </div>
          </div>
        )}

        <div className="border border-[#222] bg-black/40 p-2.5">
          <div className="flex items-center justify-between gap-3 mb-2 px-1">
            <p className="text-[10px] uppercase tracking-[0.18em] text-[#666]">마이페이지 탭</p>
            <p className="text-[10px] uppercase tracking-[0.18em] text-[#00ffd1]">
              현재: {activeTabMeta.label}
            </p>
          </div>

          <div className="flex gap-2.5 overflow-x-auto pb-1 [scrollbar-width:none] [-ms-overflow-style:none]">
            {tabs.map((tab, index) => {
              const active = activeTab === tab.id;

              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`relative min-w-[156px] md:min-w-[172px] flex-1 text-left border p-4 md:p-5 transition-colors ${
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
                      <p className={`mt-2 text-[15px] md:text-base uppercase tracking-[0.14em] font-bold ${active ? 'text-[#ecfffb]' : 'text-[#d4d4d4]'}`}>
                        {tab.label}
                      </p>
                    </div>

                    {typeof tab.count === 'number' && (
                      <span
                        className={`px-2.5 py-1.5 text-[10px] border uppercase tracking-widest ${
                          active
                            ? 'border-[#00ffd1]/50 bg-[#00ffd1]/10 text-[#00ffd1]'
                            : 'border-[#333] bg-black text-[#777]'
                        }`}
                      >
                        {tab.count}
                      </span>
                    )}
                  </div>

                  <p className={`mt-4 text-[10px] uppercase tracking-widest ${active ? 'text-[#9cf7e8]' : 'text-[#555]'}`}>
                    {active ? '선택됨' : '눌러서 열기'}
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
            {activeTabMeta.label} 탭
          </p>
          <p className="text-[10px] text-[#666] uppercase">기능형 화면 / 보이는 조작부</p>
        </div>
        {tabContent[activeTab]}
      </div>
    </div>
  );
}
