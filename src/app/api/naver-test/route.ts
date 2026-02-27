import { NextResponse } from 'next/server';
import { getAccessToken } from '@/lib/naverCommerce';

export async function GET() {
  try {
    const data = await getAccessToken();
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : 'token fetch failed',
      },
      { status: 500 },
    );
  }
}
