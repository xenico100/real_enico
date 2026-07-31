import { createGameServer } from './app.js';

const host = process.env.HOST ?? '127.0.0.1';
const port = Number.parseInt(process.env.PORT ?? '3001', 10);
const clientOrigin = process.env.CLIENT_ORIGIN ?? 'http://127.0.0.1:5173';

if (!Number.isInteger(port) || port < 0 || port > 65_535) {
  throw new Error(`Invalid PORT: ${process.env.PORT ?? ''}`);
}

const server = createGameServer({ host, port, clientOrigin });
const url = await server.start();
console.log(`[VECK SERVER] ONLINE ${url}`);
console.log(`[VECK SERVER] CLIENT ORIGIN ${clientOrigin}`);

let stopping = false;
async function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  console.log(`[VECK SERVER] ${signal} / shutting down`);
  await server.stop();
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
