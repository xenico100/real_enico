import { afterEach, describe, expect, it } from 'vitest';
import { io as createClient, type Socket } from 'socket.io-client';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  SessionReadyPayload,
  WorldSnapshot,
} from '@enico/protocol';
import { createGameServer, type GameServer } from './app';

type TestSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

function connectClient(url: string): Promise<TestSocket> {
  const socket: TestSocket = createClient(url, {
    autoConnect: false,
    forceNew: true,
    reconnection: false,
    transports: ['websocket'],
  });

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('client connect timeout')), 3_000);
    socket.once('connect', () => {
      clearTimeout(timer);
      resolve(socket);
    });
    socket.once('connect_error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    socket.connect();
  });
}

function joinClient(socket: TestSocket, sessionId: string, nickname: string): Promise<SessionReadyPayload> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('join timeout')), 3_000);
    socket.once('session:ready', (payload) => {
      clearTimeout(timer);
      resolve(payload);
    });
    socket.once('server:error', (error) => {
      clearTimeout(timer);
      reject(new Error(error.message));
    });
    socket.emit('player:join', {
      sessionId,
      profile: { nickname, palette: 'crimson', bio: 'INTEGRATION TEST' },
    });
  });
}

function waitForSnapshot(
  socket: TestSocket,
  predicate: (snapshot: WorldSnapshot) => boolean,
): Promise<WorldSnapshot> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off('world:snapshot', listener);
      reject(new Error('snapshot timeout'));
    }, 4_000);
    const listener = (snapshot: WorldSnapshot) => {
      if (!predicate(snapshot)) return;
      clearTimeout(timer);
      socket.off('world:snapshot', listener);
      resolve(snapshot);
    };
    socket.on('world:snapshot', listener);
  });
}

describe('local authoritative game server', () => {
  let server: GameServer | null = null;
  const sockets: TestSocket[] = [];

  afterEach(async () => {
    for (const socket of sockets) socket.disconnect();
    sockets.length = 0;
    if (server) await server.stop();
    server = null;
  });

  it('serves health and synchronizes join, movement, proximity chat, and leave', async () => {
    server = createGameServer({ port: 0, clientOrigin: 'http://127.0.0.1:4173' });
    const url = await server.start();

    const health = await fetch(`${url}/health`).then((response) => response.json()) as {
      status: string;
      players: number;
    };
    expect(health).toEqual(expect.objectContaining({ status: 'ok', players: 0 }));

    const alpha = await connectClient(url);
    const beta = await connectClient(url);
    sockets.push(alpha, beta);
    const alphaReady = await joinClient(alpha, 'integration_alpha', 'ALPHA');
    await joinClient(beta, 'integration_beta', 'BETA');

    await waitForSnapshot(alpha, (snapshot) => snapshot.players.length === 2);

    const receivedChat = new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('chat timeout')), 3_000);
      beta.once('chat:message', (message) => {
        clearTimeout(timer);
        resolve(message.text);
      });
    });
    alpha.emit('chat:send', { text: 'LOCAL HELLO' });
    await expect(receivedChat).resolves.toBe('LOCAL HELLO');

    const startX = alphaReady.snapshot.players.find((player) => player.id === alphaReady.playerId)?.x;
    expect(startX).toBeTypeOf('number');
    alpha.emit('player:input', {
      sequence: 1,
      up: false,
      down: false,
      left: false,
      right: true,
    });
    const moved = await waitForSnapshot(
      alpha,
      (snapshot) => (snapshot.players.find((player) => player.id === alphaReady.playerId)?.x ?? -99) > (startX ?? 0) + 0.2,
    );
    expect(moved.players).toHaveLength(2);
    alpha.emit('player:input', {
      sequence: 2,
      up: false,
      down: false,
      left: false,
      right: false,
    });

    beta.disconnect();
    const afterLeave = await waitForSnapshot(alpha, (snapshot) => snapshot.players.length === 1);
    expect(afterLeave.players[0]?.nickname).toBe('ALPHA');
  });

  it('rejects invalid identities without adding a player', async () => {
    server = createGameServer({ port: 0 });
    const url = await server.start();
    const socket = await connectClient(url);
    sockets.push(socket);

    const error = new Promise<string>((resolve) => {
      socket.once('server:error', (payload) => resolve(payload.code));
    });
    socket.emit('player:join', {
      sessionId: 'invalid_profile_session',
      profile: { nickname: '<x>', palette: 'crimson', bio: '' },
    });
    await expect(error).resolves.toBe('INVALID_PROFILE');
    expect(server.getSnapshot().players).toHaveLength(0);
  });
});
