import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// Financial documents must never be uploaded to the public product-image bucket.
function retired() {
  return NextResponse.json({ message: '이체 증빙 이미지 업로드는 종료되었습니다. 입금 확인은 고객센터로 문의해 주세요.' },
    { status: 410, headers: { 'Cache-Control': 'private, no-store' } });
}

export const GET = retired;
export const POST = retired;
