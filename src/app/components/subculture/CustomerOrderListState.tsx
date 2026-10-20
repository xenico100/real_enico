'use client';

import styles from './CustomerOrderListState.module.css';

export function CustomerOrderListState({ state, legacyLinkRequired = false, onRetry }: {
  state: 'loading' | 'empty' | 'error';
  legacyLinkRequired?: boolean;
  onRetry?: () => void;
}) {
  return <div className={styles.state} role={state === 'error' ? 'alert' : 'status'} aria-busy={state === 'loading'}>
    <p className={styles.eyebrow}>ENICO VECK / ORDERS</p>
    <p className={styles.title}>{state === 'loading' ? '주문 내역을 확인하고 있습니다' : state === 'error' ? '주문 내역을 불러오지 못했습니다' : legacyLinkRequired ? '계정에 연결된 주문이 아직 없습니다' : '아직 주문 내역이 없습니다'}</p>
    <p className={styles.description}>{state === 'loading' ? '잠시만 기다려 주세요.' : state === 'error' ? '잠시 후 다시 시도해 주세요. 문제가 계속되면 고객센터로 문의해 주세요.' : legacyLinkRequired ? '이전 주문은 주문번호와 함께 고객센터로 문의해 주세요.' : '새로운 주문과 배송 과정이 이곳에 기록됩니다.'}</p>
    {state === 'error' && onRetry && <button type="button" onClick={onRetry} className={styles.retry}>다시 시도</button>}
  </div>;
}
