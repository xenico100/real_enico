import styles from '@/app/components/subculture/CorridorShowroom.module.css';

export default function StorefrontLoading() {
  return (
    <div className={styles.routeLoading} role="status" aria-live="polite" aria-busy="true" aria-label="ENICO VECK 전시 입장 중">
      <div className={styles.loadFrame}>
        <span className={styles.loadTop}>ENICO VECK <span>®</span> <span>ARCHIVE / 001</span></span>
        <span className={styles.loadWire} aria-hidden="true"><i /></span>
        <strong className={styles.loadBrand}>ENICO<br />VECK<span>®</span></strong>
        <div className={styles.loadFooter}>
          <span className={styles.loadTrack} aria-hidden="true"><i /></span>
          <span>ENTERING THE ARCHIVE</span>
          <span>{'/////'}</span>
        </div>
      </div>
    </div>
  );
}
