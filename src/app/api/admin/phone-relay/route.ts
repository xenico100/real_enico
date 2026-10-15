import { NextResponse } from 'next/server';
import { authorizePhoneRelayOwner, getPhoneRelayHealth, managePhoneRelay, PHONE_RELAY_HEADERS, readPhoneRelayBody } from '@/lib/orders/phoneRelay';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export async function GET(request: Request) {
  const auth = await authorizePhoneRelayOwner(request);
  if ('response' in auth) return auth.response;
  return NextResponse.json(await getPhoneRelayHealth(auth.client), { headers: PHONE_RELAY_HEADERS });
}
export async function POST(request: Request) {
  const auth = await authorizePhoneRelayOwner(request);
  if ('response' in auth) return auth.response;
  const body = await readPhoneRelayBody(request);
  if (!body || typeof body.action !== 'string' || Object.keys(body).some(key => key !== 'action')) {
    return NextResponse.json({ message: 'Invalid request.' }, { status: 400, headers: PHONE_RELAY_HEADERS });
  }
  const result = await managePhoneRelay(auth.client, body.action);
  return NextResponse.json(result.body, { status: result.status, headers: PHONE_RELAY_HEADERS });
}
