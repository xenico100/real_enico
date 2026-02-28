'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseClient } from '@/lib/supabaseClient';

export type RandomChatMessage = {
  id: string;
  roomId: string;
  userId: string;
  message: string;
  createdAt: string;
};

type ChatRoomStatus = 'active' | 'closed' | 'unknown';

type MessageRow = {
  id: number | string;
  room_id: string;
  user_id: string;
  message: string;
  created_at: string;
};

type TypingPayload = {
  roomId?: string;
  userId?: string;
  displayName?: string;
  isTyping?: boolean;
};

const DISPLAY_NAME_STORAGE_KEY = 'random_chat_display_name';
const DISPLAY_NAME_PREFIX = '익명_';
const MEMBER_REFRESH_MS = 10_000;
const MESSAGE_REFRESH_MS = 2_000;
const TYPING_TIMEOUT_MS = 2_500;
const TYPING_THROTTLE_MS = 600;

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
    id: String(row.id),
    roomId: row.room_id,
    userId: row.user_id,
    message: row.message,
    createdAt: row.created_at,
  };
}

function fallbackDisplayNameFromUserId(userId: string) {
  return `익명_${userId.replace(/-/g, '').slice(0, 4)}`;
}

export function useRandomChat(enabled: boolean) {
  const clientRef = useRef<SupabaseClient | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const memberIntervalRef = useRef<number | null>(null);
  const messageIntervalRef = useRef<number | null>(null);
  const typingTimersRef = useRef<Record<string, number>>({});
  const typingUsersByIdRef = useRef<Record<string, string>>({});
  const typingLastSentAtRef = useRef(0);
  const isTypingRef = useRef(false);
  const myDisplayNameRef = useRef('');

  const [roomId, setRoomId] = useState('');
  const [messages, setMessages] = useState<RandomChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [myDisplayName, setMyDisplayName] = useState('');
  const [myUserId, setMyUserId] = useState('');
  const [memberCount, setMemberCount] = useState(0);
  const [roomStatus, setRoomStatus] = useState<ChatRoomStatus>('unknown');
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [realtimeConnected, setRealtimeConnected] = useState(false);

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

  const clearMessageInterval = useCallback(() => {
    if (messageIntervalRef.current !== null) {
      window.clearInterval(messageIntervalRef.current);
      messageIntervalRef.current = null;
    }
  }, []);

  const clearTypingState = useCallback(() => {
    Object.values(typingTimersRef.current).forEach((timerId) => {
      window.clearTimeout(timerId);
    });
    typingTimersRef.current = {};
    typingUsersByIdRef.current = {};
    setTypingUsers([]);
    isTypingRef.current = false;
  }, []);

  const clearChannel = useCallback(async () => {
    if (!channelRef.current || !clientRef.current) return;
    const channel = channelRef.current;
    channelRef.current = null;
    setRealtimeConnected(false);
    await clientRef.current.removeChannel(channel);
  }, []);

  const updateMemberCountFromPresence = useCallback((channel: RealtimeChannel) => {
    const presenceState = channel.presenceState() as Record<string, unknown[]>;
    const keys = Object.keys(presenceState);
    if (keys.length > 0) {
      setMemberCount(keys.length);
      return true;
    }
    return false;
  }, []);

  const appendMessages = useCallback((rows: MessageRow[]) => {
    if (rows.length === 0) return;

    setMessages((prev) => {
      const map = new Map<string, RandomChatMessage>();
      for (const item of prev) {
        map.set(item.id, item);
      }
      for (const row of rows) {
        map.set(String(row.id), toUiMessage(row));
      }
      return Array.from(map.values()).sort((a, b) => {
        const aId = Number(a.id);
        const bId = Number(b.id);
        if (Number.isFinite(aId) && Number.isFinite(bId)) {
          return aId - bId;
        }
        return a.createdAt.localeCompare(b.createdAt);
      });
    });
  }, []);

  const fetchLatestMessages = useCallback(
    async (targetRoomId: string) => {
      const client = getClient();
      const { data, error: queryError } = await client
        .from('chat_room_messages')
        .select('id, room_id, user_id, message, created_at')
        .eq('room_id', targetRoomId)
        .order('id', { ascending: false })
        .limit(300);

      if (queryError) {
        throw new Error(queryError.message);
      }

      const rows = ((data || []) as MessageRow[]).reverse();
      appendMessages(rows);
    },
    [appendMessages, getClient],
  );

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

  const setTyping = useCallback(
    async (isTyping: boolean) => {
      if (!roomId || !myUserId || roomStatus === 'closed') return;
      const channel = channelRef.current;
      if (!channel) return;

      if (isTyping) {
        const now = Date.now();
        if (now - typingLastSentAtRef.current < TYPING_THROTTLE_MS) {
          return;
        }
        typingLastSentAtRef.current = now;
      }

      if (isTypingRef.current === isTyping && !isTyping) {
        return;
      }

      isTypingRef.current = isTyping;

      await channel.send({
        type: 'broadcast',
        event: 'typing',
        payload: {
          roomId,
          userId: myUserId,
          displayName: myDisplayNameRef.current || myDisplayName || `${DISPLAY_NAME_PREFIX}0000`,
          isTyping,
        } satisfies TypingPayload,
      });
    },
    [myDisplayName, myUserId, roomId, roomStatus],
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

      appendMessages([data as MessageRow]);
      void setTyping(false).catch(() => undefined);
    },
    [appendMessages, getClient, myUserId, roomId, roomStatus, setTyping],
  );

  useEffect(() => {
    if (!enabled) {
      setError(null);
      setRealtimeConnected(false);
      clearMemberInterval();
      clearMessageInterval();
      clearTypingState();
      void clearChannel();
      return;
    }

    let cancelled = false;

    const start = async () => {
      setLoading(true);
      setError(null);
      setMessages([]);
      setTypingUsers([]);
      setRealtimeConnected(false);
      setMemberCount(0);
      setRoomStatus('unknown');

      const displayName = getOrCreateDisplayName();
      setMyDisplayName(displayName);
      myDisplayNameRef.current = displayName;

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
            const lower = anonymousError.message.toLowerCase();
            const isAnonymousDisabled =
              lower.includes('provider is not enabled') ||
              lower.includes('anonymous sign-ins are disabled') ||
              lower.includes('anonymous sign in is disabled');
            throw new Error(
              isAnonymousDisabled
                ? '익명 채팅이 비활성화되어 있습니다. Supabase Auth에서 Anonymous Sign-Ins를 켜거나, 로그인 후 이용하세요.'
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
          .order('id', { ascending: true })
          .limit(300);

        if (initialMessagesError) {
          throw new Error(initialMessagesError.message);
        }

        if (cancelled) return;
        appendMessages((initialMessages || []) as MessageRow[]);

        await Promise.all([fetchMemberCount(nextRoomId), fetchRoomStatus(nextRoomId)]);

        const channel = client
          .channel(`random-chat:${nextRoomId}`, {
            config: {
              broadcast: { self: false },
              presence: { key: nextUserId },
            },
          })
          .on(
            'postgres_changes',
            {
              event: 'INSERT',
              schema: 'public',
              table: 'chat_room_messages',
              filter: `room_id=eq.${nextRoomId}`,
            },
            (payload) => {
              if (process.env.NODE_ENV !== 'production') {
                console.log('REALTIME INSERT', payload);
              }
              appendMessages([payload.new as MessageRow]);
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
          .on('presence', { event: 'sync' }, () => {
            const applied = updateMemberCountFromPresence(channel);
            if (!applied) {
              void fetchMemberCount(nextRoomId).catch(() => undefined);
            }
          })
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
          )
          .on('broadcast', { event: 'typing' }, (payload) => {
            const data = (payload.payload || null) as TypingPayload | null;
            if (!data || typeof data.userId !== 'string') return;
            if (data.userId === nextUserId) return;
            const targetUserId = data.userId;

            const label =
              typeof data.displayName === 'string' && data.displayName.trim()
                ? data.displayName.trim()
                : fallbackDisplayNameFromUserId(targetUserId);

            if (data.isTyping) {
              typingUsersByIdRef.current[targetUserId] = label;
              setTypingUsers(Object.values(typingUsersByIdRef.current));

              if (typingTimersRef.current[targetUserId]) {
                window.clearTimeout(typingTimersRef.current[targetUserId]);
              }

              typingTimersRef.current[targetUserId] = window.setTimeout(() => {
                delete typingUsersByIdRef.current[targetUserId];
                delete typingTimersRef.current[targetUserId];
                setTypingUsers(Object.values(typingUsersByIdRef.current));
              }, TYPING_TIMEOUT_MS);
            } else {
              if (typingTimersRef.current[targetUserId]) {
                window.clearTimeout(typingTimersRef.current[targetUserId]);
                delete typingTimersRef.current[targetUserId];
              }

              delete typingUsersByIdRef.current[targetUserId];
              setTypingUsers(Object.values(typingUsersByIdRef.current));
            }
          });

        channel.subscribe((status) => {
          if (process.env.NODE_ENV !== 'production') {
            console.log('REALTIME STATUS:', status);
          }
          if (cancelled) return;
          if (status === 'SUBSCRIBED') {
            setRealtimeConnected(true);
            void channel.track({
              user_id: nextUserId,
              display_name: myDisplayNameRef.current || `${DISPLAY_NAME_PREFIX}0000`,
              online_at: new Date().toISOString(),
            });
            window.setTimeout(() => {
              updateMemberCountFromPresence(channel);
            }, 120);
            return;
          }
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            setRealtimeConnected(false);
          }
        });

        channelRef.current = channel;

        clearMemberInterval();
        memberIntervalRef.current = window.setInterval(() => {
          void fetchMemberCount(nextRoomId).catch(() => undefined);
        }, MEMBER_REFRESH_MS);

        clearMessageInterval();
        messageIntervalRef.current = window.setInterval(() => {
          void fetchLatestMessages(nextRoomId).catch(() => undefined);
        }, MESSAGE_REFRESH_MS);
        void fetchLatestMessages(nextRoomId).catch(() => undefined);
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
      clearMessageInterval();
      clearTypingState();
      void clearChannel();
    };
  }, [
    appendMessages,
    clearChannel,
    clearMemberInterval,
    clearMessageInterval,
    clearTypingState,
    enabled,
    fetchLatestMessages,
    fetchMemberCount,
    fetchRoomStatus,
    getClient,
    updateMemberCountFromPresence,
  ]);

  useEffect(() => {
    if (!enabled || !roomId) return;

    const syncNow = () => {
      void fetchLatestMessages(roomId).catch(() => undefined);
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        syncNow();
      }
    };

    window.addEventListener('focus', syncNow);
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      window.removeEventListener('focus', syncNow);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [enabled, fetchLatestMessages, roomId]);

  return {
    roomId,
    messages,
    loading,
    error,
    myDisplayName,
    myUserId,
    memberCount,
    roomStatus,
    typingUsers,
    realtimeConnected,
    sendMessage,
    setTyping,
  };
}
