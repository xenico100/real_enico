#!/usr/bin/env node
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';
import { inspectWorkerState, loadDeviceToken, resetAfterReview, runOnce, WorkerError } from './core.mjs';

const args = new Set(process.argv.slice(2));
const stateDir = process.env.ENICO_SKT_STATE_DIR || path.join(os.homedir(), '.local', 'state', 'enico-skt-sms');
const logger = entry => process.stdout.write(`${JSON.stringify({ time: new Date().toISOString(), ...entry })}\n`);

try {
  const known = new Set(['--live', '--allow-customer-orders', '--status', '--reset-after-review']);
  for (const arg of args) if (!known.has(arg)) throw new WorkerError('UNKNOWN_ARGUMENT');
  if (args.has('--status')) {
    if (args.size !== 1) throw new WorkerError('CONFLICTING_ARGUMENTS');
    const state = await inspectWorkerState({ stateDir });
    process.stdout.write(`${JSON.stringify(state)}\n`);
  } else if (args.has('--reset-after-review')) {
    if (args.size !== 1) throw new WorkerError('CONFLICTING_ARGUMENTS');
    await resetAfterReview({ stateDir, reviewed: process.env.ENICO_SKT_REVIEWED === 'true',
      expectedAttemptId: process.env.ENICO_SKT_REVIEWED_ATTEMPT_ID });
    logger({ event: 'review_reset_complete' });
  } else {
    const adapterPath = process.env.ENICO_SKT_ADAPTER;
    if (!adapterPath || !path.isAbsolute(adapterPath)) throw new WorkerError('ABSOLUTE_ADAPTER_PATH_REQUIRED');
    const module = await import(pathToFileURL(adapterPath).href);
    const adapter = typeof module.createAdapter === 'function' ? await module.createAdapter() : module.default;
    const live = args.has('--live');
    const token = live ? await loadDeviceToken() : undefined;
    try {
      const result = await runOnce({ stateDir, adapter, token, live, logger,
        commercialConsentVerified: process.env.ENICO_SKT_COMMERCIAL_CONSENT_VERIFIED === 'true',
        allowedKinds: args.has('--allow-customer-orders') ? ['self_test', 'customer_sms'] : ['self_test'] });
      if (result.status === 'blocked') process.exitCode = 2;
      else if (result.status === 'paused') process.exitCode = 3;
    } finally {
      if (typeof adapter?.close === 'function') await adapter.close();
    }
  }
} catch (error) {
  // Never dump a browser/HTTP exception: it can contain credentials or messages.
  logger({ event: 'worker_error', reason: error instanceof WorkerError ? error.code : 'UNEXPECTED_WORKER_ERROR' });
  process.exitCode = 1;
}
