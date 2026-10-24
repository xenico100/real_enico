import { formatCustomerOrderDate } from '@/lib/orders/customerOrderPresentation';
import styles from './MyPagePanel.module.css';

export type AdminReturnOrder = {
  id: string;
  orderCode: string;
  guestOrderNumber: string;
  returnRequest?: { status: 'requested'; requestedAt: string; reason: string } | null;
};

export function AdminReturnIntake({ orders, loading, error, onReload, ordersUrl }: {
  orders: AdminReturnOrder[];
  loading: boolean;
  error: string | null;
  onReload: () => void;
  ordersUrl: string | null;
}) {
  const requests = orders.filter(order => order.returnRequest?.status === 'requested');
  return <section className={`${styles.overviewCard} ${styles.returnIntake}`} aria-label="관리자 반품 접수">
    <div className={styles.returnIntakeHeader}>
      <h5>반품 접수</h5>
      <button type="button" className={styles.overviewLink} onClick={onReload} disabled={loading}>{loading ? '불러오는 중...' : '반품 접수 새로고침'}</button>
    </div>
    <p className={styles.overviewDescription}>고객이 접수한 반품 신청입니다. 주문번호와 사유를 확인한 후 고객에게 반송 절차를 안내해 주세요. 접수만으로 결제 취소·환불은 진행되지 않습니다.</p>
    {error ? <p role="alert" className={styles.overviewDescription}>{error}</p>
      : loading && requests.length === 0 ? <p role="status" className={styles.overviewDescription}>반품 접수 내역을 확인하고 있습니다.</p>
        : requests.length === 0 ? <p role="status" className={styles.overviewDescription}>접수된 반품 신청이 없습니다.</p>
          : <ul className={styles.returnIntakeList}>{requests.map(order => <li key={order.id}>
            <p className={styles.returnIntakeIdentifier}>{order.orderCode || order.guestOrderNumber || order.id}</p>
            <p className={styles.overviewDescription}>접수일 {formatCustomerOrderDate(order.returnRequest!.requestedAt, true)}</p>
            <p className={styles.returnIntakeReason}>{order.returnRequest!.reason}</p>
          </li>)}</ul>}
    {ordersUrl && <a className={styles.overviewLink} href={ordersUrl}>통합 관리자에서 주문 확인</a>}
  </section>;
}
