import { connectBot, type BotController } from './bot';

const rawCount = Number.parseInt(process.argv[2] ?? '20', 10);
const count = Number.isInteger(rawCount) ? Math.min(Math.max(rawCount, 1), 60) : 20;
const url = process.env.SERVER_URL ?? 'http://127.0.0.1:3001';
const bots: BotController[] = [];

console.log(`[BOT RUNNER] connecting ${count} bots to ${url}`);
for (let index = 0; index < count; index += 1) {
  const bot = await connectBot(url, index);
  bot.startBehavior();
  bots.push(bot);
}
console.log(`[BOT RUNNER] ${bots.length}/${count} bots online`);

const statusTimer = setInterval(() => {
  const connected = bots.filter((bot) => bot.socket.connected).length;
  console.log(`[BOT RUNNER] connected=${connected} target=${count}`);
}, 5_000);

function shutdown() {
  clearInterval(statusTimer);
  for (const bot of bots) bot.stop();
  console.log('[BOT RUNNER] offline');
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
