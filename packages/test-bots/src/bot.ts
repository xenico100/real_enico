import {
  AVATAR_PALETTES,
  EMOTES,
  createId,
  type ClientToServerEvents,
  type InputPayload,
  type ServerToClientEvents,
  type SessionReadyPayload,
} from '@enico/protocol';
import { io as createClient, type Socket } from 'socket.io-client';

export type BotSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export interface BotController {
  socket: BotSocket;
  sessionId: string;
  ready: SessionReadyPayload;
  startBehavior: () => void;
  stop: () => void;
}

export async function connectBot(
  url: string,
  index: number,
  existingSessionId?: string,
): Promise<BotController> {
  const socket: BotSocket = createClient(url, {
    autoConnect: false,
    forceNew: true,
    reconnection: true,
    transports: ['websocket'],
  });
  const sessionId = existingSessionId ?? createId(`bot_${index}`);
  const palette = AVATAR_PALETTES[index % AVATAR_PALETTES.length] ?? AVATAR_PALETTES[0];
  let inputTimer: NodeJS.Timeout | null = null;
  let emoteTimer: NodeJS.Timeout | null = null;
  let sequence = 0;
  let phase = index % 4;

  const ready = await new Promise<SessionReadyPayload>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`BOT_${index} join timeout`)), 5_000);
    socket.once('connect', () => {
      socket.emit('player:join', {
        sessionId,
        profile: {
          nickname: `BOT_${String(index + 1).padStart(2, '0')}`,
          palette: palette.id,
          bio: 'AUTOMATED LOCAL SOUL',
        },
      });
    });
    socket.once('session:ready', (payload) => {
      clearTimeout(timeout);
      resolve(payload);
    });
    socket.once('connect_error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    socket.connect();
  });

  const sendPhaseInput = () => {
    sequence += 1;
    phase = (phase + (sequence % 12 === 0 ? 1 : 0)) % 5;
    const movement: Omit<InputPayload, 'sequence'>[] = [
      { up: true, down: false, left: false, right: false },
      { up: false, down: false, left: false, right: true },
      { up: false, down: true, left: false, right: false },
      { up: false, down: false, left: true, right: false },
      { up: false, down: false, left: false, right: false },
    ];
    socket.emit('player:input', { sequence, ...(movement[phase] ?? movement[4]!) });
  };

  return {
    socket,
    sessionId,
    ready,
    startBehavior: () => {
      if (!inputTimer) inputTimer = setInterval(sendPhaseInput, 100);
      if (!emoteTimer) {
        emoteTimer = setInterval(() => {
          const emote = EMOTES[(index + sequence) % EMOTES.length] ?? EMOTES[0];
          socket.emit('emote:send', { emote });
        }, 2_800 + (index % 4) * 170);
      }
    },
    stop: () => {
      if (inputTimer) clearInterval(inputTimer);
      if (emoteTimer) clearInterval(emoteTimer);
      inputTimer = null;
      emoteTimer = null;
      socket.disconnect();
    },
  };
}
