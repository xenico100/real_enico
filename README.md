# real_enico

Next.js(App Router) 기반 쇼핑/컬렉션 UI 프로젝트입니다.

## Run

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```


## Cloudflare R2 image storage (의류/컬렉션)

관리자 업로드 이미지는 이제 Supabase Storage 대신 Cloudflare R2를 사용합니다.

사용 버킷명은 `product-images`로 고정되어 있습니다.

필수 환경변수:

```bash
CLOUDFLARE_R2_ACCOUNT_ID=...
CLOUDFLARE_R2_ACCESS_KEY_ID=...
CLOUDFLARE_R2_SECRET_ACCESS_KEY=...
CLOUDFLARE_R2_PUBLIC_BASE_URL=https://<public-domain-or-r2-dev-url>
```

일회성 SmartStore 가져오기·이미지 일괄 이전 관리자 화면과 API는 운영 관리에서 제거했습니다.
상품·컬렉션 편집기의 이미지 업로드를 사용하세요.
