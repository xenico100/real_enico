import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { parseChatMessage } from '@/lib/security/chatMessage';
import { readJsonObject, RequestBodyError } from '@/lib/security/requestBody';
import { requestBudget } from '@/lib/security/requestBudget';
import { getSupabaseAdminClient } from '@/lib/supabaseAdmin';
import { assertExpectedSupabaseProject } from '@/lib/supabase/projectGuard';

const NO_STORE = { 'Cache-Control': 'private, no-store, max-age=0' };

function reply(message: string, status: number) {
  return NextResponse.json({ message }, { status, headers: NO_STORE });
}

export async function POST(request: Request) {
  const ipBudget = await requestBudget(request, 'chat-message-ip', 60, 60);
  if (ipBudget) return ipBudget;

  const authHeader = request.headers.get('authorization') || '';
  const token = authHeader.toLowerCase().startsWith('bearer ')
    ? authHeader.slice(7).trim()
    : '';
  if (!token) return reply('로그인이 필요합니다.', 401);

  let roomId: string;
  let message: string;
  try {
    ({ roomId, message } = parseChatMessage(await readJsonObject(request, 2048)));
  } catch (error) {
    if (error instanceof RequestBodyError) return reply(error.message, error.status);
    return reply('채팅 요청을 처리하지 못했습니다.', 400);
  }

  try {
    const url = assertExpectedSupabaseProject(
      process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    );
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anonKey) return reply('채팅 설정을 확인하지 못했습니다.', 503);

    const authClient = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: { user }, error: authError } = await authClient.auth.getUser(token);
    if (authError || !user) return reply('로그인이 필요합니다.', 401);

    const memberBudget = await requestBudget(request, 'chat-message-user', 20, 60, user.id);
    if (memberBudget) return memberBudget;

    const db = getSupabaseAdminClient();
    const { data: membership, error: membershipError } = await db
      .from('chat_room_members')
      .select('room_id')
      .eq('room_id', roomId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (membershipError) return reply('채팅방을 확인하지 못했습니다.', 503);
    if (!membership) return reply('채팅방에 참여 중이지 않습니다.', 403);

    const { data: room, error: roomError } = await db
      .from('chat_rooms')
      .select('status')
      .eq('id', roomId)
      .maybeSingle();
    if (roomError) return reply('채팅방을 확인하지 못했습니다.', 503);
    if (room?.status !== 'active') return reply('종료된 채팅방입니다. 새로 매칭해 주세요.', 409);

    const { data, error: insertError } = await db
      .from('chat_room_messages')
      .insert({ room_id: roomId, user_id: user.id, message })
      .select('id, room_id, user_id, message, created_at')
      .single();
    if (insertError || !data) return reply('메시지를 보내지 못했습니다.', 503);
    return NextResponse.json(data, { status: 201, headers: NO_STORE });
  } catch {
    return reply('채팅 요청을 처리하지 못했습니다.', 503);
  }
}
