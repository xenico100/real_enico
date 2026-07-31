import {
  createId,
  isPaletteId,
  type ChatMessage,
  type EmoteEvent,
  type EmoteId,
  type InputPayload,
  type JoinPayload,
  type PlayerProfile,
  type ServerErrorPayload,
  type ServerNotice,
  type ServerToClientEvents,
  type ClientToServerEvents,
  type SessionReadyPayload,
  type WorldSnapshot,
} from '@enico/protocol';
import { validateProfile } from '@enico/game-domain';
import { io, type Socket } from 'socket.io-client';

const PROFILE_KEY = 'enico.pixel-square.profile.v1';
const SESSION_KEY = 'enico.pixel-square.session.v1';

export interface IdentityProvider {
  loadProfile: () => PlayerProfile | null;
  saveProfile: (profile: PlayerProfile) => void;
  getSessionId: () => string;
}

export class LocalIdentityProvider implements IdentityProvider {
  loadProfile(): PlayerProfile | null {
    try {
      const raw = window.localStorage.getItem(PROFILE_KEY);
      if (!raw) return null;
      const candidate = JSON.parse(raw) as Partial<PlayerProfile>;
      if (
        typeof candidate.nickname !== 'string' ||
        typeof candidate.bio !== 'string' ||
        !isPaletteId(candidate.palette)
      ) {
        return null;
      }
      const validated = validateProfile(candidate as PlayerProfile);
      return validated.ok ? validated.value : null;
    } catch {
      window.localStorage.removeItem(PROFILE_KEY);
      return null;
    }
  }

  saveProfile(profile: PlayerProfile): void {
    window.localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  }

  getSessionId(): string {
    const existing = window.sessionStorage.getItem(SESSION_KEY);
    if (existing) return existing;
    const sessionId = createId('local');
    window.sessionStorage.setItem(SESSION_KEY, sessionId);
    return sessionId;
  }
}

export type ConnectionStatus = 'offline' | 'connecting' | 'online' | 'reconnecting';

export interface TransportHandlers {
  onConnection: (status: ConnectionStatus) => void;
  onReady: (payload: SessionReadyPayload) => void;
  onSnapshot: (snapshot: WorldSnapshot) => void;
  onChat: (message: ChatMessage) => void;
  onEmote: (event: EmoteEvent) => void;
  onNotice: (notice: ServerNotice) => void;
  onError: (error: ServerErrorPayload) => void;
}

export interface RealtimeTransport {
  connect: (join: JoinPayload, handlers: TransportHandlers) => void;
  sendInput: (input: InputPayload) => void;
  sendChat: (text: string) => void;
  sendEmote: (emote: EmoteId) => void;
  dispose: () => void;
}

export class SocketIoTransport implements RealtimeTransport {
  private readonly socket: Socket<ServerToClientEvents, ClientToServerEvents>;
  private joinPayload: JoinPayload | null = null;
  private handlers: TransportHandlers | null = null;
  private hasConnected = false;

  constructor(serverUrl: string) {
    this.socket = io(serverUrl, {
      autoConnect: false,
      reconnection: true,
      reconnectionAttempts: Number.POSITIVE_INFINITY,
      reconnectionDelay: 350,
      reconnectionDelayMax: 2_000,
      transports: ['websocket', 'polling'],
    });
  }

  connect(join: JoinPayload, handlers: TransportHandlers): void {
    this.joinPayload = join;
    this.handlers = handlers;
    handlers.onConnection('connecting');

    this.socket.on('connect', () => {
      this.handlers?.onConnection(this.hasConnected ? 'reconnecting' : 'online');
      this.hasConnected = true;
      if (this.joinPayload) this.socket.emit('player:join', this.joinPayload);
    });
    this.socket.on('disconnect', () => this.handlers?.onConnection('reconnecting'));
    this.socket.on('connect_error', (error) => {
      this.handlers?.onConnection('reconnecting');
      this.handlers?.onError({ code: 'CONNECTION_ERROR', message: error.message });
    });
    this.socket.on('session:ready', (payload) => {
      this.handlers?.onConnection('online');
      this.handlers?.onReady(payload);
    });
    this.socket.on('world:snapshot', (snapshot) => this.handlers?.onSnapshot(snapshot));
    this.socket.on('chat:message', (message) => this.handlers?.onChat(message));
    this.socket.on('emote:broadcast', (event) => this.handlers?.onEmote(event));
    this.socket.on('server:notice', (notice) => this.handlers?.onNotice(notice));
    this.socket.on('server:error', (error) => this.handlers?.onError(error));
    this.socket.connect();
  }

  sendInput(input: InputPayload): void {
    if (this.socket.connected) this.socket.emit('player:input', input);
  }

  sendChat(text: string): void {
    if (this.socket.connected) this.socket.emit('chat:send', { text });
  }

  sendEmote(emote: EmoteId): void {
    if (this.socket.connected) this.socket.emit('emote:send', { emote });
  }

  dispose(): void {
    this.handlers = null;
    this.joinPayload = null;
    this.socket.removeAllListeners();
    this.socket.disconnect();
  }
}

export function createIdentityProvider(kind = 'local'): IdentityProvider {
  if (kind !== 'local') {
    throw new Error(`Unsupported identity adapter: ${kind}`);
  }
  return new LocalIdentityProvider();
}

export function createRealtimeTransport(kind: string, serverUrl: string): RealtimeTransport {
  if (kind !== 'socketio') {
    throw new Error(`Unsupported realtime adapter: ${kind}`);
  }
  return new SocketIoTransport(serverUrl);
}
