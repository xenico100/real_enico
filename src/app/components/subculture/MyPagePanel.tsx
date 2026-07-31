'use client';

import Image from 'next/image';
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { ChevronLeft } from 'lucide-react';
import { useAuth } from '@/app/context/AuthContext';
import { useFashionCart } from '@/app/context/FashionCartContext';
import { shouldBypassImageOptimization } from '@/lib/images';
import { AccountAuthPanel } from './AccountAuthPanel';
import styles from './MyPagePanel.module.css';

type MyPageTab =
  | 'overview'
  | 'orders'
  | 'saved'
  | 'cart'
  | 'profile'
  | 'dailyStats'
  | 'members'
  | 'inventory'
  | 'adminOrders';

type AdminComposerType = 'products' | 'collections' | 'inventory';
type AdminOrderView = 'new' | 'shipping' | 'cancelled';
type AdminCapabilities = {
  canManageCatalog: boolean;
  canManageMembers: boolean;
  canManageOrders: boolean;
  canViewDailyStats: boolean;
};
type AdminAccessState = {
  userId: string;
  status: 'idle' | 'loading' | 'resolved' | 'error';
  capabilities: AdminCapabilities;
  error: string | null;
};

const PRIMARY_ADMIN_EMAIL = 'morba9850@gmail.com';
const EMPTY_ADMIN_CAPABILITIES: AdminCapabilities = {
  canManageCatalog: false,
  canManageMembers: false,
  canManageOrders: false,
  canViewDailyStats: false,
};
const PRIMARY_ADMIN_CAPABILITIES: AdminCapabilities = {
  canManageCatalog: true,
  canManageMembers: true,
  canManageOrders: true,
  canViewDailyStats: true,
};
const MY_PAGE_TAB_LABELS: Record<MyPageTab, string> = {
  overview: '요약',
  profile: '계정',
  orders: '주문',
  cart: '장바구니',
  saved: '저장 게시물',
  dailyStats: '일일통계',
  members: '회원관리',
  inventory: '재고관리',
  adminOrders: '배송관리',
};
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
  { key: 'instagram', label: '인스타그램', color: '#b8001f' },
  { key: 'youtube', label: '유튜브', color: '#111827' },
  { key: 'threads', label: '쓰레드', color: '#4b5563' },
  { key: 'twitter', label: '트위터', color: '#d1d5db' },
  { key: 'other', label: '그 외', color: '#f8f9fa' },
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

function getAdminComposerHref(type: AdminComposerType, embedded = false) {
  const embeddedParam = embedded ? 'embedded=1&' : '';
  if (type === 'collections') return embedded ? '/admin/collections?embedded=1' : '/admin/collections';
  if (type === 'inventory') return `/admin?${embeddedParam}view=inventory`;
  return embedded ? '/admin?embedded=1' : '/admin';
}

function getAdminComposerLabel(type: AdminComposerType) {
  if (type === 'collections') return '컬렉션 게시물 목록';
  if (type === 'inventory') return '재고관리';
  return '의류 게시물 목록';
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

type VisitChartStyle = CSSProperties & {
  '--visit-chart-background': string;
};

function buildVisitSourceChartStyle(breakdown: VisitSourceBreakdown): VisitChartStyle {
  const total =
    breakdown.instagram +
    breakdown.youtube +
    breakdown.threads +
    breakdown.twitter +
    breakdown.other;

  if (total <= 0) {
    return {
      '--visit-chart-background': 'conic-gradient(#d1d5db 0deg 360deg)',
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
    '--visit-chart-background': `conic-gradient(${segments.join(', ')})`,
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
            className={`${styles.visitChart} h-full w-full rounded-full border border-[#d1d5db]`}
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
                    className={`${styles.legendSwatch} h-2.5 w-2.5 rounded-full`}
                    style={{ '--legend-swatch-color': color } as CSSProperties}
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

function normalizeInitialTab(initialTab: MyPageTab | undefined): MyPageTab {
  return !initialTab || initialTab === 'saved' ? 'overview' : initialTab;
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
  const tabIdPrefix = useId();
  const memberOrdersRequestIdRef = useRef(0);
  const memberOrdersAbortControllerRef = useRef<AbortController | null>(null);
  const memberOrderMutationIdRef = useRef(0);
  const [activeTab, setActiveTab] = useState<MyPageTab>(() => normalizeInitialTab(initialTab));
  const [adminAccess, setAdminAccess] = useState<AdminAccessState>({
    userId: '',
    status: 'idle',
    capabilities: EMPTY_ADMIN_CAPABILITIES,
    error: null,
  });
  const [adminAccessRetryKey, setAdminAccessRetryKey] = useState(0);
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
  const [memberOrdersUserId, setMemberOrdersUserId] = useState(user?.id || '');
  const [storedMemberOrders, setMemberOrders] = useState<MemberOrderRecord[]>([]);
  const [storedMemberOrdersLoaded, setMemberOrdersLoaded] = useState(false);
  const [storedIsLoadingMemberOrders, setIsLoadingMemberOrders] = useState(false);
  const [storedMemberOrderMessage, setMemberOrderMessage] = useState<string | null>(null);
  const [storedMemberOrderError, setMemberOrderError] = useState<string | null>(null);
  const [storedCancellingMemberOrderId, setCancellingMemberOrderId] = useState<string | null>(
    null,
  );
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
  const currentUserId = user?.id || '';
  const isMemberOrderStateCurrent = memberOrdersUserId === currentUserId;
  const memberOrders = isMemberOrderStateCurrent ? storedMemberOrders : [];
  const memberOrdersLoaded = isMemberOrderStateCurrent ? storedMemberOrdersLoaded : false;
  const isLoadingMemberOrders = isMemberOrderStateCurrent
    ? storedIsLoadingMemberOrders
    : false;
  const memberOrderMessage = isMemberOrderStateCurrent ? storedMemberOrderMessage : null;
  const memberOrderError = isMemberOrderStateCurrent ? storedMemberOrderError : null;
  const cancellingMemberOrderId = isMemberOrderStateCurrent
    ? storedCancellingMemberOrderId
    : null;
  const normalizedUserEmail = (user?.email || '').trim().toLowerCase();
  const isPrimaryAdmin = normalizedUserEmail === PRIMARY_ADMIN_EMAIL;
  const capabilities = isPrimaryAdmin
    ? PRIMARY_ADMIN_CAPABILITIES
    : adminAccess.userId === user?.id
      ? adminAccess.capabilities
      : EMPTY_ADMIN_CAPABILITIES;
  const {
    canManageCatalog,
    canManageMembers,
    canManageOrders,
    canViewDailyStats,
  } = capabilities;
  const isAdminAccessResolved =
    isPrimaryAdmin ||
    (adminAccess.userId === currentUserId &&
      (adminAccess.status === 'resolved' || adminAccess.status === 'error'));
  const adminAccessError =
    !isPrimaryAdmin &&
    adminAccess.userId === currentUserId &&
    adminAccess.status === 'error'
      ? adminAccess.error
      : null;

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
    setActiveTab(normalizeInitialTab(initialTab));
  }, [initialTab]);

  useEffect(() => {
    memberOrdersRequestIdRef.current += 1;
    memberOrderMutationIdRef.current += 1;
    memberOrdersAbortControllerRef.current?.abort();
    memberOrdersAbortControllerRef.current = null;

    setMemberOrdersUserId(currentUserId);
    setMemberOrders([]);
    setMemberOrdersLoaded(false);
    setIsLoadingMemberOrders(false);
    setMemberOrderMessage(null);
    setMemberOrderError(null);
    setCancellingMemberOrderId(null);

    return () => {
      memberOrdersRequestIdRef.current += 1;
      memberOrderMutationIdRef.current += 1;
      memberOrdersAbortControllerRef.current?.abort();
      memberOrdersAbortControllerRef.current = null;
    };
  }, [currentUserId]);

  useEffect(() => {
    const accessToken = session?.access_token || '';

    if (!currentUserId || !accessToken) {
      setAdminAccess({
        userId: currentUserId,
        status: 'resolved',
        capabilities: EMPTY_ADMIN_CAPABILITIES,
        error: null,
      });
      return;
    }

    if (isPrimaryAdmin) {
      setAdminAccess({
        userId: currentUserId,
        status: 'resolved',
        capabilities: PRIMARY_ADMIN_CAPABILITIES,
        error: null,
      });
      return;
    }

    const controller = new AbortController();
    setAdminAccess({
      userId: currentUserId,
      status: 'loading',
      capabilities: EMPTY_ADMIN_CAPABILITIES,
      error: null,
    });

    const loadAdminAccess = async () => {
      try {
        const response = await fetch('/api/admin/access', {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
          cache: 'no-store',
          signal: controller.signal,
        });
        const payload = (await response.json()) as Partial<AdminCapabilities> & {
          message?: string;
        };

        if (!response.ok) {
          throw new Error(payload.message || '관리자 권한 확인 실패');
        }

        setAdminAccess({
          userId: currentUserId,
          status: 'resolved',
          capabilities: {
            canManageCatalog: payload.canManageCatalog === true,
            canManageMembers: payload.canManageMembers === true,
            canManageOrders: payload.canManageOrders === true,
            canViewDailyStats: payload.canViewDailyStats === true,
          },
          error: null,
        });
      } catch (error) {
        if (controller.signal.aborted) return;
        setAdminAccess({
          userId: currentUserId,
          status: 'error',
          capabilities: EMPTY_ADMIN_CAPABILITIES,
          error: error instanceof Error ? error.message : '관리자 권한 확인 실패',
        });
      }
    };

    void loadAdminAccess();

    return () => {
      controller.abort();
    };
  }, [adminAccessRetryKey, currentUserId, isPrimaryAdmin, session?.access_token]);

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

  const tabs: { id: MyPageTab; label: string; count?: number; countSuffix?: string }[] = [
    { id: 'overview', label: '요약' },
    { id: 'profile', label: '계정' },
    { id: 'orders', label: '주문', count: memberOrders.length },
    { id: 'cart', label: '장바구니', count: cart.length, countSuffix: '개' },
  ];
  if (canManageMembers) {
    tabs.push({ id: 'members', label: '회원관리', count: members.length });
  }
  if (canManageOrders) {
    tabs.push({ id: 'adminOrders', label: '배송관리', count: adminOrders.length });
  }
  if (canManageCatalog) {
    tabs.push({ id: 'inventory', label: '재고관리' });
  }
  if (canViewDailyStats) {
    tabs.push({ id: 'dailyStats', label: '일일통계', count: dailyStatsRows.length });
  }
  const hasAdminTools =
    canManageCatalog || canManageMembers || canManageOrders || canViewDailyStats;
  const renderedActiveTab = tabs.some((tab) => tab.id === activeTab) ? activeTab : 'overview';
  const tabPanelId = `${tabIdPrefix}-panel`;

  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;

    event.preventDefault();
    let nextIndex = index;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = tabs.length - 1;
    if (event.key === 'ArrowLeft') nextIndex = (index - 1 + tabs.length) % tabs.length;
    if (event.key === 'ArrowRight') nextIndex = (index + 1) % tabs.length;

    const nextTab = tabs[nextIndex];
    setActiveTab(nextTab.id);
    requestAnimationFrame(() => {
      document.getElementById(`${tabIdPrefix}-tab-${nextTab.id}`)?.focus();
    });
  };

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
    if (!canManageCatalog) return;
    if (type === 'collections' && !isPrimaryAdmin) return;

    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      window.location.href = getAdminComposerHref(type);
      return;
    }

    setAdminComposer(type);
  };

  const loadDailyStats = useCallback(async () => {
    if (!canViewDailyStats) return;
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
  }, [canViewDailyStats, session?.access_token]);

  const loadMembers = useCallback(async () => {
    if (!canManageMembers) return;
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
  }, [canManageMembers, session?.access_token]);

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
    if (!canManageMembers) return;
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
    if (!canManageMembers) return;
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
    const userId = currentUserId;
    const accessToken = session?.access_token || '';
    if (!userId || !accessToken) return;

    const requestId = memberOrdersRequestIdRef.current + 1;
    memberOrdersRequestIdRef.current = requestId;
    memberOrdersAbortControllerRef.current?.abort();
    const controller = new AbortController();
    memberOrdersAbortControllerRef.current = controller;

    setMemberOrdersUserId(userId);
    setMemberOrderMessage(null);
    setMemberOrderError(null);
    setIsLoadingMemberOrders(true);

    try {
      const response = await fetch('/api/orders/my', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        cache: 'no-store',
        signal: controller.signal,
      });

      const payload = (await response.json()) as {
        orders?: MemberOrderRecord[];
        message?: string;
      };
      if (!response.ok) {
        throw new Error(payload.message || '주문 내역 로드 실패');
      }
      if (controller.signal.aborted || memberOrdersRequestIdRef.current !== requestId) return;

      const nextOrders = Array.isArray(payload.orders) ? payload.orders : [];
      setMemberOrders(nextOrders);
      setMemberOrdersLoaded(true);
      setMemberOrderMessage(`주문 ${nextOrders.length}건 로드 완료`);
    } catch (error) {
      if (controller.signal.aborted || memberOrdersRequestIdRef.current !== requestId) return;
      setMemberOrderError(error instanceof Error ? error.message : '주문 내역 로드 실패');
    } finally {
      if (!controller.signal.aborted && memberOrdersRequestIdRef.current === requestId) {
        setIsLoadingMemberOrders(false);
        if (memberOrdersAbortControllerRef.current === controller) {
          memberOrdersAbortControllerRef.current = null;
        }
      }
    }
  }, [currentUserId, session?.access_token]);

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
    if (!canManageOrders) return;
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
    const userId = currentUserId;
    const accessToken = session?.access_token || '';
    if (!userId || !accessToken) return;

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

    const mutationId = memberOrderMutationIdRef.current + 1;
    memberOrderMutationIdRef.current = mutationId;
    resetMemberOrderMessages();
    setCancellingMemberOrderId(order.id);

    try {
      const response = await fetch('/api/orders/my/cancel', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
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
      if (memberOrderMutationIdRef.current !== mutationId) return;

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
      if (memberOrderMutationIdRef.current !== mutationId) return;
      setMemberOrderError(error instanceof Error ? error.message : '주문취소 실패');
    } finally {
      if (memberOrderMutationIdRef.current === mutationId) {
        setCancellingMemberOrderId(null);
      }
    }
  };

  const handleCancelAdminOrder = async (order: AdminOrderRecord) => {
    if (!canManageOrders) return;
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
    if (!canManageOrders) return;
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
  }, [canManageOrders, session?.access_token]);

  useEffect(() => {
    if (!isAdminAccessResolved) return;

    const lacksTabAccess =
      (activeTab === 'members' && !canManageMembers) ||
      (activeTab === 'adminOrders' && !canManageOrders) ||
      (activeTab === 'inventory' && !canManageCatalog) ||
      (activeTab === 'dailyStats' && !canViewDailyStats);

    if (lacksTabAccess) {
      setActiveTab('overview');
    }
  }, [
    activeTab,
    canManageCatalog,
    canManageMembers,
    canManageOrders,
    canViewDailyStats,
    isAdminAccessResolved,
  ]);

  useEffect(() => {
    if (!isAdminAccessResolved || canManageCatalog) return;
    setAdminComposer(null);
  }, [canManageCatalog, isAdminAccessResolved]);

  useEffect(() => {
    if (!canManageMembers) return;
    if (activeTab !== 'members') return;
    if (membersLoaded) return;
    void loadMembers();
  }, [activeTab, canManageMembers, membersLoaded, loadMembers]);

  useEffect(() => {
    if (activeTab !== 'overview' && activeTab !== 'orders') return;
    if (memberOrdersLoaded) return;
    void loadMemberOrders();
  }, [activeTab, memberOrdersLoaded, loadMemberOrders]);

  useEffect(() => {
    if (!canManageOrders) return;
    if (activeTab !== 'adminOrders') return;
    if (adminOrdersLoaded) return;
    void loadAdminOrders();
  }, [activeTab, adminOrdersLoaded, canManageOrders, loadAdminOrders]);

  useEffect(() => {
    if (!canViewDailyStats) return;
    if (activeTab !== 'dailyStats') return;
    if (dailyStatsLoaded) return;
    void loadDailyStats();
  }, [activeTab, dailyStatsLoaded, canViewDailyStats, loadDailyStats]);

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
      <div className="font-mono md:h-full md:min-h-0">
        <div className="pb-[calc(env(safe-area-inset-bottom)+1rem)] md:h-full md:min-h-0 md:overflow-y-auto md:overscroll-contain md:pr-1">
          <AccountAuthPanel />
        </div>
      </div>
    );
  }

  const tabContent: Record<MyPageTab, ReactNode> = {
    overview: (
      <div className={styles.overviewGrid}>
        <article className={styles.overviewCard}>
          <p className={styles.overviewKicker}>Account</p>
          <p className={styles.overviewValue}>{userDisplayName}</p>
          <p className={styles.overviewDescription}>
            {user.email}
            <br />
            가입일 {formatDate(profile?.created_at || user.created_at)} ·{' '}
            {profile?.provider === 'google' ? 'Google 로그인' : 'Email 로그인'}
          </p>
          <button
            type="button"
            onClick={() => setActiveTab('profile')}
            className={styles.overviewLink}
          >
            계정 정보 보기
          </button>
        </article>

        <article className={styles.overviewCard}>
          <p className={styles.overviewKicker}>Orders</p>
          <p className={styles.overviewValue}>
            {memberOrderError && !memberOrdersLoaded
              ? '확인 불가'
              : isLoadingMemberOrders && !memberOrdersLoaded
                ? '확인 중'
                : `${memberOrders.length.toLocaleString('ko-KR')}건`}
          </p>
          <p className={styles.overviewDescription}>
            {memberOrderError && !memberOrdersLoaded
              ? '주문 요약을 불러오지 못했습니다. 주문 탭에서 다시 시도해 주세요.'
              : memberOrders[0]
                ? `최근 주문 ${memberOrders[0].orderCode || memberOrders[0].guestOrderNumber || memberOrders[0].id} · ${getShippingStatusLabel(memberOrders[0].shippingStatus)}`
                : memberOrdersLoaded
                  ? '현재 계정에 연결된 주문 내역이 없습니다.'
                  : '최근 주문과 배송 상태를 확인하고 있습니다.'}
          </p>
          <button
            type="button"
            onClick={() => setActiveTab('orders')}
            className={styles.overviewLink}
          >
            주문 / 배송조회
          </button>
        </article>

        <article className={styles.overviewCard}>
          <p className={styles.overviewKicker}>Cart</p>
          <p className={styles.overviewValue}>{cart.length.toLocaleString('ko-KR')}개</p>
          <p className={styles.overviewDescription}>
            예상 상품 합계 {cartSubtotal.toLocaleString('ko-KR')}원
            <br />
            담아 둔 상품의 수량과 옵션을 결제 전에 확인하세요.
          </p>
          <button
            type="button"
            onClick={() => setActiveTab('cart')}
            className={styles.overviewLink}
          >
            장바구니 보기
          </button>
        </article>
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
                            data-destructive="true"
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
                        <div className={`${styles.mediaFrame} relative aspect-[4/5] overflow-hidden rounded-[8px] border border-[#bcc5d0] bg-black`}>
                          <Image
                            src={order.paymentReceiptUrl}
                            alt="이체확인 사진"
                            fill
                            sizes="(max-width: 768px) 100vw, 50vw"
                            unoptimized={shouldBypassImageOptimization(order.paymentReceiptUrl)}
                            className="object-contain bg-black"
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
              <p className="text-[10px] uppercase tracking-widest text-[#00ffd1]">장바구니</p>
              <p className="text-xs text-[#9a9a9a] mt-2">
                담아 둔 상품과 예상 결제 금액을 확인하세요. 상품 옵션은 결제 전에 한 번 더 확인해 주세요.
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
            <p className="text-[#9b9b9b] mb-1">결제 안내</p>
            <p className="text-[#00ffd1]">화면 상단 장바구니에서 결제를 진행할 수 있습니다.</p>
          </div>
        </div>

        {cart.length > 0 ? (
          <div className="space-y-2">
            {cart.map((item) => (
              <div key={`${item.id}-${item.selectedSize ?? ''}`} className="border border-[#333] bg-[#0f0f0f] p-3 flex items-center gap-3">
                <div className={`${styles.mediaFrame} w-12 aspect-[4/5] border border-[#333] bg-black overflow-hidden shrink-0 relative`}>
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
        {!canViewDailyStats ? (
          <div className="border border-[#333] bg-[#111] p-4 text-xs text-[#c6c6c6]">
            {isAdminAccessResolved ? '일일 데이터 조회 권한이 없습니다.' : '관리자 권한을 확인하는 중입니다...'}
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
        {!canManageOrders ? (
          <div className="border border-[#333] bg-[#111] p-4 text-xs text-[#c6c6c6]">
            {isAdminAccessResolved ? '배송관리 권한이 없습니다.' : '관리자 권한을 확인하는 중입니다...'}
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
                      aria-pressed={adminOrderView === 'new'}
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
                      aria-pressed={adminOrderView === 'shipping'}
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
                      aria-pressed={adminOrderView === 'cancelled'}
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
                                <div className={`${styles.mediaFrame} relative mt-5 aspect-[4/5] overflow-hidden rounded-[10px] border-2 border-[#cfd6df] bg-black`}>
                                  <Image
                                    src={order.paymentReceiptUrl}
                                    alt="이체확인 사진"
                                    fill
                                    sizes="(max-width: 768px) 100vw, 50vw"
                                    unoptimized={shouldBypassImageOptimization(order.paymentReceiptUrl)}
                                    className="object-contain bg-black"
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
                                data-destructive="true"
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
    inventory: (
      <div className="space-y-4">
        {!canManageCatalog ? (
          <div className="border border-[#333] bg-[#111] p-4 text-xs text-[#c6c6c6]">
            {isAdminAccessResolved ? '카탈로그 관리 권한이 없습니다.' : '관리자 권한을 확인하는 중입니다...'}
          </div>
        ) : (
          <>
            <div className="rounded-[14px] border border-[#ffdd66]/35 bg-[#ffdd66]/10 p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-[#ffdd66]">
                    재고관리
                  </p>
                  <p className="mt-2 text-xs text-[#d8d0ad]">
                    수량 수정과 품절 처리를 여기서 바로 할 수 있습니다.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => openAdminComposer('inventory')}
                  className="rounded-[10px] border border-[#ffdd66]/45 bg-[#15130b] px-4 py-3 text-xs text-[#fff2b0] transition-colors hover:bg-[#221d0e]"
                >
                  크게 열기
                </button>
              </div>
            </div>

            <div className={`${styles.iframeFrame} h-[min(760px,68vh)] overflow-hidden rounded-[14px] border border-white/15 bg-[#050505]`}>
              <iframe
                src={getAdminComposerHref('inventory', true)}
                className="h-full w-full border-0 bg-[#050505]"
                title="inventory-admin"
              />
            </div>
          </>
        )}
      </div>
    ),
    members: (
      <div className="space-y-4">
        {!canManageMembers ? (
          <div className="border border-[#333] bg-[#111] p-4 text-xs text-[#c6c6c6]">
            {isAdminAccessResolved ? '회원관리 권한이 없습니다.' : '관리자 권한을 확인하는 중입니다...'}
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

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
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
                onClick={() => openAdminComposer('inventory')}
                className="rounded-[8px] border-2 border-[#ffdd66] bg-[linear-gradient(180deg,#221d0e_0%,#15130b_100%)] p-4 text-left text-sm text-[#fff2b0] shadow-[0_0_0_1px_rgba(255,221,102,0.16)] hover:border-[#fff2b0] hover:bg-[#2a230f] transition-colors"
              >
                <p className="font-semibold">재고관리 열기</p>
                <p className="mt-1 text-xs text-[#d8d0ad]">수량 수정/품절 처리</p>
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
                            data-destructive="true"
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
    <div className={`${styles.shell} font-mono md:h-full md:min-h-0 md:overflow-hidden`}>
      <div
        className={`${styles.panel} mx-auto flex w-full max-w-5xl flex-col p-3 md:h-full md:min-h-0 md:overflow-hidden md:p-4`}
      >
        <header className={`${styles.header} p-4 md:p-5`}>
          <div className="flex flex-col gap-4 text-center md:text-left">
            <div className="flex flex-col items-center gap-3 md:flex-row md:items-start md:justify-between">
              <div className="space-y-2">
                <p className={styles.eyebrow}>My Page</p>
                <div>
                  <h3 className={`${styles.title} text-2xl`}>{userDisplayName}</h3>
                  <p className={`${styles.meta} mt-1 break-all text-xs`}>{user.email}</p>
                </div>
                <p className={`${styles.meta} text-[11px]`}>
                  장바구니 {cart.length}개 / {cartSubtotal.toLocaleString('ko-KR')}원
                </p>
              </div>

              <div className={styles.headerActions}>
                {!onBack ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (typeof window !== 'undefined' && window.history.length > 1) {
                        window.history.back();
                      }
                    }}
                    className={`${styles.headerButton} inline-flex items-center justify-center gap-1.5 px-3 text-sm`}
                  >
                    <ChevronLeft size={16} />
                    뒤로가기
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => void signOut()}
                  disabled={isBusy}
                  className={`${styles.logoutButton} inline-flex items-center justify-center px-3 text-sm disabled:opacity-50`}
                >
                  {isBusy ? '처리중...' : '로그아웃'}
                </button>
              </div>
            </div>

            {adminAccessError ? (
              <div className={styles.adminAccessAlert} role="alert">
                <div>
                  <p className={styles.adminAccessAlertTitle}>
                    관리자 기능을 불러오지 못했습니다
                  </p>
                  <p className={styles.adminAccessAlertMessage}>{adminAccessError}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setAdminAccessRetryKey((retryKey) => retryKey + 1)}
                  className={styles.adminAccessRetryButton}
                >
                  권한 다시 확인
                </button>
              </div>
            ) : null}

            <div className={styles.tabList} role="tablist" aria-label="마이페이지 메뉴">
              {tabs.map((tab, index) => {
                const active = renderedActiveTab === tab.id;
                const countLabel =
                  typeof tab.count === 'number'
                    ? `${tab.count.toLocaleString('ko-KR')}${tab.countSuffix || '건'}`
                    : '메뉴';

                return (
                  <button
                    key={tab.id}
                    id={`${tabIdPrefix}-tab-${tab.id}`}
                    type="button"
                    role="tab"
                    aria-controls={tabPanelId}
                    aria-selected={active}
                    aria-label={`${MY_PAGE_TAB_LABELS[tab.id]} ${countLabel}`}
                    tabIndex={active ? 0 : -1}
                    onClick={() => setActiveTab(tab.id)}
                    onKeyDown={(event) => handleTabKeyDown(event, index)}
                    className={`${styles.tab} ${active ? styles.tabActive : ''}`}
                  >
                    <span className={styles.tabLabel}>{tab.label}</span>
                    <span className={styles.tabMeta}>{countLabel}</span>
                  </button>
                );
              })}
            </div>

            {hasAdminTools ? (
              <aside className={styles.quickActions} aria-label="관리자 빠른 작업">
                <p className={`${styles.eyebrow} mb-3 text-left`}>Admin Quick Actions</p>
                <div className={styles.quickActionGrid}>
                  {canManageCatalog ? (
                    <>
                      <button
                        type="button"
                        onClick={() => openAdminComposer('products')}
                        className={styles.quickAction}
                      >
                        의류 카탈로그
                      </button>
                      <button
                        type="button"
                        onClick={() => openAdminComposer('inventory')}
                        className={styles.quickAction}
                      >
                        재고관리
                      </button>
                      {isPrimaryAdmin ? (
                        <button
                          type="button"
                          onClick={() => openAdminComposer('collections')}
                          className={styles.quickAction}
                        >
                          컬렉션 관리
                        </button>
                      ) : null}
                    </>
                  ) : null}
                  {canManageMembers ? (
                    <button
                      type="button"
                      onClick={() => setActiveTab('members')}
                      className={styles.quickAction}
                    >
                      회원관리
                    </button>
                  ) : null}
                  {canManageOrders ? (
                    <button
                      type="button"
                      onClick={() => setActiveTab('adminOrders')}
                      className={styles.quickAction}
                    >
                      배송관리
                    </button>
                  ) : null}
                  {canViewDailyStats ? (
                    <button
                      type="button"
                      onClick={() => setActiveTab('dailyStats')}
                      className={styles.quickAction}
                    >
                      일일통계
                    </button>
                  ) : null}
                </div>
              </aside>
            ) : null}
          </div>
        </header>

        <section
          className={`${styles.contentShell} mt-4 flex flex-col p-4 md:min-h-0 md:flex-1 md:overflow-hidden md:p-6`}
        >
          <div className={`${styles.contentHeading} mb-4 px-1 pb-4 text-center md:text-left`}>
            <h4 className="text-lg">
              {tabs.find((tab) => tab.id === renderedActiveTab)?.label ||
                MY_PAGE_TAB_LABELS[renderedActiveTab]}
            </h4>
          </div>
          <div
            id={tabPanelId}
            role="tabpanel"
            aria-labelledby={`${tabIdPrefix}-tab-${renderedActiveTab}`}
            tabIndex={0}
            className={`${styles.contentScroll} md:min-h-0 md:flex-1 md:overflow-y-auto md:overscroll-contain md:pr-1`}
          >
            {tabContent[renderedActiveTab]}
          </div>
        </section>
      </div>

      {adminComposer && canManageCatalog && (
        <div
          className="fixed inset-0 z-[140] flex items-center justify-center p-2 md:p-4"
          role="dialog"
          aria-modal="true"
          aria-label={getAdminComposerLabel(adminComposer)}
          onKeyDown={(event) => {
            if (event.key !== 'Escape') return;
            event.preventDefault();
            event.stopPropagation();
            setAdminComposer(null);
          }}
        >
          <button
            type="button"
            onClick={() => setAdminComposer(null)}
            className={`${styles.mobileClose} right-3 top-[calc(env(safe-area-inset-top)+12px)] md:hidden`}
            aria-label="관리자 페이지 닫기"
          >
            ×
          </button>

          <button
            type="button"
            aria-label="관리자 페이지 닫기"
            className={`${styles.composerBackdrop} absolute inset-0`}
            onClick={() => setAdminComposer(null)}
          />

          <div
            className={`${styles.composerModal} relative h-[94vh] w-[98vw] overflow-hidden md:h-[min(860px,90vh)] md:w-[min(1200px,95vw)]`}
          >
            <div className={`${styles.composerHeader} flex h-16 items-center justify-between px-2 md:px-4`}>
              <div className="flex min-w-0 items-center gap-2" role="group" aria-label="카탈로그 관리 보기">
                <button
                  type="button"
                  aria-pressed={adminComposer === 'products'}
                  autoFocus={adminComposer === 'products'}
                  onClick={() => setAdminComposer('products')}
                  className={`${styles.composerTab} px-3 text-xs ${
                    adminComposer === 'products' ? styles.composerTabActive : ''
                  }`}
                >
                  의류 목록
                </button>
                <button
                  type="button"
                  aria-pressed={adminComposer === 'inventory'}
                  autoFocus={adminComposer === 'inventory'}
                  onClick={() => setAdminComposer('inventory')}
                  className={`${styles.composerTab} px-3 text-xs ${
                    adminComposer === 'inventory' ? styles.composerTabActive : ''
                  }`}
                >
                  재고관리
                </button>
                {isPrimaryAdmin ? (
                  <button
                    type="button"
                    aria-pressed={adminComposer === 'collections'}
                    autoFocus={adminComposer === 'collections'}
                    onClick={() => setAdminComposer('collections')}
                    className={`${styles.composerTab} px-3 text-xs ${
                      adminComposer === 'collections' ? styles.composerTabActive : ''
                    }`}
                  >
                    컬렉션
                  </button>
                ) : null}
                <p className={`${styles.meta} ml-2 hidden text-[11px] md:block`}>
                  현재 보기: {getAdminComposerLabel(adminComposer)}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setAdminComposer(null)}
                className={`${styles.composerClose} ml-2 inline-flex h-11 w-11 shrink-0 items-center justify-center`}
                aria-label="관리자 페이지 닫기"
              >
                ×
              </button>
            </div>

            <div className={`${styles.iframeFrame} h-[calc(100%-64px)]`}>
              <iframe
                src={getAdminComposerHref(adminComposer, true)}
                className="h-full w-full border-0 bg-[#050505]"
                title={`${adminComposer}-admin`}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
