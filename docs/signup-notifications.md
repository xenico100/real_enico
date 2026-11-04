# 신규 회원가입 관리자 이메일 알림

가입 알림은 `src/lib/auth/signupNotification.ts`의 서버 함수 하나로 처리합니다. 서버는 전달받은 ID로 Supabase Auth를 다시 조회하며, 익명 채팅 계정과 이메일 없는 계정은 발송 대상에서 제외합니다. 가입 후 24시간 이내인 실제 이메일 계정만 처리합니다. 데이터베이스 INSERT 알림은 이메일 인증 전 가입도 처리하고, 브라우저 보조 경로는 인증된 회원 세션을 요구합니다.

## 운영 설정

- `RESEND_API_KEY`: 기존 Resend 발송 키.
- `AUTH_FROM_EMAIL`: 가입 알림 발신자. 없으면 기존 `ORDER_FROM_EMAIL`, 그다음 Resend onboarding 발신자를 사용합니다.
- `SIGNUP_NOTIFICATION_EMAIL`: 관리자 수신자. 없으면 기존 `ORDER_NOTIFICATION_EMAIL`, 그다음 기존 주 관리자 수신자를 사용합니다.
- `SIGNUP_NOTIFICATION_WEBHOOK_SECRET`: 서버 전용 랜덤 비밀값, 32자 이상. 공개 환경변수로 저장하면 안 됩니다.
- `SIGNUP_NOTIFICATION_ENABLED_AT`: 알림을 켠 시각의 ISO 8601 값. 설정 시 이 시각 이전에 가입한 계정은 알리지 않습니다. 잘못된 값은 발송을 중단합니다. 없으면 기존 24시간 제한만 적용합니다.
- `SIGNUP_NOTIFICATION_RELAY_SECRET`: 몽상인 서버와 에니코의 고정 가입 알림 relay가 공유하는 48바이트 이상 서버 전용 비밀값. Supabase/Resend 키와 별도이며 공개하면 안 됩니다.
- 기존 `SUPABASE_SERVICE_ROLE_KEY`와 Supabase 프로젝트 URL은 서버에 유지합니다.

Supabase `auth.users`의 INSERT 이벤트를 다음 서버 경로로 연결합니다. 원시 회원정보는 전송할 필요가 없습니다.

```text
POST https://enicoveck.com/api/auth/signup-webhook
Content-Type: application/json
x-signup-webhook-secret: <서버 비밀값>
```

```json
{"type":"INSERT","schema":"auth","table":"users","record":{"id":"<신규 Auth UUID>"}}
```

웹훅에서 이메일·수신자·익명 여부 등을 덧붙여도 서버는 이 값을 신뢰하지 않습니다. Auth에서 직접 읽은 계정만 판단합니다. HTTP 503/429 응답은 동일 이벤트로 재시도할 수 있습니다. 웹훅 발신 측에서도 재시도를 설정해야 일시적인 서버 장애를 복구할 수 있습니다.

같은 비밀 헤더로 `POST /api/auth/signup-sweep`를 주기적으로 호출하면 놓친 신규 가입을 복구합니다. 이 경로는 페이지당 1,000명·최대 20페이지를 검사하고, 한 번에 최대 10명·동시 2건만 처리합니다. 처리시간이 부족하거나 작업·페이지 한도에 걸리면 `partial`과 `more`를 반환하며, 회원정보 대신 처리 건수만 응답합니다. 오래된 계정·익명 채팅 계정·이미 처리된 계정은 제외합니다.

`POST /api/auth/signup-relay`는 몽상인 서버에서 이미 실제 Auth 계정을 확인한 이벤트를 전달하는 서버 전용 경로입니다. `x-signup-relay-secret`으로 인증하고 16KiB 이하의 `{site:"mongsangin",userId:"UUID",createdAt:"ISO"}`만 받습니다. 수신자·발신자·본문을 요청으로 지정할 수 없고, 실제 발송은 에니코의 고정 관리자·기존 발신자·기존 Resend 키를 사용합니다. 가입 시각·활성화 시각 제한과 같은 멱등 키를 적용하며 공급자 영수증 ID만 돌려줍니다.

현재 운영 구성은 몽상인 저장소의 `supabase/migrations/*_signup_notifications.sql`을 기준으로 합니다. 몽상인 Auth INSERT는 즉시 웹훅을 요청하고, 몽상인의 pg_cron이 5분마다 두 사이트의 signup sweep를 호출합니다. 에니코 DB의 직접 INSERT 웹훅은 선택 사항이며, 에니코는 callback·브라우저 보조 처리와 주기적인 서버 sweep로 이메일 미인증 신규 가입까지 확인합니다. 이 설명은 운영 연결 구조이며 실제 수신함 도착을 확인했다는 뜻은 아닙니다.

## 중복 방지와 실패 복구

동일 회원은 Resend의 동일 `Idempotency-Key`로 호출하며, 본문은 회원 ID·가입 시각·관리자 페이지 링크로 고정합니다. 중간에 연락처를 수정해도 재시도 본문이 바뀌지 않습니다. Resend 수락 후 Auth의 서버 전용 `app_metadata.signup_admin_notification_sent_at` 및 공급자 영수증 ID를 저장합니다. 이미 수락한 이벤트는 다시 발송하지 않습니다. 공급자 수락은 수신함 도착 확인과 구분합니다.

기존의 발송 전 1회/24시간 예산 소모를 없앴습니다. 인증된 브라우저 경로에는 6회/분 예산을 적용하고, 전송 실패에는 제한된 재시도를 합니다. 인증 callback은 Next.js `after()`로 응답 뒤에 같은 서버 함수를 실행해 로그인 이동을 지연시키지 않습니다. 모든 경로는 같은 중복 방지 키와 영수증을 공유합니다.

## 검증

`npm run test:signup-notifications`는 실제 DB와 메일 API에 접근하지 않는 고정 응답 테스트입니다. 익명 제외, 위조 웹훅, JSON 크기, 중복 방지, 공급자 실패 후 재시도, 영수증 저장 실패를 확인합니다. 운영 웹훅·환경변수 등록과 실제 수신 여부는 코드 검증과 별도로 확인해야 합니다.
