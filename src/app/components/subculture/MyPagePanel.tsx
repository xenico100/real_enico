'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ChevronLeft } from 'lucide-react';
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

type AdminComposerType = 'products' | 'collections';
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

type ShippingStatus = 'preparing' | 'shipping' | 'delivered';

type OrderRecord = {
  id: string;
  orderCode: string;
  guestOrderNumber: string;
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
  shippingStatus: ShippingStatus;
  shippingCompany: string;
  trackingNumber: string;
  shippingNote: string;
  shippedAt: string | null;
  deliveredAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

type AdminOrderRecord = OrderRecord;
type MemberOrderRecord = OrderRecord;

type AdminOrderDraft = {
  shippingStatus: ShippingStatus;
  shippingCompany: string;
  trackingNumber: string;
  shippingNote: string;
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

function createMemberDraft(member: MemberRecord): MemberDraft {
  return {
    email: member.email || '',
    fullName: member.fullName || '',
    phone: member.phone || '',
    address: member.address || '',
    password: '',
  };
}

function createAdminOrderDraft(order: OrderRecord): AdminOrderDraft {
  return {
    shippingStatus: order.shippingStatus || 'preparing',
    shippingCompany: order.shippingCompany || '',
    trackingNumber: order.trackingNumber || '',
    shippingNote: order.shippingNote || '',
  };
}

type MyPagePanelProps = {
  onBack?: () => void;
};

export function MyPagePanel({ onBack }: MyPagePanelProps = {}) {
  const { session, isAuthenticated, isAuthReady, user, profile, signOut, isBusy } = useAuth();
  const { cart } = useFashionCart();
  const [activeTab, setActiveTab] = useState<MyPageTab>('profile');
  const [members, setMembers] = useState<MemberRecord[]>([]);
  const [memberDrafts, setMemberDrafts] = useState<Record<string, MemberDraft>>({});
  const [isLoadingMembers, setIsLoadingMembers] = useState(false);
  const [membersLoaded, setMembersLoaded] = useState(false);
  const [memberMessage, setMemberMessage] = useState<string | null>(null);
  const [memberError, setMemberError] = useState<string | null>(null);
  const [memberOrders, setMemberOrders] = useState<MemberOrderRecord[]>([]);
  const [memberOrdersLoaded, setMemberOrdersLoaded] = useState(false);
  const [isLoadingMemberOrders, setIsLoadingMemberOrders] = useState(false);
  const [memberOrderMessage, setMemberOrderMessage] = useState<string | null>(null);
  const [memberOrderError, setMemberOrderError] = useState<string | null>(null);
  const [adminOrders, setAdminOrders] = useState<AdminOrderRecord[]>([]);
  const [adminOrderDrafts, setAdminOrderDrafts] = useState<Record<string, AdminOrderDraft>>({});
  const [adminOrdersLoaded, setAdminOrdersLoaded] = useState(false);
  const [isLoadingAdminOrders, setIsLoadingAdminOrders] = useState(false);
  const [adminOrderMessage, setAdminOrderMessage] = useState<string | null>(null);
  const [adminOrderError, setAdminOrderError] = useState<string | null>(null);
  const [adminComposer, setAdminComposer] = useState<AdminComposerType | null>(null);
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

  const cartSubtotal = cart.reduce((sum, item) => sum + item.price * (item.quantity || 1), 0);

  const tabs: { id: MyPageTab; label: string; count?: number }[] = [
    { id: 'profile', label: '계정' },
    { id: 'orders', label: '주문', count: memberOrders.length },
  ];
  if (isPrimaryAdmin) {
    tabs.push({ id: 'members', label: '회원관리', count: members.length });
    tabs.push({ id: 'adminOrders', label: '배송관리', count: adminOrders.length });
  }

  const resetMemberMessages = () => {
    setMemberMessage(null);
    setMemberError(null);
  };

  const resetMemberOrderMessages = () => {
    setMemberOrderMessage(null);
    setMemberOrderError(null);
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

  const loadMemberOrders = useCallback(async () => {
    if (!session?.access_token) return;

    resetMemberOrderMessages();
    setIsLoadingMemberOrders(true);
    try {
      const response = await fetch('/api/orders/my', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      const payload = (await response.json()) as {
        orders?: MemberOrderRecord[];
        message?: string;
      };
      if (!response.ok) {
        throw new Error(payload.message || '주문 내역 로드 실패');
      }

      const nextOrders = Array.isArray(payload.orders) ? payload.orders : [];
      setMemberOrders(nextOrders);
      setMemberOrdersLoaded(true);
      setMemberOrderMessage(`주문 ${nextOrders.length}건 로드 완료`);
    } catch (error) {
      setMemberOrderError(error instanceof Error ? error.message : '주문 내역 로드 실패');
    } finally {
      setIsLoadingMemberOrders(false);
    }
  }, [session?.access_token]);

  const updateAdminOrderDraft = (
    orderId: string,
    field: keyof AdminOrderDraft,
    value: string,
  ) => {
    setAdminOrderDrafts((prev) => {
      const current = prev[orderId];
      if (!current) return prev;

      if (field === 'shippingStatus') {
        const normalized =
          value === 'preparing' || value === 'shipping' || value === 'delivered'
            ? value
            : current.shippingStatus;
        return {
          ...prev,
          [orderId]: {
            ...current,
            shippingStatus: normalized,
          },
        };
      }

      return {
        ...prev,
        [orderId]: {
          ...current,
          [field]: value,
        },
      };
    });
  };

  const handleSaveOrderShipping = async (orderId: string) => {
    if (!session?.access_token) return;
    const draft = adminOrderDrafts[orderId];
    if (!draft) return;

    resetAdminOrderMessages();
    try {
      const response = await fetch('/api/admin/orders', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          id: orderId,
          shippingStatus: draft.shippingStatus,
          shippingCompany: draft.shippingCompany,
          trackingNumber: draft.trackingNumber,
          shippingNote: draft.shippingNote,
        }),
      });

      const payload = (await response.json()) as {
        message?: string;
        order?: AdminOrderRecord;
      };
      if (!response.ok) {
        throw new Error(payload.message || '배송 정보 저장 실패');
      }

      if (payload.order) {
        setAdminOrders((prev) =>
          prev.map((order) => (order.id === orderId ? payload.order || order : order)),
        );
        setAdminOrderDrafts((prev) => ({
          ...prev,
          [orderId]: payload.order ? createAdminOrderDraft(payload.order) : prev[orderId],
        }));
      }

      setAdminOrderMessage(payload.message || '배송 정보가 저장되었습니다.');
    } catch (error) {
      setAdminOrderError(error instanceof Error ? error.message : '배송 정보 저장 실패');
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
      setAdminOrderDrafts((prev) => {
        const next: Record<string, AdminOrderDraft> = {};
        nextOrders.forEach((order) => {
          const previousDraft = prev[order.id];
          next[order.id] = previousDraft || createAdminOrderDraft(order);
        });
        return next;
      });
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
      setActiveTab('profile');
    }
  }, [activeTab, isPrimaryAdmin]);

  useEffect(() => {
    if (!isPrimaryAdmin) return;
    if (activeTab !== 'members') return;
    if (membersLoaded) return;
    void loadMembers();
  }, [activeTab, isPrimaryAdmin, membersLoaded, loadMembers]);

  useEffect(() => {
    if (activeTab !== 'orders') return;
    if (memberOrdersLoaded) return;
    void loadMemberOrders();
  }, [activeTab, memberOrdersLoaded, loadMemberOrders]);

  useEffect(() => {
    if (!isPrimaryAdmin) return;
    if (activeTab !== 'adminOrders') return;
    if (adminOrdersLoaded) return;
    void loadAdminOrders();
  }, [activeTab, adminOrdersLoaded, isPrimaryAdmin, loadAdminOrders]);

  if (!isAuthReady) {
    return (
      <div className="space-y-4 font-mono">
        <div className="border border-[#333] bg-[#0a0a0a] p-4 text-xs text-[#9a9a9a]">
          인증 상태 확인 중...
        </div>
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return (
      <div className="space-y-4 font-mono">
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
      <div className="space-y-4">
        <div className="border border-[#00ffd1]/40 bg-[#00ffd1]/5 p-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-widest text-[#00ffd1]">내 주문 / 배송조회</p>
              <p className="text-xs text-[#9a9a9a] mt-2">
                배송상태, 택배사, 운송장번호를 확인할 수 있습니다.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void loadMemberOrders()}
              disabled={isLoadingMemberOrders}
              className="px-3 py-2 border border-[#333] bg-[#111] text-xs uppercase tracking-widest hover:border-[#00ffd1] hover:text-[#00ffd1] transition-colors disabled:opacity-50"
            >
              {isLoadingMemberOrders ? '새로고침 중...' : '주문 새로고침'}
            </button>
          </div>
        </div>

        {(memberOrderMessage || memberOrderError) && (
          <div
            className={`border p-3 text-xs ${
              memberOrderError
                ? 'border-red-700 bg-red-950/20 text-red-300'
                : 'border-[#00ffd1]/40 bg-[#00ffd1]/5 text-[#bafff0]'
            }`}
          >
            {memberOrderError || memberOrderMessage}
          </div>
        )}

        {isLoadingMemberOrders && memberOrders.length === 0 ? (
          <div className="border border-[#333] bg-[#111] p-4 text-xs text-[#888]">
            주문 목록을 불러오는 중입니다...
          </div>
        ) : memberOrders.length === 0 ? (
          <div className="border border-dashed border-[#333] bg-[#0a0a0a] p-4 text-xs text-[#666]">
            주문 내역이 없습니다.
          </div>
        ) : (
          <div className="space-y-3">
            {memberOrders.map((order) => (
              <article key={order.id} className="border border-[#333] bg-[#111] p-4 space-y-3">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                  <div>
                    <p className="text-xs text-[#e5e5e5] break-all">
                      주문번호: {order.orderCode || order.guestOrderNumber || order.id}
                    </p>
                    <p className="text-[10px] text-[#666] mt-1">
                      생성일: {formatDate(order.createdAt || undefined)}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2 text-[10px] uppercase tracking-widest">
                    <span className="px-2 py-1 border border-[#00ffd1]/50 bg-[#00ffd1]/10 text-[#00ffd1]">
                      {getShippingStatusLabel(order.shippingStatus)}
                    </span>
                    <span className="px-2 py-1 border border-[#333] bg-black text-[#aaa]">
                      {order.paymentMethod || '-'}
                    </span>
                    <span className="px-2 py-1 border border-[#333] bg-black text-[#aaa]">
                      {order.paymentStatus || '-'}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
                  <div className="border border-[#333] bg-black p-3">
                    <p className="text-[#666] mb-1">주문 금액</p>
                    <p className="text-[#00ffd1] font-bold">
                      {Number(order.amountTotal || 0).toLocaleString('ko-KR')}원
                    </p>
                    <p className="text-[#888] mt-1">항목 {order.items.length}개</p>
                  </div>
                  <div className="border border-[#333] bg-black p-3">
                    <p className="text-[#666] mb-1">택배사</p>
                    <p className="text-[#e5e5e5]">{order.shippingCompany || '-'}</p>
                    <p className="text-[#888] mt-1">발송: {formatDateTime(order.shippedAt)}</p>
                  </div>
                  <div className="border border-[#333] bg-black p-3">
                    <p className="text-[#666] mb-1">운송장번호</p>
                    <p className="text-[#e5e5e5] break-all">{order.trackingNumber || '-'}</p>
                    <p className="text-[#888] mt-1">완료: {formatDateTime(order.deliveredAt)}</p>
                  </div>
                </div>

                <div className="border border-[#333] bg-[#0d0d0d] p-3">
                  <p className="text-[10px] uppercase tracking-widest text-[#666] mb-2">배송지</p>
                  <p className="text-xs text-[#9a9a9a] break-all">{order.customerAddress || '-'}</p>
                </div>

                <div className="border border-[#333] bg-[#0d0d0d] p-3">
                  <p className="text-[10px] uppercase tracking-widest text-[#666] mb-2">배송 메모</p>
                  <p className="text-xs text-[#9a9a9a] break-all">{order.shippingNote || '-'}</p>
                </div>
              </article>
            ))}
          </div>
        )}
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
                <div className="w-12 aspect-[4/5] border border-[#333] bg-black overflow-hidden shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={item.image} alt="" className="w-full h-full object-contain bg-black" />
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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          <div className="rounded-2xl border border-white/15 bg-[#121212] p-4">
            <p className="text-[#8a8a8a] mb-1">이름</p>
            <p className="text-[#f5f5f5] text-sm">{userDisplayName}</p>
          </div>
          <div className="rounded-2xl border border-white/15 bg-[#121212] p-4">
            <p className="text-[#8a8a8a] mb-1">이메일</p>
            <p className="text-[#f5f5f5] text-sm break-all">{user.email}</p>
          </div>
          <div className="rounded-2xl border border-white/15 bg-[#121212] p-4">
            <p className="text-[#8a8a8a] mb-1">로그인 수단</p>
            <p className="text-[#f5f5f5] text-sm">{profile?.provider === 'google' ? 'Google' : 'Email'}</p>
          </div>
          <div className="rounded-2xl border border-white/15 bg-[#121212] p-4">
            <p className="text-[#8a8a8a] mb-1">가입일</p>
            <p className="text-[#f5f5f5] text-sm">{formatDate(profile?.created_at || user.created_at)}</p>
          </div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-[#101010] p-4">
          <p className="text-[11px] tracking-wide text-[#9a9a9a]">
            장바구니 {cart.length}개 / 합계 {cartSubtotal.toLocaleString('ko-KR')}원
          </p>
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
                    주문 목록과 배송정보(상태/택배사/운송장번호)를 관리할 수 있습니다.
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
                          주문번호: {order.orderCode || order.guestOrderNumber || order.id}
                        </p>
                        {order.guestOrderNumber && (
                          <p className="text-[10px] text-[#00ffd1] mt-1 break-all">
                            비회원조회번호: {order.guestOrderNumber}
                          </p>
                        )}
                        <p className="text-[10px] text-[#666] mt-1">
                          생성일: {formatDate(order.createdAt || undefined)}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2 text-[10px] uppercase tracking-widest">
                        <span className="px-2 py-1 border border-[#00ffd1]/50 bg-[#00ffd1]/10 text-[#00ffd1]">
                          {getShippingStatusLabel(order.shippingStatus)}
                        </span>
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

                    <div className="border border-[#333] bg-black p-3 space-y-2">
                      <p className="text-[10px] uppercase tracking-widest text-[#00ffd1]">배송정보 입력</p>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                        <select
                          value={adminOrderDrafts[order.id]?.shippingStatus || 'preparing'}
                          onChange={(event) =>
                            updateAdminOrderDraft(order.id, 'shippingStatus', event.target.value)
                          }
                          className="w-full bg-[#050505] border border-[#333] py-2 px-3 focus:outline-none focus:border-[#00ffd1] text-[#e5e5e5]"
                        >
                          <option value="preparing">배송준비중</option>
                          <option value="shipping">배송중</option>
                          <option value="delivered">배송완료</option>
                        </select>
                        <input
                          type="text"
                          value={adminOrderDrafts[order.id]?.shippingCompany || ''}
                          onChange={(event) =>
                            updateAdminOrderDraft(order.id, 'shippingCompany', event.target.value)
                          }
                          className="w-full bg-[#050505] border border-[#333] py-2 px-3 focus:outline-none focus:border-[#00ffd1] text-[#e5e5e5]"
                          placeholder="택배사"
                        />
                        <input
                          type="text"
                          value={adminOrderDrafts[order.id]?.trackingNumber || ''}
                          onChange={(event) =>
                            updateAdminOrderDraft(order.id, 'trackingNumber', event.target.value)
                          }
                          className="w-full bg-[#050505] border border-[#333] py-2 px-3 focus:outline-none focus:border-[#00ffd1] text-[#e5e5e5]"
                          placeholder="운송장번호"
                        />
                        <input
                          type="text"
                          value={adminOrderDrafts[order.id]?.shippingNote || ''}
                          onChange={(event) =>
                            updateAdminOrderDraft(order.id, 'shippingNote', event.target.value)
                          }
                          className="w-full bg-[#050505] border border-[#333] py-2 px-3 focus:outline-none focus:border-[#00ffd1] text-[#e5e5e5]"
                          placeholder="배송 메모"
                        />
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
                        <div className="border border-[#333] bg-[#0d0d0d] p-2">
                          <p className="text-[#666]">발송일시</p>
                          <p className="text-[#e5e5e5] mt-1">{formatDateTime(order.shippedAt)}</p>
                        </div>
                        <div className="border border-[#333] bg-[#0d0d0d] p-2">
                          <p className="text-[#666]">배송완료일시</p>
                          <p className="text-[#e5e5e5] mt-1">{formatDateTime(order.deliveredAt)}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => void handleSaveOrderShipping(order.id)}
                          className="py-2 border border-[#00ffd1] text-[#00ffd1] hover:bg-[#00ffd1] hover:text-black transition-colors uppercase text-xs tracking-widest"
                        >
                          배송정보 저장
                        </button>
                      </div>
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
              <button
                type="button"
                onClick={() => setAdminComposer('products')}
                className="rounded-xl border border-[#7bb8ff]/45 bg-[#7bb8ff]/12 p-3 text-left text-xs text-[#e6f2ff] hover:bg-[#7bb8ff]/20 transition-colors"
              >
                <p className="font-semibold">의류 게시물 편집 열기</p>
                <p className="text-[10px] mt-1 text-[#a9c7e7]">의류 게시글 작성/수정/삭제</p>
              </button>
              <button
                type="button"
                onClick={() => setAdminComposer('collections')}
                className="rounded-xl border border-[#00ffd1]/45 bg-[#00ffd1]/12 p-3 text-left text-xs text-[#e9fff9] hover:bg-[#00ffd1]/20 transition-colors"
              >
                <p className="font-semibold">컬렉션 게시물 편집 열기</p>
                <p className="text-[10px] mt-1 text-[#9fe6d7]">컬렉션 게시글 작성/수정/삭제</p>
              </button>
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
    <div className="font-mono">
      <div className="rounded-[28px] border border-white/10 bg-[#0d0d0d] p-3 md:p-4">
        <div className="grid grid-cols-1 md:grid-cols-[300px_minmax(0,1fr)] gap-4 md:gap-5">
          <aside className="rounded-2xl border border-white/10 bg-[#121212] p-3 md:p-4 space-y-3">
            <button
              type="button"
              onClick={() => {
                if (onBack) {
                  onBack();
                  return;
                }
                if (typeof window !== 'undefined' && window.history.length > 1) {
                  window.history.back();
                }
              }}
              className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl border border-white/20 bg-[#1b1b1b] px-3 py-2.5 text-xs text-[#e6e6e6] hover:bg-[#262626] transition-colors"
            >
              <ChevronLeft size={14} />
              뒤로가기
            </button>

            <div className="rounded-2xl border border-white/10 bg-[#171717] p-3">
              <p className="text-[11px] text-[#8e8e8e] tracking-wide">마이페이지</p>
              <h3 className="text-xl font-semibold text-[#f5f5f5] mt-1">{userDisplayName}</h3>
              <p className="text-xs text-[#a5a5a5] mt-1 break-all">{user.email}</p>
              <p className="text-[11px] text-[#8a8a8a] mt-3">
                장바구니 {cart.length}개 / {cartSubtotal.toLocaleString('ko-KR')}원
              </p>
            </div>

            <button
              type="button"
              onClick={() => void signOut()}
              disabled={isBusy}
              className="w-full inline-flex items-center justify-center rounded-xl border border-red-500/50 bg-red-500/10 px-3 py-2.5 text-xs text-red-200 hover:bg-red-500/20 transition-colors disabled:opacity-50"
            >
              {isBusy ? '처리중...' : '로그아웃'}
            </button>

            <div className="space-y-2">
              {tabs.map((tab) => {
                const active = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={`w-full flex items-center justify-between rounded-xl border px-3 py-2.5 text-sm transition-colors ${
                      active
                        ? 'border-[#7bb8ff]/60 bg-[#7bb8ff]/15 text-[#e8f3ff]'
                        : 'border-white/15 bg-[#161616] text-[#c8c8c8] hover:bg-[#1f1f1f]'
                    }`}
                  >
                    <span>{tab.label}</span>
                    {typeof tab.count === 'number' && (
                      <span className="text-[11px] text-[#9fb8d1]">{tab.count}</span>
                    )}
                  </button>
                );
              })}
            </div>

            {isPrimaryAdmin && (
              <div className="rounded-xl border border-white/10 bg-[#161616] p-3 space-y-3">
                <p className="text-[10px] uppercase tracking-[0.18em] text-[#8ea8c7]">게시물 편집 허브</p>
                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={() => setAdminComposer('products')}
                    className="w-full rounded-lg border border-[#7bb8ff]/40 bg-[#7bb8ff]/10 px-3 py-2.5 text-left text-xs text-[#e6f2ff] hover:bg-[#7bb8ff]/20 transition-colors"
                  >
                    <p className="font-semibold">의류 게시물 수정</p>
                    <p className="text-[10px] text-[#a9c7e7] mt-1">의류 게시글 작성/수정/삭제 화면 열기</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setAdminComposer('collections')}
                    className="w-full rounded-lg border border-[#00ffd1]/40 bg-[#00ffd1]/10 px-3 py-2.5 text-left text-xs text-[#e9fff9] hover:bg-[#00ffd1]/20 transition-colors"
                  >
                    <p className="font-semibold">컬렉션 게시물 수정</p>
                    <p className="text-[10px] text-[#9fe6d7] mt-1">컬렉션 게시글 작성/수정/삭제 화면 열기</p>
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('adminOrders')}
                  className="w-full rounded-lg border border-[#7bb8ff]/50 bg-[#7bb8ff]/10 px-3 py-2 text-xs text-[#dcecff] hover:bg-[#7bb8ff]/20 transition-colors"
                >
                  배송관리 열기
                </button>
              </div>
            )}
          </aside>

          <section className="rounded-2xl border border-white/10 bg-[#101010] p-4 md:p-6">
            <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-[#171717] px-3 py-2.5">
              <p className="text-xs text-[#a8a8a8]">
                현재 탭: <span className="text-[#f5f5f5]">{tabs.find((tab) => tab.id === activeTab)?.label || '계정'}</span>
              </p>
              <button
                type="button"
                onClick={() => void signOut()}
                disabled={isBusy}
                className="inline-flex items-center justify-center rounded-lg border border-red-500/50 bg-red-500/10 px-3 py-1.5 text-[11px] text-red-200 hover:bg-red-500/20 transition-colors disabled:opacity-50"
              >
                {isBusy ? '처리중...' : '로그아웃'}
              </button>
            </div>
            {isPrimaryAdmin && (
              <div className="mb-5 rounded-2xl border border-[#00ffd1]/50 bg-[#061612] p-4">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 mb-3">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-[#00ffd1]">
                    관리자 게시물 수정
                  </p>
                  <p className="text-[11px] text-[#8fd4c6]">
                    버튼 누르면 바로 게시물 수정 화면이 열립니다.
                  </p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setAdminComposer('products')}
                    className="w-full rounded-xl border border-[#7bb8ff] bg-[#7bb8ff] px-4 py-3 text-sm font-semibold text-black hover:bg-[#9fcbff] transition-colors"
                  >
                    의류 게시물 수정 열기
                  </button>
                  <button
                    type="button"
                    onClick={() => setAdminComposer('collections')}
                    className="w-full rounded-xl border border-[#00ffd1] bg-[#00ffd1] px-4 py-3 text-sm font-semibold text-black hover:bg-[#63ffe1] transition-colors"
                  >
                    컬렉션 게시물 수정 열기
                  </button>
                </div>
              </div>
            )}
            {tabContent[activeTab]}
          </section>
        </div>
      </div>

      {adminComposer && (
        <div className="fixed inset-0 z-[140] flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="close admin composer"
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            onClick={() => setAdminComposer(null)}
          />

          <div className="relative w-[min(1200px,95vw)] h-[min(860px,90vh)] rounded-3xl border border-white/15 bg-[#0d0d0d] overflow-hidden shadow-[0_40px_120px_rgba(0,0,0,0.7)]">
            <div className="h-16 border-b border-white/10 bg-[#131313] flex items-center justify-between px-4">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setAdminComposer('products')}
                  className={`px-3 py-1.5 rounded-lg text-xs transition-colors ${
                    adminComposer === 'products'
                      ? 'bg-[#7bb8ff]/20 border border-[#7bb8ff]/50 text-[#e8f3ff]'
                      : 'bg-[#1a1a1a] border border-white/15 text-[#bdbdbd] hover:bg-[#222]'
                  }`}
                >
                  의류 게시물
                </button>
                <button
                  type="button"
                  onClick={() => setAdminComposer('collections')}
                  className={`px-3 py-1.5 rounded-lg text-xs transition-colors ${
                    adminComposer === 'collections'
                      ? 'bg-[#7bb8ff]/20 border border-[#7bb8ff]/50 text-[#e8f3ff]'
                      : 'bg-[#1a1a1a] border border-white/15 text-[#bdbdbd] hover:bg-[#222]'
                  }`}
                >
                  컬렉션 게시물
                </button>
                <p className="hidden md:block text-[11px] text-[#8a8a8a] ml-2">
                  현재 편집: {adminComposer === 'products' ? '의류 게시물' : '컬렉션 게시물'}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setAdminComposer(null)}
                className="h-8 w-8 rounded-lg border border-white/15 bg-[#1a1a1a] text-[#cfcfcf] hover:bg-[#262626]"
              >
                ×
              </button>
            </div>

            <div className="h-[calc(100%-64px)]">
              <iframe
                src={adminComposer === 'products' ? '/admin?embedded=1' : '/admin/collections?embedded=1'}
                className="w-full h-full border-0 bg-[#050505]"
                title={adminComposer === 'products' ? 'products-admin' : 'collections-admin'}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
