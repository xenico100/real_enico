'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useId, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ArrowUpRight, Check, ChevronDown, Copy, Package } from 'lucide-react';
import { shouldBypassImageOptimization } from '@/lib/images';
import { BANK_ACCOUNT } from '@/lib/orders/bankAccount';
import { getShipmentTrackingUrl } from '@/lib/orders/shipmentTracking';
import type { ReturnEligibility } from '@/lib/orders/returnPolicy';
import {
  formatCustomerOrderDate, formatCustomerOrderMoney, getCustomerOrderProgress,
  getCustomerPaymentLabel, type CustomerOrderItem,
} from '@/lib/orders/customerOrderPresentation';
import { BankTransferInstructions, CustomerOrderNotifications, type BankAccountDetails, type OrderNotificationSummary } from './BankTransferInstructions';
import styles from './CustomerOrderCard.module.css';

export type CustomerOrderCardData = {
  id: string;
  orderCode: string;
  guestOrderNumber: string;
  paymentMethod: string;
  paymentStatus: string;
  currency: string;
  amountTotal: number;
  customerAddress: string;
  bankAccount?: BankAccountDetails | null;
  bankName?: string;
  bankAccountNumber?: string;
  notifications?: OrderNotificationSummary | null;
  items: CustomerOrderItem[];
  shippingStatus: string;
  shippingCompany: string;
  trackingNumber: string;
  shippingNote: string;
  shippedAt: string | null;
  deliveredAt: string | null;
  createdAt: string | null;
  paymentReceiptUrl?: string;
  returnEligibility?: ReturnEligibility;
};

type CancelState = { visible: boolean; enabled: boolean; title: string; label: string; description: string };
const STEPS = ['결제 확인', '배송 준비', '배송중', '배송 완료'];
const EASE = [0.22, 1, 0.36, 1] as const;

export function CustomerOrderCard({ order, index = 0, cancelState, isCancelling = false, onCancel, isRequestingReturn = false, onReturn }: {
  order: CustomerOrderCardData;
  index?: number;
  cancelState?: CancelState;
  isCancelling?: boolean;
  onCancel?: () => void;
  isRequestingReturn?: boolean;
  onReturn?: (reason: string) => Promise<boolean>;
}) {
  const [expanded, setExpanded] = useState(() => Boolean(order.shippingNote.trim()));
  const [copyStatus, setCopyStatus] = useState<{ trackingNumber: string; message: string } | null>(null);
  const [returnFormOpen, setReturnFormOpen] = useState(false);
  const [returnReason, setReturnReason] = useState('');
  const reducedMotion = useReducedMotion();
  const detailsId = useId();
  const returnReasonId = useId();
  const returnFormId = useId();
  const progress = getCustomerOrderProgress(order);
  const identifier = order.orderCode || order.guestOrderNumber || order.id;
  const isPendingTransfer = order.paymentMethod === 'bank_transfer' && order.paymentStatus === 'pending_transfer';
  const trackingUrl = progress.paid ? getShipmentTrackingUrl(order.shippingCompany, order.trackingNumber) : null;
  const hasCustomerNotifications = Boolean(order.notifications?.customerKakao || order.notifications?.customerSms || order.notifications?.customerEmail);
  const quantity = order.items.reduce((sum, item) => sum + Math.max(0, item.quantity), 0);
  const transition = { duration: reducedMotion ? 0 : 0.45, ease: EASE };

  const copyTracking = async () => {
    try {
      await navigator.clipboard.writeText(order.trackingNumber);
      setCopyStatus({ trackingNumber: order.trackingNumber, message: '운송장번호를 복사했습니다.' });
    } catch {
      setCopyStatus({ trackingNumber: order.trackingNumber, message: '복사하지 못했습니다. 운송장번호를 길게 눌러 복사해 주세요.' });
    }
  };

  return (
    <motion.article
      data-customer-order-card
      className={styles.card}
      initial={reducedMotion ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...transition, delay: reducedMotion ? 0 : Math.min(index, 3) * 0.055 }}
    >
      <header className={styles.header}>
        <div className={styles.orderMeta}>
          <p className={styles.eyebrow}>ENICO VECK / ORDER</p>
          <p className={styles.identifier}>{identifier}</p>
          <p className={styles.date}>{formatCustomerOrderDate(order.createdAt)} 주문</p>
        </div>
        <div className={styles.badge} role="status" aria-live="polite" aria-atomic="true">
          <AnimatePresence mode="wait" initial={false}>
            <motion.span key={order.paymentStatus} initial={reducedMotion ? false : { opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={transition}>
              {progress.paid && <Check size={13} aria-hidden="true" />}{getCustomerPaymentLabel(order)}
            </motion.span>
          </AnimatePresence>
        </div>
      </header>

      <section className={styles.fulfillment} aria-label="현재 주문 상태">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={`${order.paymentStatus}-${order.shippingStatus}`} initial={reducedMotion ? false : { opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={transition}>
            <h3 className={styles.statusTitle}>{progress.label}</h3>
            <p className={styles.statusDetail}>{progress.detail}</p>
          </motion.div>
        </AnimatePresence>
        {!progress.stopped && <ol className={styles.steps} aria-label="주문 진행 단계">
          {STEPS.map((label, step) => <li key={label} className={step < progress.step ? styles.stepDone : step === progress.step ? styles.stepCurrent : styles.stepWaiting} aria-current={step === progress.step ? 'step' : undefined}>
            <span className={styles.stepMark} aria-hidden="true">{step < progress.step ? <Check size={10} /> : String(step + 1).padStart(2, '0')}</span>
            <span>{label}<span className={styles.srOnly}>{step < progress.step ? ' 완료' : step === progress.step ? ' 현재 단계' : ' 대기'}</span></span>
          </li>)}
        </ol>}
      </section>

      <section className={styles.items} aria-label="주문 상품">
        {order.items.length === 0 ? <p className={styles.muted}>상품 정보를 확인하고 있습니다. 주문번호와 함께 문의해 주세요.</p> : order.items.map((item, itemIndex) => <div className={styles.item} key={`${item.id}-${item.selectedSize}-${itemIndex}`}>
          <div className={styles.itemImage}>
            {item.image ? <Image src={item.image} alt="" fill sizes="72px" unoptimized={shouldBypassImageOptimization(item.image)} className={styles.image} /> : <Package size={25} aria-hidden="true" />}
          </div>
          <div className={styles.itemInfo}>
            <p className={styles.itemName}>{item.name || '주문 상품'}</p>
            <p className={styles.itemOption}>옵션 {item.selectedSize || '기본'} <span aria-hidden="true">/</span> 수량 {item.quantity}개</p>
            <p className={styles.itemPrice}>{formatCustomerOrderMoney(item.lineTotal, order.currency)}</p>
          </div>
        </div>)}
      </section>

      <div className={styles.total}>
        <p>총 {quantity}개 <span className={styles.muted}>/ 결제 금액</span></p>
        <strong>{formatCustomerOrderMoney(order.amountTotal, order.currency)}</strong>
      </div>

      {progress.paid && order.trackingNumber && <section className={styles.tracking} aria-label="배송 조회">
        <div><p className={styles.eyebrow}>{order.shippingCompany || '택배사 확인중'}</p><p className={styles.trackingNumber}>{order.trackingNumber}</p></div>
        <div className={styles.trackingActions}>
          {trackingUrl && <a href={trackingUrl} target="_blank" rel="noopener noreferrer" className={styles.action}>배송 조회 <ArrowUpRight size={14} aria-hidden="true" /><span className={styles.srOnly}> 새 창</span></a>}
          <button type="button" onClick={() => void copyTracking()} className={styles.action} aria-label="운송장번호 복사"><Copy size={14} aria-hidden="true" /> 복사</button>
        </div>
        {!trackingUrl && <p className={styles.trackingHint}>택배사 홈페이지에서 운송장번호로 조회해 주세요.</p>}
        {copyStatus?.trackingNumber === order.trackingNumber && <p className={styles.trackingHint} role="status">{copyStatus.message}</p>}
      </section>}

      {isPendingTransfer && <div className={styles.bank}><BankTransferInstructions tone="brand" bankAccount={order.bankAccount || { ...BANK_ACCOUNT, bankName: order.bankName || BANK_ACCOUNT.bankName, accountNumber: order.bankAccountNumber || BANK_ACCOUNT.accountNumber }} amount={order.amountTotal} /></div>}
      {hasCustomerNotifications && <div className={styles.notifications}><CustomerOrderNotifications tone="brand" notifications={order.notifications} /></div>}

      {onReturn && order.returnEligibility && progress.paid && order.shippingStatus === 'delivered' && <section className={styles.returns} aria-label="반품 신청">
        <h3 className={styles.returnTitle}>반품</h3>
        {order.returnEligibility.request ? <div role="status">
          <p>반품 신청이 접수되었습니다.</p>
          <p>접수일 {formatCustomerOrderDate(order.returnEligibility.request.requestedAt, true)} · 담당자 확인 후 안내해 드립니다.</p>
        </div> : order.returnEligibility.eligible ? <>
          <p>배송 완료일로부터 7일 이내 반품을 신청할 수 있습니다. 접수 후 반품 가능 여부와 절차를 안내해 드립니다.</p>
          {order.returnEligibility.deadline && <p>신청 기한 {formatCustomerOrderDate(order.returnEligibility.deadline, true)}</p>}
          <button type="button" className={styles.action} aria-expanded={returnFormOpen} aria-controls={returnFormId} disabled={isRequestingReturn} onClick={() => setReturnFormOpen(value => !value)}>반품 신청</button>
          {returnFormOpen && <form id={returnFormId} className={styles.returnForm} onSubmit={async event => {
            event.preventDefault();
            if (!returnReason.trim() || isRequestingReturn) return;
            if (await onReturn(returnReason.trim())) { setReturnFormOpen(false); setReturnReason(''); }
          }}>
            <label htmlFor={returnReasonId}>반품 사유</label>
            <textarea id={returnReasonId} value={returnReason} onChange={event => setReturnReason(event.target.value)} required maxLength={1000} rows={4} disabled={isRequestingReturn} placeholder="반품 사유와 상품 상태를 알려 주세요." />
            <p>신청만 접수되며, 결제 취소나 환불은 바로 진행되지 않습니다. 안내를 받기 전 상품을 보내지 마세요.</p>
            <button type="submit" className={styles.action} disabled={isRequestingReturn || !returnReason.trim()}>{isRequestingReturn ? '접수중...' : '반품 신청 접수'}</button>
          </form>}
        </> : <>
          <p>{order.returnEligibility.reason === 'window_elapsed' ? '온라인 반품 신청 기간이 지났습니다.' : '배송 완료일 확인이 필요합니다.'} 상품 하자·오배송 등 반품 상담은 고객센터로 문의해 주세요.</p>
          <Link className={styles.action} href="/?popup=contact">반품 문의</Link>
        </>}
      </section>}

      <button type="button" className={styles.expand} aria-expanded={expanded} aria-controls={detailsId} onClick={() => setExpanded(value => !value)}>
        배송 정보 · 주문 상세
        <motion.span animate={{ rotate: expanded ? 180 : 0 }} transition={transition}><ChevronDown size={16} aria-hidden="true" /></motion.span>
      </button>
      <div id={detailsId} hidden={!expanded}>
        {expanded && <motion.div className={styles.details} initial={reducedMotion ? false : { opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} transition={transition}>
          <dl className={styles.detailList}>
            <div><dt>배송지</dt><dd>{order.customerAddress || '등록된 배송지가 없습니다.'}</dd></div>
            <div><dt>배송 메모</dt><dd>{order.shippingNote || '등록된 메모가 없습니다.'}</dd></div>
            <div><dt>발송일</dt><dd>{formatCustomerOrderDate(progress.paid ? order.shippedAt : null, true)}</dd></div>
            <div><dt>배송 완료일</dt><dd>{formatCustomerOrderDate(progress.paid && order.shippingStatus === 'delivered' ? order.deliveredAt : null, true)}</dd></div>
          </dl>
          {order.paymentReceiptUrl && <a className={styles.receipt} href={order.paymentReceiptUrl} target="_blank" rel="noopener noreferrer">입금 확인 사진 보기 <ArrowUpRight size={14} aria-hidden="true" /><span className={styles.srOnly}> 새 창</span></a>}
          {cancelState?.visible && <div className={styles.cancel}>
            <p>{cancelState.description}</p>
            {onCancel && <button type="button" data-destructive="true" onClick={onCancel} disabled={!cancelState.enabled || isCancelling} className={styles.cancelButton}>{isCancelling ? '취소 처리중...' : cancelState.label}</button>}
          </div>}
        </motion.div>}
      </div>
    </motion.article>
  );
}
