import { useCallback, useEffect, useRef, useState } from 'react';
import {
  type ChatMessage,
  type EmoteEvent,
  type EmoteId,
  type InputPayload,
  type PlayerProfile,
  type ServerErrorPayload,
  type ServerNotice,
  type WorldSnapshot,
} from '@enico/protocol';
import {
  createRealtimeTransport,
  type ConnectionStatus,
  type RealtimeTransport,
} from './adapters';

const EMPTY_WORLD: WorldSnapshot = {
  tick: 0,
  serverTime: 0,
  players: [],
};

export interface FloatingMessage {
  text: string;
  expiresAt: number;
}

export interface ActiveEmote {
  emote: EmoteId;
  expiresAt: number;
}

export function useRealtimeWorld(profile: PlayerProfile | null, sessionId: string) {
  const [status, setStatus] = useState<ConnectionStatus>('offline');
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [world, setWorld] = useState<WorldSnapshot>(EMPTY_WORLD);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [notices, setNotices] = useState<ServerNotice[]>([]);
  const [error, setError] = useState<ServerErrorPayload | null>(null);
  const [latencyMs, setLatencyMs] = useState(0);
  const [bubbles, setBubbles] = useState<Record<string, FloatingMessage>>({});
  const [emotes, setEmotes] = useState<Record<string, ActiveEmote>>({});
  const transportRef = useRef<RealtimeTransport | null>(null);

  useEffect(() => {
    if (!profile) {
      setStatus('offline');
      setPlayerId(null);
      setWorld(EMPTY_WORLD);
      return;
    }

    const serverUrl = import.meta.env.VITE_SERVER_URL ?? 'http://127.0.0.1:3001';
    const adapter = import.meta.env.VITE_REALTIME_ADAPTER ?? 'socketio';
    const transport = createRealtimeTransport(adapter, serverUrl);
    transportRef.current = transport;

    transport.connect(
      { profile, sessionId },
      {
        onConnection: setStatus,
        onReady: (payload) => {
          setPlayerId(payload.playerId);
          setWorld(payload.snapshot);
          setError(null);
        },
        onSnapshot: (snapshot) => {
          setWorld(snapshot);
          setLatencyMs(Math.max(0, Date.now() - snapshot.serverTime));
        },
        onChat: (message) => {
          setMessages((current) => [...current.slice(-79), message]);
          setBubbles((current) => ({
            ...current,
            [message.senderId]: {
              text: message.text,
              expiresAt: Date.now() + 4_500,
            },
          }));
        },
        onEmote: (event: EmoteEvent) => {
          setEmotes((current) => ({
            ...current,
            [event.playerId]: { emote: event.emote, expiresAt: Date.now() + 2_200 },
          }));
        },
        onNotice: (notice) => setNotices((current) => [...current.slice(-7), notice]),
        onError: setError,
      },
    );

    return () => {
      transport.dispose();
      transportRef.current = null;
      setStatus('offline');
      setPlayerId(null);
    };
  }, [profile, sessionId]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const now = Date.now();
      setBubbles((current) =>
        Object.fromEntries(Object.entries(current).filter(([, bubble]) => bubble.expiresAt > now)),
      );
      setEmotes((current) =>
        Object.fromEntries(Object.entries(current).filter(([, emote]) => emote.expiresAt > now)),
      );
    }, 500);
    return () => window.clearInterval(timer);
  }, []);

  const sendInput = useCallback((input: InputPayload) => {
    transportRef.current?.sendInput(input);
  }, []);

  const sendChat = useCallback((text: string) => {
    transportRef.current?.sendChat(text);
  }, []);

  const sendEmote = useCallback((emote: EmoteId) => {
    transportRef.current?.sendEmote(emote);
  }, []);

  return {
    status,
    playerId,
    world,
    messages,
    notices,
    error,
    latencyMs,
    bubbles,
    emotes,
    sendInput,
    sendChat,
    sendEmote,
    clearError: () => setError(null),
  };
}
