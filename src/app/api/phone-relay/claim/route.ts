import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

function retired() {
  return NextResponse.json({ message: '문자 발송 기능은 종료되었습니다.' }, {
    status: 410, headers: { 'Cache-Control': 'no-store' },
  });
}

export const GET = retired;
export const POST = retired;
