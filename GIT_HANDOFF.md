# ENICO VECK PIXEL SQUARE — Git 인수인계서

## 현재 상태

- 로컬 경로: `/Volumes/free/enico-veck-world`
- 원격: `https://github.com/xenico100/real_enico.git`
- 작업 브랜치: `feature/enico-veck-world`
- 기반 커밋: `33452b9 feat: build ENICO VECK Pixel Square`
- 아바타 WIP 체크포인트: `19f64d0 wip: hand off yami-kawaii avatar studio`
- 완료 커밋: `feat: complete yami-kawaii avatar studio` (이 문서와 함께 추가)
- 기존 `/Volumes/free/Enico Veck/website_enico` 작업 트리와 `main`은 수정하지 않았다.
- 이 프로젝트는 독립 root repository를 기존 `real_enico` 원격의 별도 브랜치에 올린 구조다. `main` 병합 전 unrelated-history/monorepo 정책을 먼저 정해야 한다.

## 실행

```bash
cd "/Volumes/free/enico-veck-world"
npm install
npm run dev
```

- Client: `http://127.0.0.1:5173`
- Server: `http://127.0.0.1:3001`
- Health: `http://127.0.0.1:3001/health`
- 20명 수동 봇: `npm run bots -- 20`

외부 API, Supabase, 원격 폰트·이미지 없이 로컬에서만 동작한다.

## 아키텍처

- Client: Vite + React + TypeScript + React Three Fiber/Three.js
- Server: Node HTTP + Socket.IO 권위 서버
- `packages/protocol`: 이벤트, 공유 타입, AvatarConfig, 런타임 가드
- `packages/game-domain`: 이동·충돌·프로필·채팅 규칙
- `packages/test-bots`: 실제 프로토콜 기반 자동 사용자
- Storage: LocalStorage v2 프로필 + SessionStorage 탭 세션
- 확장 경계: `IdentityProvider`, `RealtimeTransport` 어댑터를 통해 추후 인증·호스팅 서버 교체 가능

## 완료 기능

### 2.5D 소셜 월드

- 직교 카메라 저폴리 광장
- 서버 권위 이동, 충돌, 경계, 20Hz 월드 틱
- 멀티탭 접속·이동·퇴장·자동 재접속 동기화
- 근거리 채팅, 캐릭터 말풍선, 이모트
- 접속자 목록, 실제 아바타 프로필 카드, 상태 메시지
- LocalStorage 프로필 복원과 중복 세션 정리

### 야미카와이 아바타 스튜디오

`packages/protocol/src/avatar.ts`에 강타입 `AvatarConfig`와 런타임 검증이 있다.

- 피부 4종
- 헤어스타일 6종
- 헤어 컬러 7종
- 눈 5종
- 의상 6종
- 의상 컬러 6종
- 레그웨어 5종
- 헤드 액세서리 7종
- 페이스 액세서리 6종
- 오라 6종
- 총 `38,102,400`개 조합

스튜디오 UI:

- 좌측 10개 카테고리 내비게이션
- 중앙 이름 있는 옵션 카드와 선택 상태
- 우측 대형 실시간 픽셀 미리보기
- 랜덤 믹스와 기본값 리셋
- 닉네임·상태 메시지
- `aria-pressed`, 키보드 포커스, 안정된 E2E test id
- 1440×900에서 1,380px 3열 레이아웃이 화면 안에 들어오도록 검수
- 1180/920/640px 반응형 전환

### 픽셀 렌더링

`apps/client/src/avatarRenderer.ts`의 32×40 Canvas 렌더러를 미리보기와 Three.js 월드 sprite가 공유한다.

- 큰 치비 머리, 큰 눈, 홍조
- 6개 헤어 실루엣과 4방향/2-step 걷기
- 레이스·세일러·후디·너스·아이돌·고스로리 의상
- 리본, 고양이 귀, 깨진 헤일로, 뿔, 헤드폰, 보닛
- 밴드, 하트 안대, 마스크, 글리터 눈물, 피어싱
- 하트, 별, 글리치, 박쥐, 가시 오라
- nearest-neighbor 텍스처와 설정 키 기반 캐시

### 저장과 호환성

- v2 키: `enico.pixel-square.profile.v2`
- 기존 v1 프로필을 읽어 `DEFAULT_AVATAR`를 추가하고 v2로 자동 이전
- 손상된 JSON/아바타는 안전한 기본값으로 복구
- 기존 `palette` 필드는 구형 데이터 호환용으로만 유지하며 렌더 source of truth는 `avatar`
- 클라이언트와 서버 양쪽에서 잘못된 옵션 거부

## 최종 검증 결과

- `npm run lint`: 통과
- `npm run typecheck`: strict 검사 통과
- `npm run test`: Vitest `14/14` 통과
  - protocol 가드
  - 아바타 유효성
  - 이동·충돌·채팅
  - LocalStorage v1→v2 이전/손상 복구
  - Socket.IO 접속·이동·채팅·퇴장
- `npm run build`: 서버·클라이언트 production build 통과
- `npm run test:e2e`: 통과
  - 두 사용자가 서로 다른 8개 이상 옵션 선택
  - 원격 아바타 색·프로필·스타일 확인
  - 이동·채팅·이모트
  - 새로고침 후 모든 선택 복원
  - 중복 없는 재접속
- `npm run test:e2e:gpu`: 통과, headed Chromium `75.2 FPS` (하한 50)
- `npm run test:load`: 통과
  - 봇 20명 40ms 내 접속
  - 20/20 이동
  - 근거리 채팅
  - 퇴장 정리
  - 동일 세션 재접속
- `npm audit --omit=dev`: 취약점 0건
- 1440×900 스튜디오 바운딩 박스:
  - form `x=30, width=1380`
  - preview와 enter button 모두 viewport 내부
- E2E 월드와 스튜디오 스크린샷 직접 검수 완료

Vite가 Three.js 단일 번들 500kB 초과 경고를 출력하지만 gzip 약 318kB이며 빌드·GPU 성능 기준은 통과했다. 추후 배포 최적화 시 Three/vendor chunk 분리를 고려한다.

## 주요 파일

- `apps/client/src/EntryGate.tsx`: 3열 커스터마이징 스튜디오
- `apps/client/src/avatarRenderer.ts`: 픽셀 아바타 렌더러
- `apps/client/src/AvatarPreview.tsx`: Canvas 미리보기
- `apps/client/src/WorldScene.tsx`: 2.5D 월드 sprite
- `apps/client/src/App.tsx`: 소셜 HUD와 실제 아바타 프로필
- `apps/client/src/adapters.ts`: v2 저장·v1 마이그레이션
- `packages/protocol/src/avatar.ts`: 옵션·타입·가드·도우미
- `apps/server/src/app.ts`: 권위 월드와 AvatarConfig 동기화
- `packages/test-bots/src/bot.ts`: 다양한 아바타 봇
- `tests/e2e/pixel-square.spec.ts`: 전체 사용자 여정

## 후속 확장 후보

현재 범위에는 필요하지 않지만 다음 단계에서 고려할 수 있다.

1. Supabase/별도 게임 서버 어댑터 추가
2. 개인 미니룸·방명록·친구 초대
3. 모바일 터치 조이스틱
4. 사용자 제작 프리셋 슬롯과 import/export
5. Three/vendor lazy chunk 분리
6. 서버 영구 저장 및 운영 환경 보안·moderation 정책

완료본을 다시 검증하려면 다음 한 명령을 사용한다.

```bash
npm run validate
```
