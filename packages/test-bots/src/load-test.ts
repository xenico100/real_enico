import { createGameServer } from '@enico/server/app';
import type { ChatMessage } from '@enico/protocol';
import { connectBot, type BotController } from './bot';

const TARGET = 20;
const bots: BotController[] = [];
const server = createGameServer({ port: 0, clientOrigin: 'http://127.0.0.1:4173' });

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function waitUntil(predicate: () => boolean, label: string, timeoutMs = 5_000) {
  const startedAt = Date.now();
  while (!predicate()) {
    if (Date.now() - startedAt > timeoutMs) throw new Error(`timeout: ${label}`);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

try {
  const url = await server.start();
  const startedAt = performance.now();

  for (let index = 0; index < TARGET; index += 1) {
    bots.push(await connectBot(url, index));
  }
  await waitUntil(() => server.getSnapshot().players.length === TARGET, '20 players join');
  const connectedInMs = Math.round(performance.now() - startedAt);

  const receivedChat = new Promise<ChatMessage>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('bot proximity chat timeout')), 3_000);
    bots[1]!.socket.once('chat:message', (message) => {
      clearTimeout(timeout);
      resolve(message);
    });
  });
  bots[0]!.socket.emit('chat:send', { text: 'BOT LOAD CHECK' });
  const message = await receivedChat;
  assert(message.text === 'BOT LOAD CHECK', 'bot chat payload mismatch');

  const before = new Map(server.getSnapshot().players.map((player) => [player.nickname, `${player.x}:${player.z}`]));
  for (const bot of bots) bot.startBehavior();
  await new Promise((resolve) => setTimeout(resolve, 1_800));
  const after = server.getSnapshot();
  const moved = after.players.filter((player) => before.get(player.nickname) !== `${player.x}:${player.z}`).length;
  assert(moved >= 12, `expected at least 12 moving bots, received ${moved}`);

  const original = bots.shift()!;
  const reconnectSession = original.sessionId;
  original.stop();
  await waitUntil(() => server.getSnapshot().players.length === TARGET - 1, 'disconnect cleanup');
  const replacement = await connectBot(url, 0, reconnectSession);
  replacement.startBehavior();
  bots.push(replacement);
  await waitUntil(() => server.getSnapshot().players.length === TARGET, 'session reconnect');

  const health = await fetch(`${url}/health`).then((response) => response.json()) as {
    status: string;
    players: number;
  };
  assert(health.status === 'ok' && health.players === TARGET, 'health count mismatch');

  console.log(
    JSON.stringify(
      {
        result: 'PASS',
        target: TARGET,
        connectedInMs,
        movedBots: moved,
        proximityChat: 'PASS',
        disconnectCleanup: 'PASS',
        sessionReconnect: 'PASS',
        finalPlayers: health.players,
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error('[LOAD TEST] FAIL', error);
  process.exitCode = 1;
} finally {
  for (const bot of bots) bot.stop();
  await server.stop();
}
