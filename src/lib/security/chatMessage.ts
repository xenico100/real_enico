import { RequestBodyError } from '@/lib/security/requestBody';

const ROOM_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseChatMessage(body: Record<string, unknown>) {
  const roomId = body.roomId;
  const rawMessage = body.message;
  if (typeof roomId !== 'string' || !ROOM_ID_PATTERN.test(roomId) || typeof rawMessage !== 'string') {
    throw new RequestBodyError('채팅 요청이 올바르지 않습니다.');
  }

  const message = rawMessage.trim();
  if (message.length === 0 || Array.from(message).length > 500) {
    throw new RequestBodyError('메시지는 1~500자로 입력해 주세요.');
  }

  return { roomId: roomId.toLowerCase(), message };
}
