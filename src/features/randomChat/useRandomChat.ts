'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseClient } from '@/lib/supabaseClient';

export type RandomChatMessage = {
  id: number;
  roomId: string;
  userId: string;
  message: string;
  createdAt: string;
};

type ChatRoomStatus = 'active' | 'closed' | 'unknown';

type MessageRow = {
  id: number;
  room_id: string;
  user_id: string;
  message: string;
  created_at: string;
};

const DISPLAY_NAME_STORAGE_KEY = 'random_chat_display_name';
const DISPLAY_NAME_PREFIX = '익명_';
const MEMBER_REFRESH_MS = 10_000;

function generateDisplayName() {
  const digits = Math.floor(1000 + Math.random() * 9000);
  return `${DISPLAY_NAME_PREFIX}${digits}`;
}

function getOrCreateDisplayName() {
  if (typeof window === 'undefined') {
    return `${DISPLAY_NAME_PREFIX}0000`;
  }

  const existing = window.localStorage.getItem(DISPLAY_NAME_STORAGE_KEY);
  if (existing && existing.startsWith(DISPLAY_NAME_PREFIX)) {
    return existing;
  }

  const created = generateDisplayName();
  window.localStorage.setItem(DISPLAY_NAME_STORAGE_KEY, created);
  return created;
}

function normalizeRoomIdFromRpc(data: unknown): string {
  if (typeof data === 'string') return data;

  if (Array.isArray(data) && data.length > 0) {
    const first = data[0] as unknown;
    if (typeof first === 'string') return first;
    if (first && typeof first === 'object') {
      const obj = first as Record<string, unknown>;
      if (typeof obj.room_id === 'string') return obj.room_id;
      if (typeof obj.id === 'string') return obj.id;
    }
  }

  if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>;
    if (typeof obj.room_id === 'string') return obj.room_id;
    if (typeof obj.id === 'string') return obj.id;
  }

  return '';
}

function toUiMessage(row: MessageRow): RandomChatMessage {
  return {
    id: row.id,
    roomId: row.room_id,
    userId: row.user_id,
    message: row.message,
    createdAt: row.created_at,
  };
}

export function useRandomChat(enabled: boolean) {
  const clientRef = useRef<SupabaseClient | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const memberIntervalRef = useRef<number | null>(null);

  const [roomId, setRoomId] = useState('');
  const [messages, setMessages] = useState<RandomChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [myDisplayName, setMyDisplayName] = useState('');
  const [myUserId, setMyUserId] = useState('');
  const [memberCount, setMemberCount] = useState(0);
  const [roomStatus, setRoomStatus] = useState<ChatRoomStatus>('unknown');

  const getClient = useCallback(() => {
    if (clientRef.current) return clientRef.current;
    const client = getSupabaseClient();
    clientRef.current = client;
    return client;
  }, []);

  const clearMemberInterval = useCallback(() => {
    if (memberIntervalRef.current !== null) {
      window.clearInterval(memberIntervalRef.current);
      memberIntervalRef.current = null;
    }
  }, []);

  const clearChannel = useCallback(async () => {
    if (!channelRef.current || !clientRef.current) return;
    const channel = channelRef.current;
    channelRef.current = null;
    await clientRef.current.removeChannel(channel);
  }, []);

  const fetchMemberCount = useCallback(
    async (targetRoomId: string) => {
      const client = getClient();
      const { count, error: countError } = await client
        .from('chat_room_members')
        .select('*', { count: 'exact', head: true })
        .eq('room_id', targetRoomId);

      if (countError) {
        throw new Error(countError.message);
      }

      setMemberCount(typeof count === 'number' ? count : 0);
    },
    [getClient],
  );

  const fetchRoomStatus = useCallback(
    async (targetRoomId: string) => {
      const client = getClient();
      const { data, error: statusError } = await client
        .from('chat_rooms')
        .select('status')
        .eq('id', targetRoomId)
        .maybeSingle();

      if (statusError) {
        throw new Error(statusError.message);
      }

      if (!data) {
        setRoomStatus('unknown');
        return;
      }

      setRoomStatus(data.status === 'closed' ? 'closed' : 'active');
    },
    [getClient],
  );

  const sendMessage = useCallback(
    async (text: string) => {
      const client = getClient();
      const message = text.trim();
      if (!message) return;
      if (!roomId || !myUserId) {
        throw new Error('채팅방 매칭이 완료되지 않았습니다.');
      }
      if (roomStatus === 'closed') {
        throw new Error('현재 방이 종료되어 메시지를 보낼 수 없습니다. 새로 매칭해 주세요.');
      }

      const { data, error: insertError } = await client
        .from('chat_room_messages')
        .insert({
          room_id: roomId,
          user_id: myUserId,
          message,
        })
        .select('id, room_id, user_id, message, created_at')
        .single();

      if (insertError) {
        throw new Error(insertError.message);
      }

      const next = toUiMessage(data as MessageRow);
      setMessages((prev) => {
        if (prev.some((item) => item.id === next.id)) return prev;
        return [...prev, next];
      });
    },
    [getClient, myUserId, roomId, roomStatus],
  );

  useEffect(() => {
    if (!enabled) {
      setError(null);
      clearMemberInterval();
      void clearChannel();
      return;
    }

    let cancelled = false;

    const start = async () => {
      setLoading(true);
      setError(null);
      setMyDisplayName(getOrCreateDisplayName());

      try {
        const client = getClient();

        const {
          data: { session },
          error: sessionError,
        } = await client.auth.getSession();

        if (sessionError) {
          throw new Error(sessionError.message);
        }

        let nextUserId = session?.user?.id || '';

        if (!nextUserId) {
          const { data: anonymousData, error: anonymousError } = await client.auth.signInAnonymously();
          if (anonymousError) {
            throw new Error(
              anonymousError.message.includes('provider is not enabled')
                ? 'Supabase에서 Anonymous 로그인 Provider를 활성화해야 합니다.'
                : anonymousError.message,
            );
          }
          nextUserId = anonymousData.user?.id || '';
        }

        if (!nextUserId) {
          throw new Error('로그인 세션을 생성하지 못했습니다.');
        }

        if (cancelled) return;
        setMyUserId(nextUserId);

        const { data: roomData, error: roomError } = await client.rpc('match_room');
        if (roomError) {
          throw new Error(roomError.message);
        }

        const nextRoomId = normalizeRoomIdFromRpc(roomData);
        if (!nextRoomId) {
          throw new Error('방 매칭 결과가 올바르지 않습니다.');
        }

        if (cancelled) return;
        setRoomId(nextRoomId);

        const { data: initialMessages, error: initialMessagesError } = await client
          .from('chat_room_messages')
          .select('id, room_id, user_id, message, created_at')
          .eq('room_id', nextRoomId)
          .order('created_at', { ascending: true })
          .limit(300);

        if (initialMessagesError) {
          throw new Error(initialMessagesError.message);
        }

        if (cancelled) return;
        setMessages(((initialMessages || []) as MessageRow[]).map(toUiMessage));

        await Promise.all([fetchMemberCount(nextRoomId), fetchRoomStatus(nextRoomId)]);

        const channel = client
          .channel(`random-chat:${nextRoomId}:${Date.now()}`)
          .on(
            'postgres_changes',
            {
              event: 'INSERT',
              schema: 'public',
              table: 'chat_room_messages',
              filter: `room_id=eq.${nextRoomId}`,
            },
            (payload) => {
              const row = payload.new as MessageRow;
              const next = toUiMessage(row);
              setMessages((prev) => {
                if (prev.some((item) => item.id === next.id)) return prev;
                return [...prev, next];
              });
            },
          )
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'chat_room_members',
              filter: `room_id=eq.${nextRoomId}`,
            },
            () => {
              void fetchMemberCount(nextRoomId).catch(() => undefined);
            },
          )
          .on(
            'postgres_changes',
            {
              event: 'UPDATE',
              schema: 'public',
              table: 'chat_rooms',
              filter: `id=eq.${nextRoomId}`,
            },
            (payload) => {
              const nextStatus = (payload.new as { status?: string })?.status;
              if (nextStatus === 'closed') {
                setRoomStatus('closed');
              } else if (nextStatus === 'active') {
                setRoomStatus('active');
              }
            },
          );

        channel.subscribe();
        channelRef.current = channel;

        clearMemberInterval();
        memberIntervalRef.current = window.setInterval(() => {
          void fetchMemberCount(nextRoomId).catch(() => undefined);
        }, MEMBER_REFRESH_MS);
      } catch (nextError) {
        if (!cancelled) {
          setError(nextError instanceof Error ? nextError.message : '랜덤채팅 연결에 실패했습니다.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void start();

    return () => {
      cancelled = true;
      clearMemberInterval();
      void clearChannel();
    };
  }, [clearChannel, clearMemberInterval, enabled, fetchMemberCount, fetchRoomStatus, getClient]);

  return {
    roomId,
    messages,
    loading,
    error,
    myDisplayName,
    myUserId,
    memberCount,
    roomStatus,
    sendMessage,
  };
}
