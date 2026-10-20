/** Carrier-owned tracking pages only. Unknown carriers retain copyable tracking. */
export function getShipmentTrackingUrl(company: string, trackingNumber: string): string | null {
  const carrier = company.trim().toLowerCase().replace(/[\s._-]/g, '');
  const tracking = trackingNumber.trim().replace(/[\s-]/g, '');
  if (!/^\d{8,30}$/.test(tracking)) return null;
  if (['우체국', '우체국택배', 'epost', 'koreapost'].includes(carrier)) {
    return `https://service.epost.go.kr/trace.RetrieveDomRigiTraceList.comm?sid1=${tracking}`;
  }
  if (['cj', 'cj대한통운', '대한통운', 'cjlogistics'].includes(carrier)) {
    return `https://trace.cjlogistics.com/next/tracking.html?wblNo=${tracking}`;
  }
  if (['한진', '한진택배', 'hanjin'].includes(carrier)) {
    return `https://www.hanjin.com/kor/CMS/DeliveryMgr/WaybillResult.do?mCode=MN038&schLang=KR&wblnum=${tracking}&wblnumText=`;
  }
  return null;
}
