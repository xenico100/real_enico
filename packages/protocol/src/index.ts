import { isAvatarConfig, type AvatarConfig } from './avatar';
export * from './avatar';

export const GAME_CONFIG = {
  worldHalfSize: 11,
  playerRadius: 0.38,
  moveSpeed: 4.2,
  serverTickRate: 20,
  snapshotRate: 10,
  proximityChatRadius: 6.5,
  emoteRadius: 9,
  maxPlayers: 80,
  maxMessageLength: 140,
  chatCooldownMs: 650,
  emoteCooldownMs: 800,
} as const;

export const AVATAR_PALETTES = [
  {
    id: 'crimson',
    label: 'CRIMSON RIOT',
    skin: '#efc4a9',
    hair: '#171719',
    top: '#b8001f',
    bottoms: '#202127',
    accent: '#ff3358',
  },
  {
    id: 'oxide',
    label: 'OXIDE BLUE',
    skin: '#d8a889',
    hair: '#201811',
    top: '#244b62',
    bottoms: '#161a1d',
    accent: '#83d7ff',
  },
  {
    id: 'acid',
    label: 'ACID SIGNAL',
    skin: '#f1c8ae',
    hair: '#3a2921',
    top: '#b7d72f',
    bottoms: '#25262a',
    accent: '#e8ff5a',
  },
  {
    id: 'violet',
    label: 'VIOLET STATIC',
    skin: '#bd846b',
    hair: '#101014',
    top: '#6944a8',
    bottoms: '#232129',
    accent: '#c79bff',
  },
] as const;

export const EMOTES = ['wave', 'heart', 'shock', 'spark'] as const;

export type PaletteId = (typeof AVATAR_PALETTES)[number]['id'];
export type EmoteId = (typeof EMOTES)[number];
export type PlayerDirection = 'north' | 'south' | 'east' | 'west';

export interface Vec2 {
  x: number;
  z: number;
}

export interface PlayerProfile {
  nickname: string;
  palette: PaletteId;
  avatar: AvatarConfig;
  bio: string;
}

export interface PlayerSnapshot extends Vec2 {
  id: string;
  nickname: string;
  palette: PaletteId;
  avatar: AvatarConfig;
  bio: string;
  direction: PlayerDirection;
  moving: boolean;
  joinedAt: number;
}

export interface WorldSnapshot {
  tick: number;
  serverTime: number;
  players: PlayerSnapshot[];
}

export interface JoinPayload {
  sessionId: string;
  profile: PlayerProfile;
}

export interface InputPayload {
  sequence: number;
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
}

export interface ChatSendPayload {
  text: string;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  sentAt: number;
}

export interface EmoteSendPayload {
  emote: EmoteId;
}

export interface EmoteEvent {
  id: string;
  playerId: string;
  emote: EmoteId;
  sentAt: number;
}

export interface SessionReadyPayload {
  playerId: string;
  motd: string;
  snapshot: WorldSnapshot;
}

export interface ServerNotice {
  id: string;
  text: string;
  level: 'info' | 'warning';
  sentAt: number;
}

export interface ServerErrorPayload {
  code: string;
  message: string;
}

export interface ServerToClientEvents {
  'session:ready': (payload: SessionReadyPayload) => void;
  'world:snapshot': (snapshot: WorldSnapshot) => void;
  'chat:message': (message: ChatMessage) => void;
  'emote:broadcast': (event: EmoteEvent) => void;
  'server:notice': (notice: ServerNotice) => void;
  'server:error': (error: ServerErrorPayload) => void;
}

export interface ClientToServerEvents {
  'player:join': (payload: JoinPayload) => void;
  'player:input': (payload: InputPayload) => void;
  'chat:send': (payload: ChatSendPayload) => void;
  'emote:send': (payload: EmoteSendPayload) => void;
}

export interface InterServerEvents {
  noop: () => void;
}

export interface SocketData {
  sessionId?: string;
  playerId?: string;
}

export function isPaletteId(value: unknown): value is PaletteId {
  return typeof value === 'string' && AVATAR_PALETTES.some((palette) => palette.id === value);
}

export function isEmoteId(value: unknown): value is EmoteId {
  return typeof value === 'string' && EMOTES.some((emote) => emote === value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function isJoinPayload(value: unknown): value is JoinPayload {
  if (!isRecord(value) || !isRecord(value.profile)) return false;
  return (
    typeof value.sessionId === 'string' &&
    value.sessionId.length >= 8 &&
    value.sessionId.length <= 100 &&
    typeof value.profile.nickname === 'string' &&
    typeof value.profile.bio === 'string' &&
    isPaletteId(value.profile.palette) &&
    isAvatarConfig(value.profile.avatar)
  );
}

export function isInputPayload(value: unknown): value is InputPayload {
  if (!isRecord(value)) return false;
  return (
    Number.isSafeInteger(value.sequence) &&
    typeof value.up === 'boolean' &&
    typeof value.down === 'boolean' &&
    typeof value.left === 'boolean' &&
    typeof value.right === 'boolean'
  );
}

export function isChatSendPayload(value: unknown): value is ChatSendPayload {
  return isRecord(value) && typeof value.text === 'string';
}

export function isEmoteSendPayload(value: unknown): value is EmoteSendPayload {
  return isRecord(value) && isEmoteId(value.emote);
}

export function createId(prefix: string): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return `${prefix}_${uuid}`;
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function paletteById(id: PaletteId) {
  return AVATAR_PALETTES.find((palette) => palette.id === id) ?? AVATAR_PALETTES[0];
}
