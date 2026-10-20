# 공홈 유입 경로

**ENICO · MONGSANGIN 통합 관리자 → 개요 → 에니코벡 공홈 유입**에서 확인한다.
주소는 `https://enico-mongsangin-admin.vercel.app/?site=enico&view=overview`다.
기존 `/admin`, `/admin/collections`와 마이페이지 관리자 진입은 통합 관리자로 연결된다.
오늘과 최근 7일에 대해 출처, 채널, 외부 도메인, 첫 도착 경로와 UTM 정보를 표시한다.

## 수집과 집계

- 기존 `site_daily_visitors`의 `(visit_date, visitor_id)`별 `last_path` JSON에 선택형 `attribution`을 저장한다. DB 마이그레이션은 필요 없다.
- 한국시간 날짜별로 처음 식별한 유입을 유지한다. 직접·출처 없음으로 시작했더라도 나중에 외부 출처나 캠페인 정보가 확인되면 보완한다.
- UTM 또는 `ref`/`source` 태그를 우선하고 외부 referrer 도메인을 다음 근거로 사용한다. 내부 이동은 새 외부 유입으로 분류하지 않는다.
- 도메인을 통해 검색·SNS·메신저·이메일·외부 사이트를 구분한다. 예를 들어 네이버 블로그는 네이버 검색과 구분하며, 모르는 사이트도 실제 호스트명을 남긴다.
- 광고 여부는 `utm_medium=cpc`, `paid_social` 등의 태그로 구분한다. 태그 없는 광고를 광고로 확정할 수는 없다.
- 원본 referrer의 호스트명과 UTM 5종(`source`, `medium`, `campaign`, `content`, `term`)만 저장한다. referrer 전체 URL, 검색어 쿼리, 해시 또는 임의 URL 파라미터는 수집하지 않는다. 문자열 길이를 제한하고, 출력은 React 텍스트로 처리한다.
- `/admin`과 `/dev` 화면은 새 클라이언트 방문 수집에서 제외한다. 봇·관리자 본인의 공홈 방문까지 모두 제거하는 기능은 아니다.
- 동시 요청은 짧은 시각 revision과 재시도를 사용해 먼저 식별한 출처와 상호작용 기록을 보호한다.

방문자는 사람 수가 아니라 쿠키별 일 방문 식별자다. 7일 합계는 일별 식별자 수의 합이며, 기간 전체 순 방문자가 아니다.

**직접·출처 없음**에는 주소 입력·즐겨찾기뿐 아니라 referrer를 전달하지 않는 앱/브라우저도 포함된다. 과거 `other` 기록에는 원래 도메인이 없으므로 **과거 출처 미수집**으로 유지하며 소급 복원하지 않는다. 기존 5종 `sourceVisitors` 응답은 호환성을 위해 유지하고 새 화면은 `sourceDetails`를 사용한다.

## 공유 링크에 태그 붙이기

앱이 referrer를 숨기는 경우에도 링크에 태그가 있으면 식별할 수 있다.

```text
https://enicoveck.com/?utm_source=kakao&utm_medium=messaging&utm_campaign=2026_fall&utm_content=channel_post
https://enicoveck.com/?utm_source=naver&utm_medium=cpc&utm_campaign=2026_fall&utm_term=brand
```

UTM에는 고객 연락처·이메일·비밀번호·주문번호를 넣지 않는다. 새 외부 분석 서비스나 추가 API 키는 사용하지 않는다.

## 검증

```bash
npm run test:analytics
npx tsc --noEmit
npm run build
```

테스트는 실제 분류 함수, 브라우저 수집 함수, API 저장·동시 갱신·집계 코드를 실행하며 외부 네트워크나 운영 데이터는 사용하지 않는다.
