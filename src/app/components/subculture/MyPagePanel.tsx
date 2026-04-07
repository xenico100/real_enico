'use client';

import Image from 'next/image';
import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { ChevronLeft } from 'lucide-react';
import { useAuth } from '@/app/context/AuthContext';
import { useFashionCart } from '@/app/context/FashionCartContext';
import { shouldBypassImageOptimization } from '@/lib/images';
import { AccountAuthPanel } from './AccountAuthPanel';

type MyPageTab =
  | 'overview'
  | 'orders'
  | 'saved'
  | 'cart'
  | 'profile'
  | 'dailyStats'
  | 'members'
  | 'adminOrders';

type AdminComposerType = 'products' | 'collections';
type AdminOrderView = 'new' | 'shipping' | 'cancelled';
const PRIMARY_ADMIN_EMAIL = 'morba9850@gmail.com';
const ADMIN_EMAIL_DOMAIN = 'enicoveck.com';
const DEFAULT_BANK_ACCOUNT_HOLDER = '백형석';
const DEFAULT_SHIPPING_COMPANY = '우체국';

type VisitSourceBreakdown = {
  instagram: number;
  youtube: number;
  threads: number;
  twitter: number;
  other: number;
};

type DailyStatsRow = {
  dateKst: string;
  visitorCount: number;
  pageHitCount: number;
  sourceVisitors: VisitSourceBreakdown;
  createdRoomCount: number;
  messageCount: number;
};

type DailyStatsSummary = {
  totalVisitors: number;
  totalPageHits: number;
  totalSourceVisitors: VisitSourceBreakdown;
  totalCreatedRooms: number;
  totalMessages: number;
};

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
  paymentReceiptUrl: string;
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
  paymentStatus: string;
  shippingStatus: ShippingStatus;
  shippingCompany: string;
  trackingNumber: string;
  shippingNote: string;
};

const VISIT_SOURCE_CHART_SEGMENTS = [
  { key: 'instagram', label: '인스타그램', color: '#ff5aa5' },
  { key: 'youtube', label: '유튜브', color: '#ff4d4d' },
  { key: 'threads', label: '쓰레드', color: '#f6f2eb' },
  { key: 'twitter', label: '트위터', color: '#63b8ff' },
  { key: 'other', label: '그 외', color: '#00ffd1' },
] as const;

const EMPTY_VISIT_SOURCE_BREAKDOWN: VisitSourceBreakdown = {
  instagram: 0,
  youtube: 0,
  threads: 0,
  twitter: 0,
  other: 0,
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

function isDesignatedAdmin(email: string | null | undefined) {
  const normalized = (email || '').trim().toLowerCase();
  if (!normalized) return false;
  return normalized === PRIMARY_ADMIN_EMAIL || normalized.endsWith(`@${ADMIN_EMAIL_DOMAIN}`);
}

function getShippingStatusLabel(status: ShippingStatus) {
  if (status === 'shipping') return '배송중';
  if (status === 'delivered') return '배송완료';
  return '배송준비중';
}

function getPaymentStatusLabel(paymentMethod: string, status: string) {
  const normalizedMethod = (paymentMethod || '').toLowerCase();
  const normalizedStatus = (status || '').toLowerCase();

  if (normalizedStatus === 'refund_pending') return '환불진행중';
  if (normalizedStatus === 'cancelled') {
    return normalizedMethod === 'bank_transfer' ? '환불완료' : '결제취소';
  }
  if (normalizedStatus === 'partialcancelled') return '부분취소';

  if (normalizedMethod === 'bank_transfer') {
    if (normalizedStatus === 'transfer_confirmed') return '이체확인';
    if (normalizedStatus === 'pending_transfer') return '이체확인중';
  }

  if (normalizedMethod === 'paypal') {
    if (normalizedStatus === 'captured' || normalizedStatus === 'completed') return '결제완료';
  }

  if (normalizedMethod === 'nicepay') {
    if (normalizedStatus === 'paid' || normalizedStatus === 'completed') return '결제완료';
  }

  return status || '-';
}

function getPaymentMethodLabel(method: string) {
  const normalizedMethod = (method || '').toLowerCase();
  if (normalizedMethod === 'bank_transfer') return '계좌이체';
  if (normalizedMethod === 'paypal') return 'PayPal';
  if (normalizedMethod === 'nicepay') return 'NICE Payments';
  return method || '-';
}

function getEditablePaymentStatusValue(paymentMethod: string, status: string) {
  const normalizedMethod = (paymentMethod || '').trim().toLowerCase();
  const normalizedStatus = (status || '').trim().toLowerCase();

  if (normalizedStatus === 'refund_pending') return 'refund_pending';
  if (normalizedStatus === 'cancelled') return 'cancelled';

  if (normalizedMethod === 'bank_transfer') {
    if (normalizedStatus === 'transfer_confirmed') return 'transfer_confirmed';
    if (normalizedStatus === 'cancelled') return 'cancelled';
    return normalizedStatus === 'refund_pending' ? 'refund_pending' : 'pending_transfer';
  }

  if (normalizedMethod === 'nicepay') {
    return normalizedStatus === 'completed' ? 'completed' : 'paid';
  }

  if (normalizedMethod === 'paypal') {
    return normalizedStatus === 'completed' ? 'completed' : 'captured';
  }

  return normalizedStatus || 'pending_transfer';
}

function getPaymentStatusSelectOptions(paymentMethod: string, currentStatus: string) {
  const normalizedMethod = (paymentMethod || '').trim().toLowerCase();
  const normalizedStatus = (currentStatus || '').trim().toLowerCase();

  if (normalizedMethod === 'bank_transfer') {
    return [
      { value: 'pending_transfer', label: '이체확인중' },
      { value: 'transfer_confirmed', label: '이체확인' },
      { value: 'refund_pending', label: '환불진행중' },
      { value: 'cancelled', label: '환불완료' },
    ];
  }

  if (normalizedMethod === 'nicepay') {
    return [
      {
        value: normalizedStatus === 'completed' ? 'completed' : 'paid',
        label: '결제완료',
      },
      { value: 'cancelled', label: '결제취소' },
    ];
  }

  if (normalizedMethod === 'paypal') {
    return [
      {
        value: normalizedStatus === 'completed' ? 'completed' : 'captured',
        label: '결제완료',
      },
      { value: 'cancelled', label: '결제취소' },
    ];
  }

  return [
    {
      value: normalizedStatus || 'pending_transfer',
      label: getPaymentStatusLabel(paymentMethod, currentStatus),
    },
  ];
}

function getMemberOrderCancelState(
  order: Pick<OrderRecord, 'paymentMethod' | 'paymentStatus' | 'shippingStatus'>,
) {
  const paymentMethod = (order.paymentMethod || '').trim().toLowerCase();
  const paymentStatus = (order.paymentStatus || '').trim().toLowerCase();
  const shippingStatus = (order.shippingStatus || '').trim().toLowerCase();

  if (paymentStatus === 'refund_pending') {
    return {
      visible: true,
      enabled: false,
      title: '환불진행중',
      label: '환불진행중',
      description: '취소 요청은 접수됐고 현재 환불/취소 확인이 진행 중입니다.',
    };
  }

  if (paymentStatus === 'cancelled') {
    return {
      visible: true,
      enabled: false,
      title: paymentMethod === 'nicepay' ? '카드결제 취소' : '환불완료',
      label: paymentMethod === 'nicepay' ? '결제취소 완료' : '환불완료',
      description:
        paymentMethod === 'nicepay'
          ? '이미 카드결제 취소가 완료된 주문입니다.'
          : '이미 환불 완료 처리된 주문입니다.',
    };
  }

  if (shippingStatus && shippingStatus !== 'preparing') {
    return {
      visible: true,
      enabled: false,
      title: paymentMethod === 'nicepay' ? '카드결제 취소' : '주문취소',
      label: '배송 시작 후 취소불가',
      description: '배송준비중 상태의 주문만 온라인에서 취소할 수 있습니다.',
    };
  }

  if (paymentMethod === 'nicepay' && (paymentStatus === 'paid' || paymentStatus === 'completed')) {
    return {
      visible: true,
      enabled: true,
      title: '카드결제 취소',
      label: '카드결제 취소',
      description: 'NICE 결제 승인 취소와 관리자 메일 전송을 함께 처리합니다.',
    };
  }

  if (
    paymentMethod === 'bank_transfer' &&
    (paymentStatus === 'pending_transfer' || paymentStatus === 'transfer_confirmed')
  ) {
    return {
      visible: true,
      enabled: true,
      title: '주문취소 / 환불요청',
      label: '주문취소 요청',
      description: '계좌이체 주문 취소 요청을 접수하고 관리자 확인 후 환불 상태로 진행합니다.',
    };
  }

  return {
    visible: false,
    enabled: false,
    title: '',
    label: '',
    description: '',
  };
}

function getAdminOrderCancelState(
  order: Pick<OrderRecord, 'paymentMethod' | 'paymentStatus' | 'shippingStatus'>,
) {
  const paymentMethod = (order.paymentMethod || '').trim().toLowerCase();
  const paymentStatus = (order.paymentStatus || '').trim().toLowerCase();
  const shippingStatus = (order.shippingStatus || '').trim().toLowerCase();

  if (paymentStatus === 'refund_pending') {
    return {
      visible: true,
      enabled: false,
      title: paymentMethod === 'nicepay' ? '카드결제 취소' : '환불진행중',
      label: '환불진행중',
      description: '이미 환불/취소 확인이 진행 중인 주문입니다.',
    };
  }

  if (paymentStatus === 'cancelled') {
    return {
      visible: true,
      enabled: false,
      title: paymentMethod === 'nicepay' ? '카드결제 취소' : '환불완료',
      label: paymentMethod === 'nicepay' ? '결제취소 완료' : '환불완료',
      description:
        paymentMethod === 'nicepay'
          ? '이미 카드결제 취소가 완료된 주문입니다.'
          : '이미 환불 완료 처리된 주문입니다.',
    };
  }

  if (shippingStatus && shippingStatus !== 'preparing') {
    return {
      visible: true,
      enabled: false,
      title: paymentMethod === 'nicepay' ? '카드결제 취소' : '주문취소',
      label: '배송 시작 후 취소불가',
      description: '배송준비중 상태의 주문만 관리자 화면에서 취소할 수 있습니다.',
    };
  }

  if (paymentMethod === 'nicepay' && (paymentStatus === 'paid' || paymentStatus === 'completed')) {
    return {
      visible: true,
      enabled: true,
      title: '카드결제 취소',
      label: '카드결제 취소',
      description: 'NICE 카드 승인 취소와 관리자 메일 전송을 함께 처리합니다.',
    };
  }

  if (
    paymentMethod === 'bank_transfer' &&
    (paymentStatus === 'pending_transfer' || paymentStatus === 'transfer_confirmed')
  ) {
    return {
      visible: true,
      enabled: true,
      title: '주문취소 / 환불요청',
      label: '주문취소 요청',
      description: '계좌이체 주문을 환불 진행중 상태로 바꾸고 관리자 메일로 기록을 보냅니다.',
    };
  }

  return {
    visible: false,
    enabled: false,
    title: '',
    label: '',
    description: '',
  };
}

function isCancelledAdminOrder(order: Pick<OrderRecord, 'paymentStatus'>) {
  const paymentStatus = (order.paymentStatus || '').trim().toLowerCase();
  return paymentStatus === 'refund_pending' || paymentStatus === 'cancelled' || paymentStatus === 'partialcancelled';
}

function isShippingAdminOrder(order: Pick<OrderRecord, 'paymentStatus' | 'shippingStatus'>) {
  if (isCancelledAdminOrder(order)) return false;
  const shippingStatus = (order.shippingStatus || '').trim().toLowerCase();
  return shippingStatus === 'shipping' || shippingStatus === 'delivered';
}

function isNewAdminOrder(order: Pick<OrderRecord, 'paymentStatus' | 'shippingStatus'>) {
  if (isCancelledAdminOrder(order)) return false;
  return !isShippingAdminOrder(order);
}

function formatKrw(value: number | string | null | undefined) {
  const amount = typeof value === 'number' ? value : Number(value || 0);
  return `${(Number.isFinite(amount) ? amount : 0).toLocaleString('ko-KR')}원`;
}

function buildVisitSourceChartStyle(breakdown: VisitSourceBreakdown): CSSProperties {
  const total =
    breakdown.instagram +
    breakdown.youtube +
    breakdown.threads +
    breakdown.twitter +
    breakdown.other;

  if (total <= 0) {
    return {
      background: 'conic-gradient(#1a1a1a 0deg 360deg)',
    };
  }

  let currentAngle = 0;
  const segments = VISIT_SOURCE_CHART_SEGMENTS.map(({ key, color }) => {
    const amount = breakdown[key];
    const ratio = amount / total;
    const start = currentAngle;
    currentAngle += ratio * 360;
    return `${color} ${start}deg ${currentAngle}deg`;
  });

  return {
    background: `conic-gradient(${segments.join(', ')})`,
  };
}

function VisitSourceDonutCard({
  title,
  subtitle,
  breakdown,
}: {
  title: string;
  subtitle: string;
  breakdown: VisitSourceBreakdown;
}) {
  const total =
    breakdown.instagram +
    breakdown.youtube +
    breakdown.threads +
    breakdown.twitter +
    breakdown.other;
  const chartStyle = buildVisitSourceChartStyle(breakdown);

  return (
    <div className="rounded-[20px] border border-[#24443e] bg-[#0f1414] p-4">
      <div className="mb-4">
        <p className="text-[10px] uppercase tracking-[0.22em] text-[#76b7aa]">{title}</p>
        <p className="mt-1 text-[11px] text-[#8ea6a1]">{subtitle}</p>
      </div>

      <div className="flex items-center gap-4">
        <div className="relative h-28 w-28 shrink-0">
          <div
            className="h-full w-full rounded-full border border-white/10 shadow-[inset_0_0_20px_rgba(0,0,0,0.25)]"
            style={chartStyle}
          />
          <div className="absolute inset-[18%] flex items-center justify-center rounded-full border border-[#1f2d2a] bg-[#050808] text-center">
            <div>
              <p className="text-[10px] uppercase tracking-[0.18em] text-[#7f9792]">합계</p>
              <p className="mt-1 text-lg font-semibold text-white">
                {total.toLocaleString('ko-KR')}
              </p>
            </div>
          </div>
        </div>

        <div className="flex-1 space-y-2 text-xs">
          {VISIT_SOURCE_CHART_SEGMENTS.map(({ key, label, color }) => {
            const count = breakdown[key];
            const ratio = total > 0 ? Math.round((count / total) * 100) : 0;

            return (
              <div
                key={key}
                className="flex items-center justify-between rounded-xl border border-[#263230] bg-black/40 px-3 py-2"
              >
                <div className="flex items-center gap-2 text-[#d8d8d8]">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: color }}
                  />
                  <span>{label}</span>
                </div>
                <div className="text-right">
                  <p className="text-[#f0f0f0]">{count.toLocaleString('ko-KR')}명</p>
                  <p className="text-[10px] text-[#7f9792]">{ratio}%</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
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
  const fallbackPaymentStatus =
    order.paymentMethod === 'nicepay'
      ? 'paid'
      : order.paymentMethod === 'paypal'
        ? 'captured'
        : 'pending_transfer';

  return {
    paymentStatus: order.paymentStatus || fallbackPaymentStatus,
    shippingStatus: order.shippingStatus || 'preparing',
    shippingCompany: order.shippingCompany || DEFAULT_SHIPPING_COMPANY,
    trackingNumber: order.trackingNumber || '',
    shippingNote: order.shippingNote || '',
  };
}

type MyPagePanelProps = {
  onBack?: () => void;
  initialTab?: MyPageTab;
};

export function MyPagePanel({ onBack, initialTab }: MyPagePanelProps = {}) {
  const {
    session,
    isAuthenticated,
    isAuthReady,
    user,
    profile,
    signOut,
    isBusy,
    updateAccountProfile,
  } = useAuth();
  const { cart } = useFashionCart();
  const [activeTab, setActiveTab] = useState<MyPageTab>(initialTab || 'profile');
  const [accountPhone, setAccountPhone] = useState('');
  const [accountAddress, setAccountAddress] = useState('');
  const [accountProfileMessage, setAccountProfileMessage] = useState<string | null>(null);
  const [accountProfileError, setAccountProfileError] = useState<string | null>(null);
  const [savingAccountField, setSavingAccountField] = useState<'phone' | 'address' | null>(null);
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
  const [cancellingMemberOrderId, setCancellingMemberOrderId] = useState<string | null>(null);
  const [adminOrders, setAdminOrders] = useState<AdminOrderRecord[]>([]);
  const [adminOrderDrafts, setAdminOrderDrafts] = useState<Record<string, AdminOrderDraft>>({});
  const [adminOrdersLoaded, setAdminOrdersLoaded] = useState(false);
  const [isLoadingAdminOrders, setIsLoadingAdminOrders] = useState(false);
  const [adminOrderMessage, setAdminOrderMessage] = useState<string | null>(null);
  const [adminOrderError, setAdminOrderError] = useState<string | null>(null);
  const [cancellingAdminOrderId, setCancellingAdminOrderId] = useState<string | null>(null);
  const [adminOrderView, setAdminOrderView] = useState<AdminOrderView>('new');
  const [dailyStatsRows, setDailyStatsRows] = useState<DailyStatsRow[]>([]);
  const [dailyStatsSummary, setDailyStatsSummary] = useState<DailyStatsSummary | null>(null);
  const [dailyStatsLoaded, setDailyStatsLoaded] = useState(false);
  const [isLoadingDailyStats, setIsLoadingDailyStats] = useState(false);
  const [dailyStatsMessage, setDailyStatsMessage] = useState<string | null>(null);
  const [dailyStatsError, setDailyStatsError] = useState<string | null>(null);
  const [adminComposer, setAdminComposer] = useState<AdminComposerType | null>(null);
  const isPrimaryAdmin = (user?.email || '').toLowerCase() === PRIMARY_ADMIN_EMAIL;
  const isDesignatedAdminUser = isDesignatedAdmin(user?.email);

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
  const userPhone = useMemo(
    () => (typeof user?.user_metadata?.phone === 'string' ? user.user_metadata.phone.trim() : ''),
    [user],
  );
  const userAddress = useMemo(
    () =>
      typeof user?.user_metadata?.address === 'string' ? user.user_metadata.address.trim() : '',
    [user],
  );

  useEffect(() => {
    setAccountPhone(userPhone);
    setAccountAddress(userAddress);
  }, [userAddress, userPhone]);

  useEffect(() => {
    if (!initialTab) return;
    setActiveTab(initialTab);
  }, [initialTab]);

  const cartSubtotal = cart.reduce((sum, item) => sum + item.price * (item.quantity || 1), 0);
  const adminOrderViewCounts = useMemo(
    () =>
      adminOrders.reduce(
        (summary, order) => {
          if (isCancelledAdminOrder(order)) {
            summary.cancelled += 1;
            return summary;
          }

          if (isShippingAdminOrder(order)) {
            summary.shipping += 1;
            return summary;
          }

          summary.new += 1;
          return summary;
        },
        {
          new: 0,
          shipping: 0,
          cancelled: 0,
        },
      ),
    [adminOrders],
  );
  const filteredAdminOrders = useMemo(() => {
    if (adminOrderView === 'cancelled') {
      return adminOrders.filter((order) => isCancelledAdminOrder(order));
    }

    if (adminOrderView === 'shipping') {
      return adminOrders.filter((order) => isShippingAdminOrder(order));
    }

    return adminOrders.filter((order) => isNewAdminOrder(order));
  }, [adminOrderView, adminOrders]);
  const latestDailyStats = dailyStatsRows[0] || null;
  const dailyStatsRangeLabel = `${Math.max(dailyStatsRows.length, 0)}일`;

  const tabs: { id: MyPageTab; label: string; count?: number }[] = [
    { id: 'profile', label: '계정' },
    { id: 'orders', label: '주문', count: memberOrders.length },
  ];
  if (isPrimaryAdmin) {
    tabs.push({ id: 'members', label: '회원관리', count: members.length });
    tabs.push({ id: 'adminOrders', label: '배송관리', count: adminOrders.length });
  }
  if (isDesignatedAdminUser) {
    tabs.push({ id: 'dailyStats', label: '일일데이터', count: dailyStatsRows.length });
  }

  const resetMemberMessages = () => {
    setMemberMessage(null);
    setMemberError(null);
  };

  const handleSaveAccountField = async (field: 'phone' | 'address') => {
    setAccountProfileMessage(null);
    setAccountProfileError(null);
    setSavingAccountField(field);

    try {
      if (field === 'phone') {
        await updateAccountProfile({
          phone: accountPhone,
        });
        setAccountProfileMessage('핸드폰번호를 저장했습니다.');
      } else {
        await updateAccountProfile({
          address: accountAddress,
        });
        setAccountProfileMessage('주소를 저장했습니다.');
      }
    } catch (error) {
      setAccountProfileError(error instanceof Error ? error.message : '계정 정보 저장 실패');
    } finally {
      setSavingAccountField(null);
    }
  };

  const resetMemberOrderMessages = () => {
    setMemberOrderMessage(null);
    setMemberOrderError(null);
  };

  const resetAdminOrderMessages = () => {
    setAdminOrderMessage(null);
    setAdminOrderError(null);
  };

  const resetDailyStatsMessages = () => {
    setDailyStatsMessage(null);
    setDailyStatsError(null);
  };

  const openAdminComposer = (type: AdminComposerType) => {
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      window.location.href = type === 'products' ? '/admin' : '/admin/collections';
      return;
    }

    setAdminComposer(type);
  };

  const loadDailyStats = useCallback(async () => {
    if (!isDesignatedAdminUser) return;
    if (!session?.access_token) return;

    resetDailyStatsMessages();
    setIsLoadingDailyStats(true);
    try {
      const response = await fetch('/api/admin/daily-stats?days=7', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      const payload = (await response.json()) as {
        rows?: DailyStatsRow[];
        summary?: DailyStatsSummary;
        message?: string;
      };

      if (!response.ok) {
        throw new Error(payload.message || '일일 데이터 로드 실패');
      }

      const nextRows = Array.isArray(payload.rows) ? payload.rows : [];
      setDailyStatsRows(nextRows);
      setDailyStatsSummary(payload.summary || null);
      setDailyStatsLoaded(true);
      setDailyStatsMessage(`일일 데이터 ${nextRows.length}일 로드 완료`);
    } catch (error) {
      setDailyStatsError(error instanceof Error ? error.message : '일일 데이터 로드 실패');
    } finally {
      setIsLoadingDailyStats(false);
    }
  }, [isDesignatedAdminUser, session?.access_token]);

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

      if (field === 'paymentStatus') {
        const normalized =
          value === 'pending_transfer' ||
          value === 'transfer_confirmed' ||
          value === 'refund_pending' ||
          value === 'paid' ||
          value === 'cancelled' ||
          value === 'captured' ||
          value === 'completed'
            ? value
            : current.paymentStatus;
        return {
          ...prev,
          [orderId]: {
            ...current,
            paymentStatus: normalized,
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
          paymentStatus: draft.paymentStatus,
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

      setAdminOrderMessage(payload.message || '주문 상태/배송 정보가 저장되었습니다.');
    } catch (error) {
      setAdminOrderError(error instanceof Error ? error.message : '배송 정보 저장 실패');
    }
  };

  const handleCancelMemberOrder = async (order: MemberOrderRecord) => {
    if (!session?.access_token) return;

    const cancelState = getMemberOrderCancelState(order);
    if (!cancelState.enabled) return;

    const orderIdentifier = order.orderCode || order.guestOrderNumber || order.id;
    const isNicepayOrder = (order.paymentMethod || '').trim().toLowerCase() === 'nicepay';
    const confirmed =
      typeof window === 'undefined'
        ? true
        : window.confirm(
            isNicepayOrder
              ? `주문 ${orderIdentifier}의 NICE 카드결제를 취소할까요?\n배송 시작 전 주문만 온라인에서 취소됩니다.`
              : `주문 ${orderIdentifier}의 취소 요청을 접수할까요?\n현재 단계에서는 환불 진행중 상태로 전환되고 관리자 확인 후 처리됩니다.`,
          );
    if (!confirmed) return;

    resetMemberOrderMessages();
    setCancellingMemberOrderId(order.id);

    try {
      const response = await fetch('/api/orders/my/cancel', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          id: order.id,
          reason: 'member_requested_cancel',
        }),
      });

      const payload = (await response.json()) as {
        message?: string;
        order?: MemberOrderRecord;
      };

      if (!response.ok) {
        throw new Error(payload.message || '주문취소 실패');
      }

      if (payload.order) {
        setMemberOrders((prev) =>
          prev.map((target) => (target.id === order.id ? payload.order || target : target)),
        );
      }

      setMemberOrderMessage(payload.message || '주문취소가 완료되었습니다.');
    } catch (error) {
      setMemberOrderError(error instanceof Error ? error.message : '주문취소 실패');
    } finally {
      setCancellingMemberOrderId(null);
    }
  };

  const handleCancelAdminOrder = async (order: AdminOrderRecord) => {
    if (!session?.access_token) return;

    const cancelState = getAdminOrderCancelState(order);
    if (!cancelState.enabled) return;

    const orderIdentifier = order.orderCode || order.guestOrderNumber || order.id;
    const isNicepayOrder = (order.paymentMethod || '').trim().toLowerCase() === 'nicepay';
    const confirmed =
      typeof window === 'undefined'
        ? true
        : window.confirm(
            isNicepayOrder
              ? `주문 ${orderIdentifier}를 취소할까요?\nNICE 결제는 실제 승인 취소로 처리됩니다.`
              : `주문 ${orderIdentifier}를 취소 요청 상태로 전환할까요?\n계좌이체 주문은 환불 진행중 상태로 변경됩니다.`,
          );
    if (!confirmed) return;

    resetAdminOrderMessages();
    setCancellingAdminOrderId(order.id);

    try {
      const response = await fetch('/api/admin/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          id: order.id,
          action: 'cancel_payment',
          reason: 'admin_requested_cancel',
        }),
      });

      const payload = (await response.json()) as {
        message?: string;
        order?: AdminOrderRecord;
      };

      if (!response.ok) {
        throw new Error(payload.message || '결제취소 실패');
      }

      if (payload.order) {
        setAdminOrders((prev) =>
          prev.map((target) => (target.id === order.id ? payload.order || target : target)),
        );
        setAdminOrderDrafts((prev) => ({
          ...prev,
          [order.id]: payload.order ? createAdminOrderDraft(payload.order) : prev[order.id],
        }));
      }

      setAdminOrderMessage(payload.message || '결제취소가 완료되었습니다.');
    } catch (error) {
      setAdminOrderError(error instanceof Error ? error.message : '결제취소 실패');
    } finally {
      setCancellingAdminOrderId(null);
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
    if (
      (!isPrimaryAdmin && (activeTab === 'members' || activeTab === 'adminOrders')) ||
      (!isDesignatedAdminUser && activeTab === 'dailyStats')
    ) {
      setActiveTab('profile');
    }
  }, [activeTab, isDesignatedAdminUser, isPrimaryAdmin]);

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

  useEffect(() => {
    if (!isDesignatedAdminUser) return;
    if (activeTab !== 'dailyStats') return;
    if (dailyStatsLoaded) return;
    void loadDailyStats();
  }, [activeTab, dailyStatsLoaded, isDesignatedAdminUser, loadDailyStats]);

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
      <div className="h-full min-h-0 font-mono">
        <div className="h-full min-h-0 overflow-y-auto overscroll-contain pr-1 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
          <AccountAuthPanel />
        </div>
      </div>
    );
  }

  const tabContent: Record<MyPageTab, ReactNode> = {
    overview: (
      <div className="space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          <div className="border border-[#333] bg-[#111] p-4">
            <p className="text-[#9b9b9b] mb-1">가입일</p>
            <p className="text-[#e5e5e5]">{formatDate(profile?.created_at || user.created_at)}</p>
          </div>
          <div className="border border-[#333] bg-[#111] p-4">
            <p className="text-[#9b9b9b] mb-1">로그인 방식</p>
            <p className="text-[#e5e5e5] uppercase">{profile?.provider === 'google' ? '구글' : '이메일'}</p>
          </div>
          <div className="border border-[#333] bg-[#111] p-4">
            <p className="text-[#9b9b9b] mb-1">장바구니 품목</p>
            <p className="text-[#e5e5e5]">{cart.length}개</p>
          </div>
          <div className="border border-[#333] bg-[#111] p-4">
            <p className="text-[#9b9b9b] mb-1">장바구니 합계</p>
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
        <div className="rounded-[8px] border-2 border-[#d7dce4] bg-[linear-gradient(180deg,#181a1d_0%,#111214_100%)] p-5 shadow-[0_0_0_1px_rgba(236,240,245,0.16)]">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-[0.22em] text-[#c7ced8]">내 주문 / 배송조회</p>
            </div>
            <button
              type="button"
              onClick={() => void loadMemberOrders()}
              disabled={isLoadingMemberOrders}
              className="rounded-[6px] border border-[#c2c9d3] bg-[#15181c] px-4 py-3 text-sm font-medium text-[#eef2f7] hover:border-[#eef2f7] transition-colors disabled:opacity-50"
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
          <div className="border border-[#333] bg-[#111] p-4 text-xs text-[#c6c6c6]">
            주문 목록을 불러오는 중입니다...
          </div>
        ) : memberOrders.length === 0 ? (
          <div className="border border-dashed border-[#333] bg-[#0a0a0a] p-4 text-xs text-[#9b9b9b]">
            주문 내역이 없습니다.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {memberOrders.map((order) => {
              const cancelState = getMemberOrderCancelState(order);
              const isCancelling = cancellingMemberOrderId === order.id;

              return (
                <article
                  key={order.id}
                  className="overflow-hidden rounded-[8px] border-2 border-[#d9dee6] bg-[linear-gradient(180deg,#17191c_0%,#0e0f11_100%)] shadow-[0_0_0_1px_rgba(237,242,246,0.18)]"
                >
                  <div className="border-b-2 border-[#b2bbc9] bg-[linear-gradient(135deg,#1d2025_0%,#14161a_55%,#101113_100%)] px-5 py-4">
                    <div className="mb-3 text-[11px] uppercase tracking-[0.24em] text-[#c7ced8]">
                      Order Card
                    </div>
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div>
                        <p className="text-sm font-medium text-[#e9edf2] break-all">
                          주문번호: {order.orderCode || order.guestOrderNumber || order.id}
                        </p>
                        <p className="mt-2 text-xs text-[#a4abb5]">
                          생성일: {formatDate(order.createdAt || undefined)}
                        </p>
                      </div>
                      <div className="flex flex-col items-start gap-2 md:items-end">
                        <div className="flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.18em]">
                          <span className="rounded-full border border-[#c2c8d1] bg-[#d8dde5]/10 px-3 py-1.5 text-[#f4f7fb]">
                            {getPaymentStatusLabel(order.paymentMethod, order.paymentStatus)}
                          </span>
                          <span className="rounded-full border border-[#7a808a] bg-black/25 px-3 py-1.5 text-[#d4dae2]">
                            {getPaymentMethodLabel(order.paymentMethod)}
                          </span>
                          <span className="rounded-full border border-[#7a808a] bg-black/25 px-3 py-1.5 text-[#d4dae2]">
                            {getShippingStatusLabel(order.shippingStatus)}
                          </span>
                        </div>
                        {cancelState.visible ? (
                          <button
                            type="button"
                            onClick={() => void handleCancelMemberOrder(order)}
                            disabled={!cancelState.enabled || isCancelling}
                            className="rounded-[6px] border border-red-600/80 px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.18em] text-red-100 transition-colors hover:bg-red-600 hover:text-white disabled:cursor-not-allowed disabled:border-[#4b4f55] disabled:text-[#7c8188]"
                          >
                            {isCancelling ? '취소 처리중...' : cancelState.label}
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4 p-5">
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-3 text-sm">
                      <div className="rounded-[8px] border border-[#bcc5d0] bg-[#0d1015] p-4 shadow-[inset_0_0_0_1px_rgba(232,237,243,0.06)]">
                        <p className="text-[#a7aeb8]">주문 금액</p>
                        <p className="mt-2 text-2xl font-semibold tracking-[-0.02em] text-white">
                          {Number(order.amountTotal || 0).toLocaleString('ko-KR')}원
                        </p>
                        <p className="mt-2 text-sm text-[#d7dde4]">항목 {order.items.length}개</p>
                      </div>
                      <div className="rounded-[8px] border border-[#bcc5d0] bg-[#0d1015] p-4 shadow-[inset_0_0_0_1px_rgba(232,237,243,0.06)]">
                        <p className="text-[#a7aeb8]">택배사</p>
                        <p className="mt-2 text-lg font-medium text-white">{order.shippingCompany || '-'}</p>
                        <p className="mt-2 text-sm text-[#d7dde4]">발송: {formatDateTime(order.shippedAt)}</p>
                      </div>
                      <div className="rounded-[8px] border border-[#bcc5d0] bg-[#0d1015] p-4 shadow-[inset_0_0_0_1px_rgba(232,237,243,0.06)]">
                        <p className="text-[#a7aeb8]">운송장번호</p>
                        <p className="mt-2 break-all text-lg font-medium text-white">{order.trackingNumber || '-'}</p>
                        <p className="mt-2 text-sm text-[#d7dde4]">완료: {formatDateTime(order.deliveredAt)}</p>
                      </div>
                    </div>

                    <div className="rounded-[8px] border border-[#bcc5d0] bg-[#0d1015] p-4 shadow-[inset_0_0_0_1px_rgba(232,237,243,0.06)]">
                      <p className="text-[11px] uppercase tracking-[0.18em] text-[#c7ced8] mb-2">배송지</p>
                      <p className="text-sm leading-7 text-[#f0f3f6] break-all">{order.customerAddress || '-'}</p>
                    </div>

                    <div className="rounded-[8px] border border-[#bcc5d0] bg-[#0d1015] p-4 shadow-[inset_0_0_0_1px_rgba(232,237,243,0.06)]">
                      <p className="text-[11px] uppercase tracking-[0.18em] text-[#c7ced8] mb-2">배송 메모</p>
                      <p className="text-sm leading-7 text-[#d8dde4] break-all">{order.shippingNote || '-'}</p>
                    </div>

                    {order.paymentMethod === 'bank_transfer' ? (
                      <div className="rounded-[8px] border border-[#bcc5d0] bg-[linear-gradient(180deg,#15181c_0%,#101215_100%)] p-4 shadow-[inset_0_0_0_1px_rgba(232,237,243,0.06)]">
                        <p className="mb-2 text-[11px] uppercase tracking-[0.18em] text-[#d7dde5]">계좌이체 안내</p>
                        <p className="break-all text-lg font-semibold text-white">
                          {order.bankName || '카카오뱅크'} {order.bankAccountNumber || '3333-09-2834969'}
                        </p>
                        <p className="mt-2 text-sm text-[#d7dde4]">예금주: {DEFAULT_BANK_ACCOUNT_HOLDER}</p>
                        <p className="mt-3 text-sm leading-7 text-[#ccd2da]">
                          입금자명은 수령인 이름과 동일하게 입력해 주세요.
                        </p>
                      </div>
                    ) : null}

                    {cancelState.visible ? (
                      <div className="rounded-[8px] border border-[#bcc5d0] bg-[linear-gradient(180deg,#15181c_0%,#101215_100%)] p-4 shadow-[inset_0_0_0_1px_rgba(232,237,243,0.06)]">
                        <p className="text-[11px] uppercase tracking-[0.18em] text-[#d7dde5]">
                          {cancelState.title}
                        </p>
                        <p className="mt-3 text-sm leading-7 text-[#ccd2da]">
                          {cancelState.description}
                        </p>
                      </div>
                    ) : null}

                    {order.paymentReceiptUrl ? (
                      <div className="rounded-[8px] border border-[#bcc5d0] bg-[linear-gradient(180deg,#15181c_0%,#101215_100%)] p-4 shadow-[inset_0_0_0_1px_rgba(232,237,243,0.06)]">
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <p className="text-[11px] uppercase tracking-[0.18em] text-[#d7dde5]">
                            이체확인 사진
                          </p>
                          <a
                            href={order.paymentReceiptUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[11px] uppercase tracking-[0.18em] text-[#e8edf5] hover:text-white"
                          >
                            새 탭에서 보기
                          </a>
                        </div>
                        <div className="relative aspect-[4/5] overflow-hidden rounded-[8px] border border-[#bcc5d0] bg-black">
                          <img
                            src={order.paymentReceiptUrl}
                            alt="이체확인 사진"
                            className="h-full w-full object-contain bg-black"
                          />
                        </div>
                      </div>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    ),
    saved: (
      <div className="space-y-3">
        <div className="border border-[#333] bg-[#111] p-4">
          <p className="text-[10px] uppercase tracking-widest text-[#00ffd1] mb-2">저장 보드</p>
          <p className="text-xs text-[#d0d0d0]">
            찜한 의류/컬렉션 게시물 썸네일을 그리드로 배치할 공간입니다.
          </p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="border border-[#333] bg-[#0d0d0d] aspect-[4/5] p-3 flex items-end">
              <p className="text-[10px] text-[#9a9a9a] uppercase tracking-widest">빈 슬롯</p>
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
              <p className="text-[10px] text-[#9b9b9b] uppercase">수량</p>
              <p className="text-lg text-[#e5e5e5]">{cart.length}</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          <div className="border border-[#333] bg-[#111] p-4">
            <p className="text-[#9b9b9b] mb-1">상품합계</p>
            <p className="text-[#e5e5e5]">{cartSubtotal.toLocaleString('ko-KR')}원</p>
          </div>
          <div className="border border-[#333] bg-[#111] p-4">
            <p className="text-[#9b9b9b] mb-1">결제 창</p>
            <p className="text-[#00ffd1]">헤더 장바구니 패널 사용</p>
          </div>
        </div>

        {cart.length > 0 ? (
          <div className="space-y-2">
            {cart.map((item) => (
              <div key={`${item.id}-${item.selectedSize ?? ''}`} className="border border-[#333] bg-[#0f0f0f] p-3 flex items-center gap-3">
                <div className="w-12 aspect-[4/5] border border-[#333] bg-black overflow-hidden shrink-0 relative">
                  <Image
                    src={item.image}
                    alt=""
                    fill
                    unoptimized={shouldBypassImageOptimization(item.image)}
                    sizes="48px"
                    className="object-contain bg-black"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-[#e5e5e5] truncate">{item.name}</p>
                  <p className="text-[10px] text-[#9b9b9b] mt-1">
                    {item.category || '항목'} {item.selectedSize ? `// 사이즈 ${item.selectedSize}` : ''}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-[#9b9b9b]">×{item.quantity || 1}</p>
                  <p className="text-xs text-[#00ffd1]">{item.price.toLocaleString('ko-KR')}원</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="border border-dashed border-[#333] bg-[#0a0a0a] p-4 text-xs text-[#9b9b9b]">
            장바구니가 비어 있습니다.
          </div>
        )}
      </div>
    ),
    profile: (
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          <div className="rounded-[14px] border border-white/15 bg-[#121212] p-4">
            <p className="text-[#8a8a8a] mb-1">이름</p>
            <p className="text-[#f5f5f5] text-sm">{userDisplayName}</p>
          </div>
          <div className="rounded-[14px] border border-white/15 bg-[#121212] p-4">
            <p className="text-[#8a8a8a] mb-1">이메일</p>
            <p className="text-[#f5f5f5] text-sm break-all">{user.email}</p>
          </div>
          <div className="rounded-[14px] border border-white/15 bg-[#121212] p-4">
            <p className="text-[#8a8a8a] mb-1">로그인 수단</p>
            <p className="text-[#f5f5f5] text-sm">{profile?.provider === 'google' ? 'Google' : 'Email'}</p>
          </div>
          <div className="rounded-[14px] border border-white/15 bg-[#121212] p-4">
            <p className="text-[#8a8a8a] mb-1">가입일</p>
            <p className="text-[#f5f5f5] text-sm">{formatDate(profile?.created_at || user.created_at)}</p>
          </div>
        </div>
        <div className="rounded-[14px] border border-white/10 bg-[#101010] p-4">
          {(accountProfileMessage || accountProfileError) && (
            <div
              className={`mt-3 border px-3 py-2 text-xs ${
                accountProfileError
                  ? 'border-red-700 bg-red-950/20 text-red-300'
                  : 'border-[#00ffd1]/30 bg-[#00ffd1]/5 text-[#bafff0]'
              }`}
            >
              {accountProfileError || accountProfileMessage}
            </div>
          )}

          <div className={`${accountProfileMessage || accountProfileError ? 'mt-4' : ''} grid gap-3 md:grid-cols-2`}>
            <label className="block rounded-[8px] border border-[#bcc5d0] bg-[#0d1015] p-3 shadow-[inset_0_0_0_1px_rgba(232,237,243,0.06)]">
              <span className="mb-2 flex items-center justify-between gap-3">
                <span className="text-[11px] text-[#8a8a8a]">핸드폰번호</span>
                <button
                  type="button"
                  onClick={() => void handleSaveAccountField('phone')}
                  disabled={isBusy || savingAccountField === 'phone'}
                  className="rounded-[6px] border border-[#2c5b53] bg-[#0a1715] px-3 py-2 text-[10px] uppercase tracking-[0.18em] text-[#bafff0] transition-colors hover:border-[#00ffd1] hover:text-[#00ffd1] disabled:opacity-50"
                >
                  {savingAccountField === 'phone' ? '수정중...' : '수정'}
                </button>
              </span>
              <input
                type="tel"
                value={accountPhone}
                onChange={(event) => setAccountPhone(event.target.value)}
                placeholder="010-0000-0000"
                className="w-full rounded-[4px] border border-[#949eab] bg-[#090b0f] px-3 py-3 text-sm text-[#e5e5e5] outline-none transition-colors focus:border-[#00ffd1]"
              />
            </label>
            <label className="block rounded-[8px] border border-[#bcc5d0] bg-[#0d1015] p-3 shadow-[inset_0_0_0_1px_rgba(232,237,243,0.06)] md:col-span-2">
              <span className="mb-2 flex items-center justify-between gap-3">
                <span className="text-[11px] text-[#8a8a8a]">주소</span>
                <button
                  type="button"
                  onClick={() => void handleSaveAccountField('address')}
                  disabled={isBusy || savingAccountField === 'address'}
                  className="rounded-[6px] border border-[#2c5b53] bg-[#0a1715] px-3 py-2 text-[10px] uppercase tracking-[0.18em] text-[#bafff0] transition-colors hover:border-[#00ffd1] hover:text-[#00ffd1] disabled:opacity-50"
                >
                  {savingAccountField === 'address' ? '수정중...' : '수정'}
                </button>
              </span>
              <textarea
                value={accountAddress}
                onChange={(event) => setAccountAddress(event.target.value)}
                rows={3}
                placeholder="주소를 입력하세요"
                className="w-full resize-y rounded-[4px] border border-[#949eab] bg-[#090b0f] px-3 py-3 text-sm text-[#e5e5e5] outline-none transition-colors focus:border-[#00ffd1]"
              />
            </label>
          </div>
        </div>
        <div className="rounded-[14px] border border-white/10 bg-[#101010] p-4">
          <p className="text-[11px] tracking-wide text-[#9a9a9a]">
            장바구니 {cart.length}개 / 합계 {cartSubtotal.toLocaleString('ko-KR')}원
          </p>
        </div>
      </div>
    ),

    dailyStats: (
      <div className="space-y-4">
        {!isDesignatedAdminUser ? (
          <div className="border border-[#333] bg-[#111] p-4 text-xs text-[#c6c6c6]">
            관리자 계정에서만 접근 가능한 탭입니다.
          </div>
        ) : (
          <>
            <div className="border border-[#00ffd1]/40 bg-[#00ffd1]/5 p-4">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-[#00ffd1]">일일 데이터</p>
                  <p className="text-xs text-[#9a9a9a] mt-2">
                    오늘(KST) 값과 최근 7일 누적 값을 구분해서 확인할 수 있습니다.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void loadDailyStats()}
                  disabled={isLoadingDailyStats}
                  className="px-3 py-2 border border-[#333] bg-[#111] text-xs uppercase tracking-widest hover:border-[#00ffd1] hover:text-[#00ffd1] transition-colors disabled:opacity-50"
                >
                  {isLoadingDailyStats ? '새로고침 중...' : '데이터 새로고침'}
                </button>
              </div>
            </div>

            {(dailyStatsMessage || dailyStatsError) && (
              <div
                className={`border p-3 text-xs ${
                  dailyStatsError
                    ? 'border-red-700 bg-red-950/20 text-red-300'
                    : 'border-[#00ffd1]/40 bg-[#00ffd1]/5 text-[#bafff0]'
                }`}
              >
                {dailyStatsError || dailyStatsMessage}
              </div>
            )}

            {dailyStatsSummary && (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
                <div className="border border-[#333] bg-[#111] p-3">
                  <p className="text-[#9b9b9b]">오늘 방문자 (KST)</p>
                  <p className="text-[#00ffd1] mt-1 font-semibold">
                    {(latestDailyStats?.visitorCount || 0).toLocaleString('ko-KR')}명
                  </p>
                </div>
                <div className="border border-[#333] bg-[#111] p-3">
                  <p className="text-[#9b9b9b]">오늘 페이지 hit (KST)</p>
                  <p className="text-[#00ffd1] mt-1 font-semibold">
                    {(latestDailyStats?.pageHitCount || 0).toLocaleString('ko-KR')}회
                  </p>
                </div>
                <div className="border border-[#333] bg-[#111] p-3">
                  <p className="text-[#9b9b9b]">최근 {dailyStatsRangeLabel} 누적 방문자</p>
                  <p className="text-[#00ffd1] mt-1 font-semibold">
                    {dailyStatsSummary.totalVisitors.toLocaleString('ko-KR')}명
                  </p>
                </div>
                <div className="border border-[#333] bg-[#111] p-3">
                  <p className="text-[#9b9b9b]">최근 {dailyStatsRangeLabel} 누적 페이지 hit</p>
                  <p className="text-[#00ffd1] mt-1 font-semibold">
                    {dailyStatsSummary.totalPageHits.toLocaleString('ko-KR')}회
                  </p>
                </div>
                <div className="border border-[#333] bg-[#111] p-3">
                  <p className="text-[#9b9b9b]">최근 {dailyStatsRangeLabel} 생성 채팅방</p>
                  <p className="text-[#00ffd1] mt-1 font-semibold">
                    {dailyStatsSummary.totalCreatedRooms.toLocaleString('ko-KR')}개
                  </p>
                </div>
                <div className="border border-[#333] bg-[#111] p-3">
                  <p className="text-[#9b9b9b]">최근 {dailyStatsRangeLabel} 누적 메시지</p>
                  <p className="text-[#00ffd1] mt-1 font-semibold">
                    {dailyStatsSummary.totalMessages.toLocaleString('ko-KR')}개
                  </p>
                </div>
              </div>
            )}

            {isLoadingDailyStats && dailyStatsRows.length === 0 ? (
              <div className="border border-[#333] bg-[#111] p-4 text-xs text-[#c6c6c6]">
                일일 데이터를 불러오는 중입니다...
              </div>
            ) : dailyStatsRows.length === 0 ? (
              <div className="border border-dashed border-[#333] bg-[#0a0a0a] p-4 text-xs text-[#9b9b9b]">
                표시할 일일 데이터가 없습니다.
              </div>
            ) : (
              <div className="space-y-4">
                <div className="overflow-x-auto border border-[#333] bg-[#101010]">
                  <table className="w-full min-w-[760px] text-xs">
                    <thead className="bg-black/60 text-[#8a8a8a]">
                      <tr>
                        <th className="text-left px-3 py-2 font-medium">날짜(KST)</th>
                        <th className="text-right px-3 py-2 font-medium">방문자</th>
                        <th className="text-right px-3 py-2 font-medium">페이지 hit</th>
                        <th className="text-right px-3 py-2 font-medium">생성 채팅방</th>
                        <th className="text-right px-3 py-2 font-medium">메시지</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dailyStatsRows.map((row) => (
                        <tr key={row.dateKst} className="border-t border-[#252525]">
                        <td className="px-3 py-2 text-[#d8d8d8]">{row.dateKst}</td>
                        <td className="px-3 py-2 text-right text-[#c8c8c8]">{row.visitorCount.toLocaleString('ko-KR')}</td>
                        <td className="px-3 py-2 text-right text-[#c8c8c8]">{row.pageHitCount.toLocaleString('ko-KR')}</td>
                        <td className="px-3 py-2 text-right text-[#c8c8c8]">{row.createdRoomCount.toLocaleString('ko-KR')}</td>
                        <td className="px-3 py-2 text-right text-[#00ffd1]">{row.messageCount.toLocaleString('ko-KR')}</td>
                      </tr>
                    ))}
                  </tbody>
                  </table>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <VisitSourceDonutCard
                    title="오늘 유입 비중"
                    subtitle="오늘 기준 인스타 / 유튜브 / 쓰레드 / 트위터 / 그 외"
                    breakdown={latestDailyStats?.sourceVisitors || EMPTY_VISIT_SOURCE_BREAKDOWN}
                  />
                  <VisitSourceDonutCard
                    title={`최근 ${dailyStatsRangeLabel} 유입 비중`}
                    subtitle="누적 유입 비중"
                    breakdown={dailyStatsSummary?.totalSourceVisitors || EMPTY_VISIT_SOURCE_BREAKDOWN}
                  />
                </div>
              </div>
            )}
          </>
        )}
      </div>
    ),
    adminOrders: (
      <div className="space-y-4">
        {!isPrimaryAdmin ? (
          <div className="border border-[#333] bg-[#111] p-4 text-xs text-[#c6c6c6]">
            관리자 계정에서만 접근 가능한 탭입니다.
          </div>
        ) : (
          <>
            <div className="rounded-[8px] border-2 border-[#e4e8ef] bg-[linear-gradient(180deg,#181a1d_0%,#111214_100%)] p-6 shadow-[0_0_0_1px_rgba(244,247,251,0.24)]">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.24em] text-[#00ffd1]">주문 관리</p>
                </div>
                <button
                  type="button"
                  onClick={() => void loadAdminOrders()}
                  disabled={isLoadingAdminOrders}
                  className="rounded-[6px] border-2 border-[#dbe1ea] bg-[#15181c] px-4 py-3 text-sm font-medium text-[#eef2f7] hover:border-[#ffffff] transition-colors disabled:opacity-50"
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
              <div className="border border-[#333] bg-[#111] p-4 text-xs text-[#c6c6c6]">
                주문 목록을 불러오는 중입니다...
              </div>
            ) : adminOrders.length === 0 ? (
              <div className="border border-dashed border-[#333] bg-[#0a0a0a] p-4 text-xs text-[#9b9b9b]">
                저장된 주문이 없습니다. 결제 완료 후 목록이 표시됩니다.
              </div>
            ) : (
              <div className="space-y-6">
                <div className="rounded-[8px] border-2 border-[#e2e7ef] bg-[linear-gradient(180deg,#171a1e_0%,#101114_100%)] p-3 shadow-[0_0_0_1px_rgba(244,247,251,0.18)]">
                  <div className="grid gap-3 md:grid-cols-3">
                    <button
                      type="button"
                      onClick={() => setAdminOrderView('new')}
                      className={`rounded-[8px] border-2 px-4 py-4 text-left transition-colors ${
                        adminOrderView === 'new'
                          ? 'border-[#00ffd1] bg-[#00ffd1]/10 text-white shadow-[0_0_0_1px_rgba(0,255,209,0.2)]'
                          : 'border-[#d5dbe4] bg-[#121418] text-[#d9e0e8] hover:border-[#eef2f7]'
                      }`}
                    >
                      <p className="text-[11px] uppercase tracking-[0.22em]">신규 주문</p>
                      <p className="mt-3 text-2xl font-semibold">{adminOrderViewCounts.new}</p>
                      <p className="mt-2 text-sm leading-6 text-[#c3cad3]">택배를 아직 보내지 않은 주문</p>
                    </button>
                    <button
                      type="button"
                      onClick={() => setAdminOrderView('shipping')}
                      className={`rounded-[8px] border-2 px-4 py-4 text-left transition-colors ${
                        adminOrderView === 'shipping'
                          ? 'border-[#00ffd1] bg-[#00ffd1]/10 text-white shadow-[0_0_0_1px_rgba(0,255,209,0.2)]'
                          : 'border-[#d5dbe4] bg-[#121418] text-[#d9e0e8] hover:border-[#eef2f7]'
                      }`}
                    >
                      <p className="text-[11px] uppercase tracking-[0.22em]">배송 주문</p>
                      <p className="mt-3 text-2xl font-semibold">{adminOrderViewCounts.shipping}</p>
                      <p className="mt-2 text-sm leading-6 text-[#c3cad3]">배송중 / 배송완료 주문</p>
                    </button>
                    <button
                      type="button"
                      onClick={() => setAdminOrderView('cancelled')}
                      className={`rounded-[8px] border-2 px-4 py-4 text-left transition-colors ${
                        adminOrderView === 'cancelled'
                          ? 'border-[#00ffd1] bg-[#00ffd1]/10 text-white shadow-[0_0_0_1px_rgba(0,255,209,0.2)]'
                          : 'border-[#d5dbe4] bg-[#121418] text-[#d9e0e8] hover:border-[#eef2f7]'
                      }`}
                    >
                      <p className="text-[11px] uppercase tracking-[0.22em]">취소 주문</p>
                      <p className="mt-3 text-2xl font-semibold">{adminOrderViewCounts.cancelled}</p>
                      <p className="mt-2 text-sm leading-6 text-[#c3cad3]">환불진행중 / 취소완료 주문</p>
                    </button>
                  </div>
                </div>

                <div className="space-y-7">
                  {filteredAdminOrders.length === 0 ? (
                    <div className="rounded-[8px] border-2 border-dashed border-[#d5dbe4] bg-[#0d0f12] px-5 py-10 text-center text-sm leading-7 text-[#aeb7c2]">
                      {adminOrderView === 'new'
                        ? '신규 주문 탭에 표시할 택배 미발송 주문이 없습니다.'
                        : adminOrderView === 'shipping'
                          ? '배송 주문 탭에 표시할 배송중 / 배송완료 주문이 없습니다.'
                          : '취소 주문 탭에 표시할 환불진행중 / 취소완료 주문이 없습니다.'}
                    </div>
                  ) : (
                    <div className="grid gap-7 xl:grid-cols-2">
                      {filteredAdminOrders.map((order) => {
                    const draft = adminOrderDrafts[order.id] || createAdminOrderDraft(order);
                    const visibleShippingCompany =
                      draft.shippingCompany || order.shippingCompany || DEFAULT_SHIPPING_COMPANY;
                    const isCancelling = cancellingAdminOrderId === order.id;
                    const cancelState = getAdminOrderCancelState(order);
                    const selectedPaymentStatus = getEditablePaymentStatusValue(
                      order.paymentMethod,
                      draft.paymentStatus || order.paymentStatus,
                    );
                    const paymentStatusOptions = getPaymentStatusSelectOptions(
                      order.paymentMethod,
                      selectedPaymentStatus,
                    );
                    const saveButtonLabel =
                      order.paymentMethod === 'bank_transfer' && selectedPaymentStatus === 'cancelled'
                        ? '환불완료 저장'
                        : order.paymentMethod === 'bank_transfer' && selectedPaymentStatus === 'refund_pending'
                          ? '환불진행 저장'
                          : '배송정보 저장';

                        return (
                          <article
                            key={order.id}
                            className="overflow-hidden rounded-[8px] border-2 border-[#edf1f6] bg-[linear-gradient(180deg,#17191c_0%,#0e0f11_100%)] shadow-[0_0_0_1px_rgba(244,247,251,0.22)]"
                          >
                        <div className="border-b-2 border-[#d7dde7] bg-[linear-gradient(135deg,#1d2025_0%,#14161a_55%,#101113_100%)] px-6 py-5">
                          <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
                            <div className="min-w-0">
                              <p className="text-[11px] uppercase tracking-[0.24em] text-[#dde3ec]">
                                Shipping Console
                              </p>
                              <h3 className="mt-3 break-all text-lg font-semibold text-white md:text-2xl">
                                {order.orderCode || order.guestOrderNumber || order.id}
                              </h3>
                              <div className="mt-4 flex flex-wrap gap-3 text-[11px] uppercase tracking-[0.16em]">
                                <span className="rounded-[6px] border-2 border-[#eef2f7] bg-[#d8dde5]/10 px-3 py-1.5 text-[#f4f7fb]">
                                  {getPaymentStatusLabel(order.paymentMethod, order.paymentStatus)}
                                </span>
                                <span className="rounded-[6px] border-2 border-[#d7dde7] bg-black/25 px-3 py-1.5 text-[#e0e5ec]">
                                  {getPaymentMethodLabel(order.paymentMethod)}
                                </span>
                                <span className="rounded-[6px] border-2 border-[#d7dde7] bg-black/25 px-3 py-1.5 text-[#e0e5ec]">
                                  {getShippingStatusLabel(order.shippingStatus)}
                                </span>
                              </div>
                              <p className="mt-5 text-sm leading-7 text-[#d2d8e0]">
                                {order.customerName || '주문자 미입력'} / {order.customerPhone || '-'} /{' '}
                                {order.customerEmail || '-'}
                              </p>
                              {order.guestOrderNumber ? (
                                <p className="mt-2 text-sm text-[#8fe7d9] break-all">
                                  비회원 조회번호: {order.guestOrderNumber}
                                </p>
                              ) : null}
                            </div>

                            <div className="grid grid-cols-2 gap-3 xl:w-[340px]">
                              <div className="rounded-[10px] border-2 border-[#d3dae3] bg-black/35 p-4">
                                <p className="text-[11px] uppercase tracking-[0.18em] text-[#d3dae3]">생성일</p>
                                <p className="mt-3 text-sm leading-6 text-white">{formatDate(order.createdAt || undefined)}</p>
                              </div>
                              <div className="rounded-[10px] border-2 border-[#d3dae3] bg-black/35 p-4">
                                <p className="text-[11px] uppercase tracking-[0.18em] text-[#d3dae3]">최근 수정</p>
                                <p className="mt-3 text-sm leading-6 text-white">{formatDateTime(order.updatedAt)}</p>
                              </div>
                              <div className="rounded-[10px] border-2 border-[#d3dae3] bg-black/35 p-4">
                                <p className="text-[11px] uppercase tracking-[0.18em] text-[#d3dae3]">주문 금액</p>
                                <p className="mt-3 text-base font-semibold leading-6 text-[#00ffd1]">{formatKrw(order.amountTotal)}</p>
                              </div>
                              <div className="rounded-[10px] border-2 border-[#d3dae3] bg-black/35 p-4">
                                <p className="text-[11px] uppercase tracking-[0.18em] text-[#d3dae3]">상품 수량</p>
                                <p className="mt-3 text-base font-semibold leading-6 text-white">
                                  {Array.isArray(order.items) ? order.items.length : 0}개
                                </p>
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="grid gap-6 p-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
                          <div className="space-y-5">
                            <div className="grid gap-5 md:grid-cols-2">
                              <section className="rounded-[10px] border-2 border-[#d3dae3] bg-[#0f1114] p-5 shadow-[inset_0_0_0_1px_rgba(244,247,251,0.05)]">
                                <p className="text-[11px] uppercase tracking-[0.18em] text-[#dbe1ea]">고객 정보</p>
                                <div className="mt-5 space-y-4 text-sm">
                                  <div>
                                    <p className="text-[#9ea8b4]">이름</p>
                                    <p className="mt-2 text-base leading-7 text-white">{order.customerName || '-'}</p>
                                  </div>
                                  <div>
                                    <p className="text-[#9ea8b4]">이메일</p>
                                    <p className="mt-2 break-all text-base leading-7 text-white">{order.customerEmail || '-'}</p>
                                  </div>
                                  <div>
                                    <p className="text-[#9ea8b4]">연락처 / 국가</p>
                                    <p className="mt-2 text-base leading-7 text-white">
                                      {order.customerPhone || '-'} / {order.customerCountry || '-'}
                                    </p>
                                  </div>
                                </div>
                              </section>

                              <section className="rounded-[10px] border-2 border-[#d3dae3] bg-[#0f1114] p-5 shadow-[inset_0_0_0_1px_rgba(244,247,251,0.05)]">
                                <p className="text-[11px] uppercase tracking-[0.18em] text-[#dbe1ea]">결제 요약</p>
                                <div className="mt-5 grid grid-cols-2 gap-4 text-sm">
                                  <div className="rounded-[10px] border-2 border-[#cfd6df] bg-black/30 p-4">
                                    <p className="text-[#9ea8b4]">상품금액</p>
                                    <p className="mt-2 text-base leading-6 text-white">{formatKrw(order.amountSubtotal)}</p>
                                  </div>
                                  <div className="rounded-[10px] border-2 border-[#cfd6df] bg-black/30 p-4">
                                    <p className="text-[#9ea8b4]">배송비</p>
                                    <p className="mt-2 text-base leading-6 text-white">{formatKrw(order.amountShipping)}</p>
                                  </div>
                                  <div className="rounded-[10px] border-2 border-[#cfd6df] bg-black/30 p-4">
                                    <p className="text-[#9ea8b4]">결제수단</p>
                                    <p className="mt-2 text-base leading-6 text-white">{getPaymentMethodLabel(order.paymentMethod)}</p>
                                  </div>
                                  <div className="rounded-[10px] border-2 border-[#cfd6df] bg-black/30 p-4">
                                    <p className="text-[#9ea8b4]">결제상태</p>
                                    <p className="mt-2 text-base leading-6 text-white">
                                      {getPaymentStatusLabel(order.paymentMethod, order.paymentStatus)}
                                    </p>
                                  </div>
                                </div>
                              </section>
                            </div>

                            <section className="rounded-[10px] border-2 border-[#d3dae3] bg-[#0f1114] p-5 shadow-[inset_0_0_0_1px_rgba(244,247,251,0.05)]">
                              <p className="text-[11px] uppercase tracking-[0.18em] text-[#dbe1ea]">배송지</p>
                              <p className="mt-4 whitespace-pre-line break-words text-base leading-8 text-[#e7e7e7]">
                                {order.customerAddress || '-'}
                              </p>
                            </section>

                            {order.paymentReceiptUrl ? (
                              <section className="rounded-[10px] border-2 border-[#d3dae3] bg-[#101215] p-5 shadow-[inset_0_0_0_1px_rgba(244,247,251,0.05)]">
                                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                  <p className="text-[11px] uppercase tracking-[0.18em] text-[#dbe1ea]">
                                    이체확인 사진
                                  </p>
                                  <a
                                    href={order.paymentReceiptUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-sm text-[#bafff0] hover:text-[#00ffd1]"
                                  >
                                    새 탭에서 보기
                                  </a>
                                </div>
                                <div className="relative mt-5 aspect-[4/5] overflow-hidden rounded-[10px] border-2 border-[#cfd6df] bg-black">
                                  <img
                                    src={order.paymentReceiptUrl}
                                    alt="이체확인 사진"
                                    className="h-full w-full object-contain bg-black"
                                  />
                                </div>
                              </section>
                            ) : null}

                            {Array.isArray(order.items) && order.items.length > 0 ? (
                              <section className="rounded-[10px] border-2 border-[#d3dae3] bg-[#0f1114] p-5 shadow-[inset_0_0_0_1px_rgba(244,247,251,0.05)]">
                                <p className="text-[11px] uppercase tracking-[0.18em] text-[#dbe1ea]">
                                  주문 상품 목록
                                </p>
                                <div className="mt-5 space-y-3">
                                  {order.items.map((item, index) => (
                                    <div
                                      key={`${order.id}-${item.id}-${index}`}
                                      className="rounded-[10px] border-2 border-[#cfd6df] bg-[#111316] px-4 py-4"
                                    >
                                      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                                        <p className="break-words text-sm leading-7 text-[#f3f3f3]">
                                          {item.name} ({item.category || '-'})
                                          {item.selectedSize ? ` / 사이즈 ${item.selectedSize}` : ''}
                                        </p>
                                        <p className="shrink-0 text-sm font-medium text-[#00ffd1]">
                                          ×{item.quantity || 1} / {formatKrw(item.lineTotal)}
                                        </p>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </section>
                            ) : null}
                          </div>

                          <div className="space-y-5">
                            <section className="rounded-[10px] border-2 border-[#d3dae3] bg-[#101215] p-5 shadow-[inset_0_0_0_1px_rgba(244,247,251,0.05)]">
                              <div className="flex items-center justify-between gap-3">
                                <p className="text-[11px] uppercase tracking-[0.18em] text-[#00ffd1]">배송정보 편집</p>
                                <span className="text-sm text-[#8ba49d]">
                                  {getShippingStatusLabel(draft.shippingStatus)}
                                </span>
                              </div>

                              <p className="mt-3 text-sm text-[#d0d8e1]">
                                기본 택배사: {visibleShippingCompany}
                              </p>

                              <div className="mt-5 space-y-5">
                                <div className="grid gap-5 md:grid-cols-2">
                                  <div>
                                    <label className="mb-3 block text-sm text-[#b5beca]">결제 상태</label>
                                    <select
                                      value={selectedPaymentStatus}
                                      onChange={(event) =>
                                        updateAdminOrderDraft(order.id, 'paymentStatus', event.target.value)
                                      }
                                      className="w-full rounded-[8px] border-2 border-[#cfd6df] bg-[#050505] px-4 py-3.5 text-sm text-[#f5f5f5] focus:border-[#00ffd1] focus:outline-none"
                                    >
                                      {paymentStatusOptions.map((option) => (
                                        <option key={`${order.id}-${option.value}`} value={option.value}>
                                          {option.label}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                  <div>
                                    <label className="mb-3 block text-sm text-[#b5beca]">배송 상태</label>
                                    <select
                                      value={draft.shippingStatus || 'preparing'}
                                      onChange={(event) =>
                                        updateAdminOrderDraft(order.id, 'shippingStatus', event.target.value)
                                      }
                                      className="w-full rounded-[8px] border-2 border-[#cfd6df] bg-[#050505] px-4 py-3.5 text-sm text-[#f5f5f5] focus:border-[#00ffd1] focus:outline-none"
                                    >
                                      <option value="preparing">배송준비중</option>
                                      <option value="shipping">배송중</option>
                                      <option value="delivered">배송완료</option>
                                    </select>
                                  </div>
                                  <div>
                                    <label className="mb-3 block text-sm text-[#b5beca]">택배사</label>
                                    <input
                                      type="text"
                                      value={draft.shippingCompany}
                                      onChange={(event) =>
                                        updateAdminOrderDraft(order.id, 'shippingCompany', event.target.value)
                                      }
                                      className="w-full rounded-[8px] border-2 border-[#cfd6df] bg-[#050505] px-4 py-3.5 text-sm text-[#f5f5f5] placeholder:text-[#6f6f6f] focus:border-[#00ffd1] focus:outline-none"
                                      placeholder={DEFAULT_SHIPPING_COMPANY}
                                    />
                                  </div>
                                  <div>
                                    <label className="mb-3 block text-sm text-[#b5beca]">운송장번호</label>
                                    <input
                                      type="text"
                                      value={draft.trackingNumber || ''}
                                      onChange={(event) =>
                                        updateAdminOrderDraft(order.id, 'trackingNumber', event.target.value)
                                      }
                                      className="w-full rounded-[8px] border-2 border-[#cfd6df] bg-[#050505] px-4 py-3.5 text-sm text-[#f5f5f5] placeholder:text-[#6f6f6f] focus:border-[#00ffd1] focus:outline-none"
                                      placeholder="운송장번호 입력"
                                    />
                                  </div>
                                </div>

                                <div>
                                  <label className="mb-3 block text-sm text-[#b5beca]">배송 메모</label>
                                  <textarea
                                    value={draft.shippingNote || ''}
                                    onChange={(event) =>
                                      updateAdminOrderDraft(order.id, 'shippingNote', event.target.value)
                                    }
                                    rows={4}
                                    className="w-full rounded-[8px] border-2 border-[#cfd6df] bg-[#050505] px-4 py-3.5 text-sm leading-7 text-[#f5f5f5] placeholder:text-[#6f6f6f] focus:border-[#00ffd1] focus:outline-none"
                                    placeholder="송장 분실, 보류 사유, 연락 필요 내용 등을 기록"
                                  />
                                </div>
                              </div>
                            </section>

                            <section className="rounded-[10px] border-2 border-[#d3dae3] bg-[#0f1114] p-5 shadow-[inset_0_0_0_1px_rgba(244,247,251,0.05)]">
                              <p className="text-[11px] uppercase tracking-[0.18em] text-[#dbe1ea]">배송 타임라인</p>
                              <div className="mt-5 grid gap-4 text-sm">
                                <div className="rounded-[10px] border-2 border-[#cfd6df] bg-black/30 p-4">
                                  <p className="text-[#9ea8b4]">발송일시</p>
                                  <p className="mt-2 text-base leading-7 text-white">{formatDateTime(order.shippedAt)}</p>
                                </div>
                                <div className="rounded-[10px] border-2 border-[#cfd6df] bg-black/30 p-4">
                                  <p className="text-[#9ea8b4]">배송완료일시</p>
                                  <p className="mt-2 text-base leading-7 text-white">{formatDateTime(order.deliveredAt)}</p>
                                </div>
                              </div>
                            </section>

                            <div className="grid gap-2 sm:grid-cols-2">
                              <button
                                type="button"
                                onClick={() => void handleSaveOrderShipping(order.id)}
                                disabled={isCancelling}
                                className="rounded-[12px] border border-[#00ffd1] px-4 py-3 text-sm font-medium text-[#00ffd1] transition-colors hover:bg-[#00ffd1] hover:text-black disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                {saveButtonLabel}
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleCancelAdminOrder(order)}
                                disabled={isCancelling || !cancelState.visible || !cancelState.enabled}
                                className="rounded-[12px] border border-red-700 px-4 py-3 text-sm font-medium text-red-300 transition-colors hover:bg-red-600 hover:text-white disabled:cursor-not-allowed disabled:border-[#3a3a3a] disabled:text-[#747474]"
                              >
                                {isCancelling
                                  ? '취소 처리중...'
                                  : cancelState.visible
                                    ? cancelState.label
                                    : '온라인 취소 미지원'}
                              </button>
                            </div>
                            {cancelState.visible ? (
                              <p className="text-xs leading-relaxed text-[#8ba49d]">
                                {cancelState.description}
                              </p>
                            ) : null}
                          </div>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    ),
    members: (
      <div className="space-y-4">
        {!isPrimaryAdmin ? (
          <div className="border border-[#333] bg-[#111] p-4 text-xs text-[#c6c6c6]">
            관리자 계정에서만 접근 가능한 탭입니다.
          </div>
        ) : (
          <>
            <div className="border border-[#00ffd1]/40 bg-[#00ffd1]/5 p-4">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-[#00ffd1]">회원 관리</p>
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
                onClick={() => openAdminComposer('products')}
                className="rounded-[8px] border-2 border-[#d7dce4] bg-[linear-gradient(180deg,#171a1e_0%,#121417_100%)] p-4 text-left text-sm text-[#eef2f8] shadow-[0_0_0_1px_rgba(236,240,245,0.16)] hover:border-[#eef2f7] hover:bg-[#1a1d22] transition-colors"
              >
                <p className="font-semibold">의류 게시물 편집 열기</p>
                <p className="mt-1 text-xs text-[#aeb5bf]">의류 게시글 작성/수정/삭제</p>
              </button>
              <button
                type="button"
                onClick={() => openAdminComposer('collections')}
                className="rounded-[8px] border-2 border-[#d7dce4] bg-[linear-gradient(180deg,#171a1e_0%,#121417_100%)] p-4 text-left text-sm text-[#eef2f8] shadow-[0_0_0_1px_rgba(236,240,245,0.16)] hover:border-[#eef2f7] hover:bg-[#1a1d22] transition-colors"
              >
                <p className="font-semibold">컬렉션 게시물 편집 열기</p>
                <p className="mt-1 text-xs text-[#aeb5bf]">컬렉션 게시글 작성/수정/삭제</p>
              </button>
            </div>

            {isLoadingMembers && members.length === 0 ? (
              <div className="border border-[#333] bg-[#111] p-4 text-xs text-[#c6c6c6]">
                회원 목록을 불러오는 중입니다...
              </div>
            ) : members.length === 0 ? (
              <div className="border border-dashed border-[#333] bg-[#0a0a0a] p-4 text-xs text-[#9b9b9b]">
                등록된 회원이 없습니다.
              </div>
            ) : (
              <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-3">
                {members.map((member, index) => {
                  const draft = memberDrafts[member.id] || createMemberDraft(member);
                  return (
                    <div
                      key={member.id}
                      className="flex h-full min-h-[540px] flex-col overflow-hidden rounded-[8px] border-2 border-[#d9dee6] bg-[linear-gradient(180deg,#16181c_0%,#101114_100%)] shadow-[0_0_0_1px_rgba(237,242,246,0.18)]"
                    >
                      <div className="border-b-2 border-[#b2bbc9] bg-[linear-gradient(135deg,#1d2025_0%,#14161a_55%,#101113_100%)] px-5 py-4">
                        <div className="mb-2 flex items-center justify-between gap-3 text-[11px] uppercase tracking-[0.24em] text-[#e0e5ec]">
                          <span>회원 {String(index + 1).padStart(2, '0')}</span>
                          <span className="text-[#aab1ba]">
                            생성일: {formatDate(member.createdAt || undefined)}
                          </span>
                        </div>
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="break-all text-base font-semibold text-[#f2f5f8]">{member.email || '-'}</p>
                            <div className="mt-3 grid grid-cols-1 gap-2 text-xs text-[#d6dce5]">
                              <p>
                                <span className="mr-2 text-[#8f99a6]">이름</span>
                                <span>{member.fullName || '-'}</span>
                              </p>
                              <p>
                                <span className="mr-2 text-[#8f99a6]">전화번호</span>
                                <span>{member.phone || '-'}</span>
                              </p>
                            </div>
                          </div>
                          {member.isPrimaryAdmin && (
                            <span className="rounded-[6px] border border-[#00ffd1]/50 bg-[#00ffd1]/10 px-3 py-1.5 text-[10px] uppercase tracking-widest text-[#00ffd1]">
                              주 관리자
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-1 flex-col gap-5 p-5">
                        <div className="grid grid-cols-1 gap-3 text-sm">
                          <label className="rounded-[6px] border border-[#bcc5d0] bg-[#0d1015] p-3 shadow-[inset_0_0_0_1px_rgba(232,237,243,0.06)]">
                            <span className="mb-2 block text-[11px] uppercase tracking-[0.18em] text-[#c9d1dc]">이름</span>
                            <input
                              type="text"
                              value={draft.fullName}
                              onChange={(event) =>
                                updateMemberDraft(member.id, 'fullName', event.target.value)
                              }
                              className="w-full rounded-[4px] border border-[#949eab] bg-[#090b0f] px-3 py-2.5 text-[#eef2f7] focus:border-[#00ffd1] focus:outline-none"
                              placeholder="이름"
                            />
                          </label>
                          <label className="rounded-[6px] border border-[#bcc5d0] bg-[#0d1015] p-3 shadow-[inset_0_0_0_1px_rgba(232,237,243,0.06)]">
                            <span className="mb-2 block text-[11px] uppercase tracking-[0.18em] text-[#c9d1dc]">전화번호</span>
                            <input
                              type="text"
                              value={draft.phone}
                              onChange={(event) =>
                                updateMemberDraft(member.id, 'phone', event.target.value)
                              }
                              className="w-full rounded-[4px] border border-[#949eab] bg-[#090b0f] px-3 py-2.5 text-[#eef2f7] focus:border-[#00ffd1] focus:outline-none"
                              placeholder="전화번호"
                            />
                          </label>
                          <label className="rounded-[6px] border border-[#bcc5d0] bg-[#0d1015] p-3 shadow-[inset_0_0_0_1px_rgba(232,237,243,0.06)]">
                            <span className="mb-2 block text-[11px] uppercase tracking-[0.18em] text-[#c9d1dc]">주소</span>
                            <input
                              type="text"
                              value={draft.address}
                              onChange={(event) =>
                                updateMemberDraft(member.id, 'address', event.target.value)
                              }
                              className="w-full rounded-[4px] border border-[#949eab] bg-[#090b0f] px-3 py-2.5 text-[#eef2f7] focus:border-[#00ffd1] focus:outline-none"
                              placeholder="주소"
                            />
                          </label>
                          <label className="rounded-[6px] border border-[#bcc5d0] bg-[#0d1015] p-3 shadow-[inset_0_0_0_1px_rgba(232,237,243,0.06)]">
                            <span className="mb-2 block text-[11px] uppercase tracking-[0.18em] text-[#c9d1dc]">이메일</span>
                            <input
                              type="email"
                              value={draft.email}
                              onChange={(event) =>
                                updateMemberDraft(member.id, 'email', event.target.value)
                              }
                              className="w-full rounded-[4px] border border-[#949eab] bg-[#090b0f] px-3 py-2.5 text-[#eef2f7] focus:border-[#00ffd1] focus:outline-none"
                              placeholder="이메일"
                            />
                          </label>
                          <label className="rounded-[6px] border border-[#bcc5d0] bg-[#0d1015] p-3 shadow-[inset_0_0_0_1px_rgba(232,237,243,0.06)]">
                            <span className="mb-2 block text-[11px] uppercase tracking-[0.18em] text-[#c9d1dc]">비밀번호</span>
                            <input
                              type="password"
                              value={draft.password}
                              onChange={(event) =>
                                updateMemberDraft(member.id, 'password', event.target.value)
                              }
                              className="w-full rounded-[4px] border border-[#949eab] bg-[#090b0f] px-3 py-2.5 text-[#eef2f7] focus:border-[#00ffd1] focus:outline-none"
                              placeholder="비밀번호 변경 시에만 입력"
                            />
                          </label>
                        </div>

                        <div className="mt-auto grid grid-cols-1 gap-3 border-t border-[#aab2be]/35 pt-4">
                          <button
                            type="button"
                            onClick={() => void handleSaveMember(member.id)}
                            disabled={isLoadingMembers}
                            className="rounded-[6px] border border-[#00ffd1] py-3 text-xs uppercase tracking-widest text-[#00ffd1] transition-colors hover:bg-[#00ffd1] hover:text-black disabled:opacity-50"
                          >
                            회원정보 저장
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDeleteMember(member.id)}
                            disabled={isLoadingMembers || member.isPrimaryAdmin}
                            className="rounded-[6px] border border-red-700 py-3 text-xs uppercase tracking-widest text-red-300 transition-colors hover:bg-red-600 hover:text-white disabled:opacity-50"
                          >
                            회원 삭제
                          </button>
                        </div>
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
    <div className="h-full min-h-0 overflow-hidden font-mono">
      {onBack && !adminComposer ? (
        <button
          type="button"
          onClick={onBack}
          className="fixed right-3 top-[calc(env(safe-area-inset-top)+12px)] z-[165] inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-black text-white shadow-[0_0_18px_rgba(0,0,0,0.45)] transition-colors hover:border-[#00ffd1] hover:text-[#00ffd1] md:hidden"
          aria-label="마이페이지 닫기"
        >
          ×
        </button>
      ) : null}

      <div className="mx-auto flex h-full min-h-0 w-full max-w-5xl flex-col overflow-hidden rounded-[18px] border border-white/10 bg-[#0d0d0d] p-3 md:p-4">
        <div className="rounded-[16px] border border-white/10 bg-[#121212] p-4 md:p-5">
          <div className="flex flex-col gap-4 text-center md:text-left">
            <div className="flex flex-col items-center gap-3 md:flex-row md:items-start md:justify-between">
              <div className="space-y-2">
                <p className="text-[11px] uppercase tracking-[0.28em] text-[#8e8e8e]">My Page</p>
                <div>
                  <h3 className="text-2xl font-semibold text-[#f5f5f5]">{userDisplayName}</h3>
                  <p className="mt-1 text-xs text-[#a5a5a5] break-all">{user.email}</p>
                </div>
                <p className="text-[11px] text-[#8a8a8a]">
                  장바구니 {cart.length}개 / {cartSubtotal.toLocaleString('ko-KR')}원
                </p>
              </div>

              <div className="grid w-full max-w-sm grid-cols-1 gap-2 sm:grid-cols-2 md:w-auto md:min-w-[240px]">
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
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-white/20 bg-[#1b1b1b] px-3 py-3 text-sm text-[#e6e6e6] hover:bg-[#262626] transition-colors"
                >
                  <ChevronLeft size={16} />
                  뒤로가기
                </button>
                <button
                  type="button"
                  onClick={() => void signOut()}
                  disabled={isBusy}
                  className="inline-flex items-center justify-center rounded-xl border border-red-500/50 bg-red-500/10 px-3 py-3 text-sm text-red-200 hover:bg-red-500/20 transition-colors disabled:opacity-50"
                >
                  {isBusy ? '처리중...' : '로그아웃'}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-5">
              {tabs.map((tab) => {
                const active = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex min-h-[84px] flex-col items-center justify-center gap-1.5 rounded-[14px] border px-4 py-4 text-center transition-all ${
                      active
                        ? 'border-[#00ffd1]/75 bg-[linear-gradient(180deg,rgba(0,255,209,0.2),rgba(0,255,209,0.05))] text-white shadow-[0_0_0_1px_rgba(0,255,209,0.22)]'
                        : 'border-[#6c727b] bg-[linear-gradient(180deg,#181a1d_0%,#111214_100%)] text-[#e6e6e6] hover:border-[#b8bec8] hover:bg-[#1b1d20]'
                    }`}
                  >
                    <span className="text-base font-semibold tracking-[-0.01em]">{tab.label}</span>
                    <span className={`text-xs ${active ? 'text-[#bafff1]' : 'text-[#9ea4ad]'}`}>
                      {typeof tab.count === 'number' ? `${tab.count}건` : '메뉴'}
                    </span>
                  </button>
                );
              })}
            </div>

            {isPrimaryAdmin && (
              <div className="rounded-[16px] border border-[#727884] bg-[linear-gradient(180deg,#17191c_0%,#101113_100%)] p-4 md:p-5 shadow-[0_0_0_1px_rgba(255,255,255,0.03)]">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-end">
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 md:min-w-[520px]">
                    <button
                      type="button"
                      onClick={() => openAdminComposer('products')}
                      className="rounded-[14px] border border-[#8a93a2] bg-[#15181c] px-4 py-3 text-center text-sm text-[#eef2f8] hover:border-[#c4cad3] hover:bg-[#1a1d22] transition-colors"
                    >
                      의류 게시물 목록
                    </button>
                    <button
                      type="button"
                      onClick={() => openAdminComposer('collections')}
                      className="rounded-[14px] border border-[#8a93a2] bg-[#15181c] px-4 py-3 text-center text-sm text-[#eef2f8] hover:border-[#c4cad3] hover:bg-[#1a1d22] transition-colors"
                    >
                      컬렉션 게시물 목록
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab('adminOrders')}
                      className="rounded-[14px] border border-[#8a93a2] bg-[#15181c] px-4 py-3 text-center text-sm text-[#eef2f8] hover:border-[#c4cad3] hover:bg-[#1a1d22] transition-colors"
                    >
                      배송관리 열기
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <section className="mt-4 min-h-0 flex flex-1 flex-col overflow-hidden rounded-[18px] border border-[#727884] bg-[linear-gradient(180deg,#121416_0%,#0b0c0e_100%)] p-4 md:p-6 shadow-[0_0_0_1px_rgba(255,255,255,0.03)]">
          <div className="mb-4 flex flex-col gap-2 rounded-[14px] border border-[#727884] bg-[linear-gradient(180deg,#1a1c20_0%,#121316_100%)] px-5 py-4 text-center md:flex-row md:items-center md:justify-between md:text-left">
            <div>
              <p className="text-lg font-semibold text-white">
                {tabs.find((tab) => tab.id === activeTab)?.label || '계정'}
              </p>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1">
            {tabContent[activeTab]}
          </div>
        </section>
      </div>

      {adminComposer && (
        <div className="fixed inset-0 z-[140] flex items-center justify-center p-2 md:p-4">
          <button
            type="button"
            onClick={() => setAdminComposer(null)}
            className="fixed right-3 top-[calc(env(safe-area-inset-top)+12px)] z-[180] inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-black text-white shadow-[0_0_18px_rgba(0,0,0,0.45)] transition-colors hover:border-[#00ffd1] hover:text-[#00ffd1] md:hidden"
            aria-label="관리자 페이지 닫기"
          >
            ×
          </button>

          <button
            type="button"
            aria-label="close admin composer"
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            onClick={() => setAdminComposer(null)}
          />

          <div className="relative h-[94vh] w-[98vw] overflow-hidden rounded-[16px] border border-white/15 bg-[#0d0d0d] shadow-[0_40px_120px_rgba(0,0,0,0.7)] md:h-[min(860px,90vh)] md:w-[min(1200px,95vw)] md:rounded-[18px]">
            <div className="h-16 border-b border-white/10 bg-[#131313] flex items-center justify-between px-2 md:px-4">
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
                  의류 게시물 목록
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
                  컬렉션 게시물 목록
                </button>
                <p className="hidden md:block text-[11px] text-[#8a8a8a] ml-2">
                  현재 보기: {adminComposer === 'products' ? '의류 게시물 목록' : '컬렉션 게시물 목록'}
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
