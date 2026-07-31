# ENICO VECK PIXEL SQUARE — Git 인수인계서

## 1. 빠른 현황

- 로컬 경로: `/Volumes/free/enico-veck-world`
- Git 원격: `https://github.com/xenico100/real_enico.git`
- 작업 브랜치: `feature/enico-veck-world`
- 마지막 안정 버전 커밋: `33452b9 feat: build ENICO VECK Pixel Square`
- 현재 체크포인트: 이 문서와 함께 올라간 `wip: hand off yami-kawaii avatar studio` 커밋
- 기존 사이트 경로 `/Volumes/free/Enico Veck/website_enico`와 그 작업 트리는 절대 수정하지 말 것
- `main`에 직접 push하지 말고 현재 feature 브랜치에서 새 커밋으로 이어갈 것
- 이 프로젝트는 독립 root repository로 만든 뒤 기존 `real_enico` 원격의 별도 브랜치에 올린 상태다. `main`과 합칠 때는 unrelated-history/monorepo 정책을 먼저 결정해야 한다.

## 2. 제품 기본 구성

독립 로컬 전용 2.5D 소셜 월드다.

- Client: Vite + React + TypeScript + React Three Fiber/Three.js
- Server: Node HTTP + Socket.IO 권위 서버
- Workspace: npm workspaces
- Shared packages:
  - `packages/protocol`: 실시간 이벤트, 타입, 런타임 가드
  - `packages/game-domain`: 이동, 충돌, 프로필·채팅 검증
  - `packages/test-bots`: 실제 프로토콜 기반 부하 봇
- Storage: LocalStorage/SessionStorage
- 외부 API, Supabase, 원격 폰트·이미지 없음
- 기본 실행:
  - Client `http://127.0.0.1:5173`
  - Server `http://127.0.0.1:3001`
  - Health `http://127.0.0.1:3001/health`

## 3. 안정 버전에서 이미 완료된 기능

커밋 `33452b9` 기준으로 아래 기능과 검증이 완료됐다.

- 2.5D 직교 카메라 광장과 저폴리 환경
- 키보드 이동, 서버 권위 좌표, 충돌, 월드 경계
- 여러 브라우저 창의 접속·이동·퇴장·재접속 동기화
- 근거리 채팅, 말풍선, 이모트, 접속자 목록, 프로필 카드
- 교체 가능한 `IdentityProvider`와 `RealtimeTransport`
- 실제 Chromium 두 사용자 E2E
- 20명 봇 접속·이동·채팅·퇴장 정리·세션 재접속 부하 테스트
- ESLint, strict TypeScript, 단위·통합 테스트 10개, build, E2E, load 통과
- headed GPU E2E에서 50fps 하한 통과
- 당시 npm audit 취약점 0건

## 4. 이번 WIP 목표

기존 단순 4색 캐릭터를 독창적인 야미카와이/파스텔 고스/지뢰계 감성의 귀여운 치비 픽셀 아바타로 교체하고, 대규모 커스터마이징을 로컬 저장과 멀티플레이 프로토콜 전체에 연결하는 작업이다. 특정 캐릭터·브랜드 자산은 복제하지 않는다.

## 5. 현재까지 구현된 아바타 개편

### 5.1 공유 스키마와 옵션 카탈로그

`packages/protocol/src/avatar.ts`

- `AvatarConfig`와 런타임 `isAvatarConfig` 추가
- 10개 카테고리:
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
- 총 조합 수: `38,102,400`
- `DEFAULT_AVATAR`, `AVATAR_CATEGORIES`, `avatarOption`, `avatarAccent`, `avatarConfigKey`, `createAvatarVariant` 추가
- `PlayerProfile`과 `PlayerSnapshot`에 전체 `avatar` 추가
- `isJoinPayload`가 아바타 옵션을 런타임 검증
- 기존 `palette` 필드는 구형 프로필 호환을 위해 임시 유지하며, 새 UI 렌더링의 source of truth는 `avatar`다.

### 5.2 픽셀 렌더러

- `apps/client/src/avatarRenderer.ts`
  - 32×40 Canvas 픽셀 렌더러
  - 4방향과 2-step 걷기 프레임
  - 큰 치비 머리, 큰 눈, 홍조
  - hime/twintail/wolf/bob/long/bun 헤어
  - lace/sailor/hoodie/nurse/idol/goth 의상
  - 리본, 고양이 귀, 깨진 헤일로, 뿔, 헤드폰, 보닛
  - 밴드, 하트 안대, 마스크, 글리터 눈물, 피어싱
  - 하트, 별, 글리치, 박쥐, 가시 오라
- `apps/client/src/AvatarPreview.tsx`
  - 같은 렌더러를 커스텀 미리보기와 프로필 카드에서 재사용
- `apps/client/src/WorldScene.tsx`
  - 동일 아바타를 Three.js nearest-neighbor sprite texture로 사용
  - `avatarConfigKey` 기반 텍스처 재생성, 불필요한 매 프레임 material 갱신 방지

### 5.3 커스터마이징 스튜디오

`apps/client/src/EntryGate.tsx`, `apps/client/src/styles.css`

- 야미카와이/파스텔 고스 전용 입장 화면으로 전면 교체
- 10개 카테고리 탭과 이름 있는 옵션 카드
- 대형 실시간 아바타 미리보기
- 랜덤 생성과 기본값 리셋
- 38,102,400 조합 수 표시
- 닉네임과 상태 메시지 유지
- 접근 가능한 `aria-pressed`
- 테스트 ID:
  - `avatar-category-{category}`
  - `avatar-{category}-{id}`
  - `avatar-randomize`
  - `avatar-reset`
  - `avatar-preview`
- 1440×900과 작은 데스크톱을 고려한 반응형/스크롤 CSS가 추가됨

### 5.4 저장·마이그레이션

`apps/client/src/adapters.ts`, `apps/client/src/adapters.test.ts`

- 프로필 키를 `enico.pixel-square.profile.v2`로 변경
- 구형 `enico.pixel-square.profile.v1`을 읽어 `DEFAULT_AVATAR`를 추가하고 v2로 저장하는 흐름 구현
- 손상된 JSON/아바타를 기본값으로 복구하는 흐름 구현
- LocalStorage migration 테스트 파일 추가

### 5.5 앱·서버·봇·테스트 연결

- `apps/client/src/App.tsx`
  - 접속자 색을 `avatarAccent`로 표시
  - 프로필 카드에 실제 AvatarPreview와 헤어/의상 요약 표시
  - footer accent도 AvatarConfig 기준
- `apps/server/src/app.ts`
  - 검증된 전체 아바타를 RuntimePlayer/snapshot에 포함
- `packages/game-domain/src/index.ts`
  - `validateProfile`에서 `isAvatarConfig` 검증
- `packages/test-bots/src/bot.ts`
  - 봇별 `createAvatarVariant(index)`를 사용하도록 변경
- protocol/domain/server/E2E fixture들이 새 AvatarConfig에 맞게 수정됨
- E2E는 여러 카테고리 변경, 저장 복원, 원격 프로필 아바타 확인을 포함하도록 확장됨

## 6. 현재 검증 상태 — 중요

인수인계서 작성 직전 실행 결과:

- `npm run lint`: **통과**
- `npm run typecheck`: **실패 1건**
- 이번 WIP 이후 `npm run test`, `npm run build`, Playwright, 20-bot load는 아직 최종 재실행하지 않음
- 따라서 이 체크포인트는 의도적으로 **WIP이며 배포 완료 상태가 아님**

현재 정확한 타입 오류:

```text
apps/client/src/adapters.ts:43:37 - TS2698
Spread types may only be created from object types.
const avatar = hasValidAvatar ? { ...candidate.avatar } : { ...DEFAULT_AVATAR };
```

권장 수정:

```ts
const candidateAvatar = candidate.avatar;
const avatar = isAvatarConfig(candidateAvatar)
  ? { ...candidateAvatar }
  : { ...DEFAULT_AVATAR };
```

boolean 별칭 `hasValidAvatar`를 통하면 `candidate.avatar`의 `unknown` narrowing이 유지되지 않는 TypeScript 문제다. `repairedAvatar`는 `!isAvatarConfig(candidateAvatar)` 결과를 별도로 저장하면 된다.

## 7. 다음 작업 순서

1. 위 `adapters.ts` narrowing 오류를 먼저 수정한다.
2. 아래 정적·단위 검사를 순서대로 실행하고 오류를 모두 수정한다.
   ```bash
   npm run lint
   npm run typecheck
   npm run test
   npm run build
   ```
3. `npm run dev` 후 1440×900에서 직접 확인한다.
   - 10개 탭 모두 클릭 가능
   - 모든 옵션 카드 선택 상태가 미리보기에 반영
   - 랜덤/리셋 정상
   - 세로 오버플로와 Enter 버튼 접근 가능
   - 기존 v1 LocalStorage 프로필이 v2로 자동 변환
4. 실제 브라우저 두 개로 서로 다른 아바타가 월드에서 구분되는지 확인한다.
5. 최종 자동 검증을 실행한다.
   ```bash
   npm run test:e2e
   npm run test:e2e:gpu
   npm run test:load
   npm audit --omit=dev
   ```
6. 실패가 없다면 마지막으로 전체 체인을 실행한다.
   ```bash
   npm run validate
   ```
7. E2E 스크린샷을 직접 읽어 캐릭터 얼굴, 액세서리, 프로필 카드, UI 잘림을 확인한다.
8. 완료 변경은 checkpoint를 amend하지 말고 새 커밋으로 추가한다.
   ```bash
   git add <수정한 파일들>
   git commit -m "feat: complete yami-kawaii avatar studio"
   git push origin feature/enico-veck-world
   ```

## 8. 완료 판정 기준

- 10개 커스텀 카테고리와 38,102,400개 조합이 실제 렌더링됨
- 선택한 모든 옵션이 LocalStorage 새로고침 후 복원됨
- 구형 v1 프로필이 유실 없이 v2로 마이그레이션됨
- 잘못된 옵션은 클라이언트와 서버에서 거부됨
- 두 브라우저에서 서로 다른 캐릭터가 동일 월드에 표시됨
- 프로필 카드가 실제 캐릭터와 스타일 요약을 표시함
- 봇 20명이 서로 다른 유효 AvatarConfig로 접속함
- lint, typecheck, unit/integration, build, headless E2E, headed GPU E2E, load 모두 통과
- 외부 API/원격 자산 요청 없음
- 기존 `main`과 `/Volumes/free/Enico Veck/website_enico` 변경 없음

## 9. 재개 명령

```bash
cd "/Volumes/free/enico-veck-world"
git switch feature/enico-veck-world
git pull --ff-only
npm install
npm run typecheck
```

현재 체크포인트부터 이어갈 때는 먼저 이 문서의 6번 타입 오류를 처리한다.
