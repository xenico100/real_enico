import { createServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  GAME_CONFIG,
  createId,
  isChatSendPayload,
  isEmoteSendPayload,
  isInputPayload,
  isJoinPayload,
  type ClientToServerEvents,
  type EmoteEvent,
  type InputPayload,
  type InterServerEvents,
  type PlayerDirection,
  type PlayerSnapshot,
  type ServerNotice,
  type ServerToClientEvents,
  type SocketData,
  type WorldSnapshot,
} from '@enico/protocol';
import {
  canReceiveProximityMessage,
  distanceBetween,
  isRateLimited,
  resolveMovement,
  selectSpawn,
  validateChatText,
  validateProfile,
} from '@enico/game-domain';
import { Server as SocketServer } from 'socket.io';

interface RuntimePlayer extends PlayerSnapshot {
  socketId: string;
  sessionId: string;
  input: InputPayload;
  lastInputSequence: number;
  lastChatAt: number;
  lastEmoteAt: number;
}

export interface GameServerOptions {
  host?: string;
  port?: number;
  clientOrigin?: string;
}

export interface GameServer {
  httpServer: HttpServer;
  io: SocketServer<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
  start: () => Promise<string>;
  stop: () => Promise<void>;
  getSnapshot: () => WorldSnapshot;
}

const IDLE_INPUT: InputPayload = {
  sequence: 0,
  up: false,
  down: false,
  left: false,
  right: false,
};

export function createGameServer(options: GameServerOptions = {}): GameServer {
  const host = options.host ?? '127.0.0.1';
  const port = options.port ?? 3001;
  const clientOrigin = options.clientOrigin ?? 'http://127.0.0.1:5173';
  const players = new Map<string, RuntimePlayer>();
  const sessionSockets = new Map<string, string>();
  const startedAt = Date.now();
  let tick = 0;
  let tickTimer: NodeJS.Timeout | null = null;
  let snapshotTimer: NodeJS.Timeout | null = null;

  const httpServer = createServer((request, response) => {
    response.setHeader('Access-Control-Allow-Origin', clientOrigin);
    response.setHeader('Content-Type', 'application/json; charset=utf-8');

    if (request.url === '/health') {
      response.writeHead(200);
      response.end(
        JSON.stringify({
          status: 'ok',
          node: 'VECK_PLAZA_01',
          players: players.size,
          uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
        }),
      );
      return;
    }

    response.writeHead(404);
    response.end(JSON.stringify({ error: 'not_found' }));
  });

  const io = new SocketServer<
    ClientToServerEvents,
    ServerToClientEvents,
    InterServerEvents,
    SocketData
  >(httpServer, {
    cors: {
      origin: clientOrigin,
      methods: ['GET', 'POST'],
    },
    transports: ['websocket', 'polling'],
    pingInterval: 10_000,
    pingTimeout: 8_000,
  });

  const getSnapshot = (): WorldSnapshot => ({
    tick,
    serverTime: Date.now(),
    players: [...players.values()].map(({ socketId: _socketId, sessionId: _sessionId, input: _input, lastInputSequence: _lastInputSequence, lastChatAt: _lastChatAt, lastEmoteAt: _lastEmoteAt, ...snapshot }) => snapshot),
  });

  const sendError = (socketId: string, code: string, message: string) => {
    io.to(socketId).emit('server:error', { code, message });
  };

  const sendNotice = (text: string, level: ServerNotice['level'] = 'info') => {
    io.emit('server:notice', {
      id: createId('notice'),
      text,
      level,
      sentAt: Date.now(),
    });
  };

  const removePlayer = (socketId: string) => {
    const player = players.get(socketId);
    if (!player) return;
    players.delete(socketId);
    if (sessionSockets.get(player.sessionId) === socketId) {
      sessionSockets.delete(player.sessionId);
    }
    sendNotice(`${player.nickname} 님이 광장을 떠났습니다.`);
  };

  io.on('connection', (socket) => {
    socket.on('player:join', (payload) => {
      if (!isJoinPayload(payload)) {
        sendError(socket.id, 'INVALID_JOIN', '입장 정보가 올바르지 않습니다.');
        return;
      }

      const validatedProfile = validateProfile(payload.profile);
      if (!validatedProfile.ok) {
        sendError(socket.id, 'INVALID_PROFILE', validatedProfile.reason);
        return;
      }

      const existingSocketId = sessionSockets.get(payload.sessionId);
      if (existingSocketId && existingSocketId !== socket.id) {
        removePlayer(existingSocketId);
        io.sockets.sockets.get(existingSocketId)?.disconnect(true);
      }

      if (!players.has(socket.id) && players.size >= GAME_CONFIG.maxPlayers) {
        sendError(socket.id, 'WORLD_FULL', '현재 광장이 가득 찼습니다.');
        return;
      }

      const spawn = selectSpawn(players.size);
      const player: RuntimePlayer = {
        id: socket.id,
        socketId: socket.id,
        sessionId: payload.sessionId,
        nickname: validatedProfile.value.nickname,
        palette: validatedProfile.value.palette,
        bio: validatedProfile.value.bio,
        x: spawn.x,
        z: spawn.z,
        direction: 'south',
        moving: false,
        joinedAt: Date.now(),
        input: { ...IDLE_INPUT },
        lastInputSequence: 0,
        lastChatAt: 0,
        lastEmoteAt: 0,
      };

      players.set(socket.id, player);
      sessionSockets.set(payload.sessionId, socket.id);
      socket.data.sessionId = payload.sessionId;
      socket.data.playerId = socket.id;

      socket.emit('session:ready', {
        playerId: socket.id,
        motd: 'WELCOME TO VECK PLAZA / KEEP IT HUMAN',
        snapshot: getSnapshot(),
      });
      sendNotice(`${player.nickname} 님이 NODE 01에 접속했습니다.`);
    });

    socket.on('player:input', (payload) => {
      if (!isInputPayload(payload)) return;
      const player = players.get(socket.id);
      if (!player || payload.sequence <= player.lastInputSequence) return;
      player.input = payload;
      player.lastInputSequence = payload.sequence;
    });

    socket.on('chat:send', (payload) => {
      if (!isChatSendPayload(payload)) return;
      const player = players.get(socket.id);
      if (!player) return;

      const now = Date.now();
      if (isRateLimited(player.lastChatAt, now, GAME_CONFIG.chatCooldownMs)) {
        sendError(socket.id, 'CHAT_RATE_LIMIT', '메시지를 잠시 천천히 보내주세요.');
        return;
      }

      const validated = validateChatText(payload.text);
      if (!validated.ok) {
        sendError(socket.id, 'INVALID_CHAT', validated.reason);
        return;
      }

      player.lastChatAt = now;
      const message = {
        id: createId('msg'),
        senderId: player.id,
        senderName: player.nickname,
        text: validated.value,
        sentAt: now,
      };

      for (const receiver of players.values()) {
        if (canReceiveProximityMessage(player, receiver)) {
          io.to(receiver.socketId).emit('chat:message', message);
        }
      }
    });

    socket.on('emote:send', (payload) => {
      if (!isEmoteSendPayload(payload)) return;
      const player = players.get(socket.id);
      if (!player) return;

      const now = Date.now();
      if (isRateLimited(player.lastEmoteAt, now, GAME_CONFIG.emoteCooldownMs)) return;
      player.lastEmoteAt = now;
      const event: EmoteEvent = {
        id: createId('emote'),
        playerId: player.id,
        emote: payload.emote,
        sentAt: now,
      };

      for (const receiver of players.values()) {
        if (distanceBetween(player, receiver) <= GAME_CONFIG.emoteRadius) {
          io.to(receiver.socketId).emit('emote:broadcast', event);
        }
      }
    });

    socket.on('disconnect', () => {
      removePlayer(socket.id);
    });
  });

  const advanceWorld = () => {
    tick += 1;
    const deltaSeconds = 1 / GAME_CONFIG.serverTickRate;
    for (const player of players.values()) {
      const next = resolveMovement(player, player.input, deltaSeconds, player.direction);
      player.x = next.x;
      player.z = next.z;
      player.direction = next.direction as PlayerDirection;
      player.moving = next.moving;
    }
  };

  const start = async (): Promise<string> => {
    await new Promise<void>((resolve, reject) => {
      const onError = (error: Error) => reject(error);
      httpServer.once('error', onError);
      httpServer.listen(port, host, () => {
        httpServer.off('error', onError);
        resolve();
      });
    });

    tickTimer = setInterval(advanceWorld, 1000 / GAME_CONFIG.serverTickRate);
    snapshotTimer = setInterval(
      () => io.emit('world:snapshot', getSnapshot()),
      1000 / GAME_CONFIG.snapshotRate,
    );

    const address = httpServer.address() as AddressInfo;
    return `http://${host}:${address.port}`;
  };

  const stop = async (): Promise<void> => {
    if (tickTimer) clearInterval(tickTimer);
    if (snapshotTimer) clearInterval(snapshotTimer);
    tickTimer = null;
    snapshotTimer = null;
    players.clear();
    sessionSockets.clear();
    await new Promise<void>((resolve) => io.close(() => resolve()));
  };

  return { httpServer, io, start, stop, getSnapshot };
}
