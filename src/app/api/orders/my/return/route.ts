import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { isMemberOrderOwner } from '@/lib/orders/memberOrderOwnership';
import { parseOrderRawPayload } from '@/lib/orders/rawPayload';
import { getReturnEligibility } from '@/lib/orders/returnPolicy';
import { isVerifiedMember } from '@/lib/security/identity';
import { readJsonObject, RequestBodyError } from '@/lib/security/requestBody';
import { assertExpectedSupabaseProject } from '@/lib/supabase/projectGuard';

const ORDER_SELECT = 'id,channel,payment_method,payment_status,shipping_status,delivered_at,raw_payload';
const NO_STORE = { 'Cache-Control': 'private, no-store' };
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: NO_STORE });

async function requestReturn(request: Request) {
  const token = (request.headers.get('authorization') || '').match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (!token) return json({ message: '로그인이 필요합니다.' }, 401);

  const url = assertExpectedSupabaseProject(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!anonKey || !serviceKey) return json({ message: '반품 신청을 처리하지 못했습니다. 잠시 후 다시 확인해 주세요.' }, 503);
  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  const { data: { user }, error: authError } = await createClient(url, anonKey, options).auth.getUser(token);
  if (authError || !isVerifiedMember(user)) return json({ message: '로그인이 필요합니다.' }, 401);

  let payload: Record<string, unknown>;
  try {
    payload = await readJsonObject(request, 4096);
  } catch (error) {
    return json({ message: '잘못된 요청 본문입니다.' }, error instanceof RequestBodyError ? error.status : 400);
  }
  const id = typeof payload.id === 'string' ? payload.id.trim() : '';
  const reason = typeof payload.reason === 'string' ? payload.reason.trim() : '';
  if (!id || id.length > 100 || /[\u0000-\u001f\u007f]/.test(id)
    || !reason || reason.length > 1000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(reason)) {
    return json({ message: '주문과 반품 사유를 확인해 주세요. 사유는 1,000자 이내로 입력해 주세요.' }, 400);
  }

  const client = createClient(url, serviceKey, options);
  const { data: existing, error: readError } = await client.from('orders').select(ORDER_SELECT)
    .eq('id', id).eq('channel', 'member').eq('raw_payload->>customerUserId', user.id).maybeSingle();
  if (readError) return json({ message: '주문을 확인하지 못했습니다. 잠시 후 다시 확인해 주세요.' }, 503);
  if (!existing || !isMemberOrderOwner(existing, user.id)) return json({ message: '반품 신청 가능한 회원 주문을 찾지 못했습니다.' }, 404);

  const now = Date.now();
  const eligibility = getReturnEligibility(existing, now);
  if (!eligibility.eligible) {
    return json({ message: eligibility.reason === 'already_requested'
      ? '이미 반품 신청 내역이 있습니다. 주문을 새로고침해 주세요.'
      : '현재 이 주문은 온라인 반품 신청이 어렵습니다. 주문번호와 함께 고객센터로 문의해 주세요.',
    returnEligibility: eligibility }, 409);
  }

  const requestedAt = new Date(now).toISOString();
  const raw = parseOrderRawPayload(existing.raw_payload) || {};
  const rawPayload = { ...raw, returnRequest: { status: 'requested', requestedAt, requestedBy: 'member',
    requestedByUserId: user.id, reason } };
  // Compare the complete payload and eligibility fields: concurrent payment,
  // notification, owner or return changes must never be overwritten.
  let update = client.from('orders').update({ raw_payload: rawPayload, updated_at: requestedAt })
    .eq('id', id).eq('channel', 'member').eq('raw_payload->>customerUserId', user.id);
  for (const field of ['payment_method', 'payment_status', 'shipping_status', 'delivered_at'] as const) {
    update = existing[field] === null ? update.is(field, null) : update.eq(field, existing[field]);
  }
  update = existing.raw_payload === null ? update.is('raw_payload', null)
    : update.eq('raw_payload', JSON.stringify(existing.raw_payload));
  const { data: saved, error: saveError } = await update.select(ORDER_SELECT).maybeSingle();
  if (saveError) return json({ message: '반품 신청 결과를 확인하지 못했습니다. 다시 신청하기 전에 주문을 새로고침해 주세요.' }, 503);
  if (!saved) return json({ message: '주문 상태가 변경되었습니다. 새로고침한 뒤 다시 확인해 주세요.' }, 409);

  return json({ saved: true, message: '반품 신청이 접수되었습니다. 접수 내용 확인 후 반송 방법을 안내해 드립니다. 환불은 아직 진행되지 않았습니다.',
    returnEligibility: getReturnEligibility(saved, now) });
}

export async function POST(request: Request) {
  try {
    return await requestReturn(request);
  } catch {
    return json({ message: '반품 신청 결과를 확인하지 못했습니다. 다시 신청하기 전에 주문을 새로고침해 주세요.' }, 503);
  }
}
