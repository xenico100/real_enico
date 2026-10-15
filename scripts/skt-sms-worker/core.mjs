import { constants } from 'node:fs';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export const RELAY_ORIGIN = 'https://enicoveck.com';
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PHASES = new Set(['idle', 'claiming', 'claimed', 'sending', 'acknowledging', 'blocked']);
const KINDS = new Set(['self_test', 'customer_sms']);
const STATE_NAME = 'state-v1.json';
const LOCK_NAME = 'worker.lock';

export class WorkerError extends Error {
  constructor(code) {
    super(code);
    this.name = 'WorkerError';
    this.code = code;
  }
}

// Adapter errors and HTTP response bodies can contain phone numbers or credentials.
// They are deliberately never forwarded to logs, state, or returned error messages.
function emit(logger, event, reason) {
  try {
    logger?.({ event, ...(reason ? { reason } : {}) });
  } catch {
    // A logger must not make an already submitted message run a second time.
  }
}

async function verifyPrivateEntry(filePath, type, requiredMode) {
  const stat = await fs.lstat(filePath);
  if (stat.isSymbolicLink() || (type === 'directory' ? !stat.isDirectory() : !stat.isFile())) {
    throw new WorkerError('UNSAFE_LOCAL_FILE');
  }
  if (typeof process.getuid === 'function' && stat.uid !== process.getuid()) {
    throw new WorkerError('UNSAFE_LOCAL_OWNER');
  }
  if (requiredMode !== undefined ? (stat.mode & 0o777) !== requiredMode : (stat.mode & 0o077) !== 0) {
    throw new WorkerError('UNSAFE_LOCAL_PERMISSIONS');
  }
}

async function privateStateDirectory(stateDir) {
  if (typeof stateDir !== 'string' || !path.isAbsolute(stateDir)) {
    throw new WorkerError('ABSOLUTE_STATE_DIRECTORY_REQUIRED');
  }
  await fs.mkdir(stateDir, { recursive: true, mode: 0o700 });
  await verifyPrivateEntry(stateDir, 'directory', 0o700);
}

/** Accept a token only from an environment variable or a regular mode-0600 file. */
export async function loadDeviceToken({ env = process.env, tokenFile } = {}) {
  let token;
  const filePath = tokenFile || env.ENICO_PHONE_RELAY_TOKEN_FILE;
  if (env.ENICO_PHONE_RELAY_TOKEN && filePath) throw new WorkerError('MULTIPLE_TOKEN_SOURCES');
  if (filePath) {
    if (!path.isAbsolute(filePath)) throw new WorkerError('ABSOLUTE_TOKEN_FILE_REQUIRED');
    await verifyPrivateEntry(filePath, 'file', 0o600);
    const handle = await fs.open(filePath, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const stat = await handle.stat();
      if (stat.size > 256 || (stat.mode & 0o777) !== 0o600 || !stat.isFile()
        || (typeof process.getuid === 'function' && stat.uid !== process.getuid())) {
        throw new WorkerError('UNSAFE_TOKEN_FILE');
      }
      token = (await handle.readFile('utf8')).trim();
    } finally {
      await handle.close();
    }
  } else {
    token = env.ENICO_PHONE_RELAY_TOKEN?.trim();
  }
  if (typeof token !== 'string' || !TOKEN_PATTERN.test(token)) throw new WorkerError('DEVICE_TOKEN_REQUIRED');
  return token;
}

function cleanState(value) {
  if (!value || value.version !== 1 || !PHASES.has(value.phase)
    || typeof value.updatedAt !== 'string' || !Number.isFinite(Date.parse(value.updatedAt))
    || (value.attemptId !== undefined && !UUID_PATTERN.test(value.attemptId))
    || (value.jobId !== undefined && !UUID_PATTERN.test(value.jobId))
    || (value.reason !== undefined && (typeof value.reason !== 'string' || !/^[A-Z_]{1,80}$/.test(value.reason)))) {
    throw new WorkerError('INVALID_LOCAL_STATE');
  }
  // Keep only operational metadata. No recipient, message, device token, or claim token.
  return {
    version: 1,
    phase: value.phase,
    updatedAt: value.updatedAt,
    ...(value.attemptId ? { attemptId: value.attemptId } : {}),
    ...(value.jobId ? { jobId: value.jobId } : {}),
    ...(value.reason ? { reason: value.reason } : {}),
  };
}

async function readState(stateDir) {
  const filePath = path.join(stateDir, STATE_NAME);
  try {
    await verifyPrivateEntry(filePath, 'file', 0o600);
    const handle = await fs.open(filePath, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      if ((await handle.stat()).size > 2048) throw new WorkerError('INVALID_LOCAL_STATE');
      return cleanState(JSON.parse(await handle.readFile('utf8')));
    } finally {
      await handle.close();
    }
  } catch (error) {
    if (error.code === 'ENOENT') return { version: 1, phase: 'idle', updatedAt: new Date().toISOString() };
    if (error instanceof WorkerError) throw error;
    throw new WorkerError('INVALID_LOCAL_STATE');
  }
}

async function writeState(stateDir, value) {
  const state = cleanState({ ...value, version: 1, updatedAt: new Date().toISOString() });
  const filePath = path.join(stateDir, STATE_NAME);
  const temporary = path.join(stateDir, `.state-${randomUUID()}.tmp`);
  const handle = await fs.open(temporary, 'wx', 0o600);
  try {
    await handle.writeFile(`${JSON.stringify(state)}\n`, 'utf8');
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await fs.rename(temporary, filePath);
    const directory = await fs.open(stateDir, 'r');
    try {
      await directory.sync();
    } finally {
      await directory.close();
    }
  } catch {
    await fs.unlink(temporary).catch(() => {});
    throw new WorkerError('LOCAL_STATE_WRITE_FAILED');
  }
  return state;
}

/** A stale lock is never removed automatically: a previous send may have succeeded. */
async function withLock(stateDir, operation) {
  await privateStateDirectory(stateDir);
  const lockPath = path.join(stateDir, LOCK_NAME);
  let lock;
  try {
    lock = await fs.open(lockPath, 'wx', 0o600);
  } catch (error) {
    if (error.code === 'EEXIST') throw new WorkerError('WORKER_ALREADY_LOCKED');
    throw new WorkerError('LOCAL_LOCK_FAILED');
  }
  try {
    await lock.writeFile(JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() }));
    await lock.sync();
    return await operation();
  } finally {
    await lock.close();
    await fs.unlink(lockPath);
  }
}

function validateJob(job) {
  if (!job || typeof job !== 'object' || !UUID_PATTERN.test(job.id)
    || !TOKEN_PATTERN.test(job.claimToken) || !/^010\d{8}$/.test(job.to)
    || typeof job.text !== 'string' || !job.text.trim() || Buffer.byteLength(job.text, 'utf8') > 2000
    || /[\u0000\uD800-\uDFFF]/.test(job.text)
    || typeof job.title !== 'string' || !job.title.trim() || job.title.length > 180
    || /[\r\n\u0000]/.test(job.title) || !KINDS.has(job.kind)) {
    throw new WorkerError('INVALID_CLAIM_RESPONSE');
  }
  return Object.freeze({ id: job.id, claimToken: job.claimToken, to: job.to,
    text: job.text, title: job.title, kind: job.kind });
}

/** Fixed production origin and redirect rejection prevent credential forwarding. */
export function createRelayClient({ token, fetchImpl = globalThis.fetch } = {}) {
  if (typeof token !== 'string' || !TOKEN_PATTERN.test(token)) throw new WorkerError('DEVICE_TOKEN_REQUIRED');
  if (typeof fetchImpl !== 'function') throw new WorkerError('FETCH_REQUIRED');
  async function post(endpoint, body) {
    let response;
    try {
      response = await fetchImpl(`${RELAY_ORIGIN}/api/phone-relay/${endpoint}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
        ...(body ? { body: JSON.stringify(body) } : {}),
        redirect: 'error',
        cache: 'no-store',
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      throw new WorkerError('RELAY_REQUEST_OUTCOME_UNKNOWN');
    }
    if (!response.ok) throw new WorkerError('RELAY_RESPONSE_REJECTED');
    try {
      const text = await response.text();
      if (text.length > 16_384) throw new Error();
      const value = JSON.parse(text);
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
      return value;
    } catch {
      throw new WorkerError('INVALID_RELAY_RESPONSE');
    }
  }
  return Object.freeze({
    async claim() {
      const value = await post('claim');
      if (!Object.hasOwn(value, 'job')) throw new WorkerError('INVALID_CLAIM_RESPONSE');
      return value.job === null ? null : validateJob(value.job);
    },
    async ack(job, status) {
      if (!['submitted', 'unknown'].includes(status)) throw new WorkerError('INVALID_ACK_STATUS');
      const value = await post('ack', { jobId: job.id, claimToken: job.claimToken, status });
      if (value.ok !== true || !['submitted', 'unknown'].includes(value.status)) throw new WorkerError('INVALID_ACK_RESPONSE');
      return value.status;
    },
  });
}

async function preflight(adapter) {
  let value;
  try {
    value = await adapter.preflight();
  } catch {
    return { ready: false, reason: 'PREFLIGHT_UNAVAILABLE' };
  }
  if (value?.loggedIn !== true) return { ready: false, reason: 'LOGIN_REQUIRED' };
  if (!Number.isSafeInteger(value.freeRemaining) || value.freeRemaining < 0) {
    return { ready: false, reason: 'FREE_QUOTA_UNVERIFIED' };
  }
  if (value.freeRemaining < 1) return { ready: false, reason: 'FREE_QUOTA_EMPTY' };
  return { ready: true };
}

/**
 * One attempt only. No HTTP or send retry is performed by this module.
 * Adapter contract:
 *   preflight() -> {loggedIn:true, freeRemaining:integer}
 *   send(job) -> {status:'submitted'|'unknown'}
 * The adapter must check the form's free mode/remaining count at the final submit
 * boundary and must return unknown after any ambiguous click or result.
 */
export async function runOnce({ stateDir, adapter, token, fetchImpl,
  live = false, allowedKinds = ['self_test'], commercialConsentVerified = false, logger } = {}) {
  if (!adapter || typeof adapter.preflight !== 'function' || typeof adapter.send !== 'function') {
    throw new WorkerError('ADAPTER_REQUIRED');
  }
  if (!Array.isArray(allowedKinds) || !allowedKinds.length || allowedKinds.some(kind => !KINDS.has(kind))) {
    throw new WorkerError('INVALID_ALLOWED_KINDS');
  }
  // SKT's observed service terms §18(3) require prior written consent for
  // profit-oriented business use. This explicit marker may be set only after
  // that consent is documented; it is not a substitute for provider approval.
  if (allowedKinds.includes('customer_sms') && commercialConsentVerified !== true) {
    emit(logger, 'paused', 'COMMERCIAL_CONSENT_REQUIRED');
    return { status: 'paused', reason: 'COMMERCIAL_CONSENT_REQUIRED' };
  }
  return withLock(stateDir, async () => {
    let state = await readState(stateDir);
    if (state.phase !== 'idle') {
      if (state.phase !== 'blocked') {
        state = await writeState(stateDir, { ...state, phase: 'blocked', reason: 'UNRESOLVED_PRIOR_ATTEMPT' });
      }
      emit(logger, 'blocked', state.reason);
      return { status: 'blocked', reason: state.reason };
    }

    const firstCheck = await preflight(adapter);
    if (!firstCheck.ready) {
      emit(logger, 'paused', firstCheck.reason);
      return { status: 'paused', reason: firstCheck.reason };
    }
    if (live !== true) {
      emit(logger, 'dry_run_ready');
      return { status: 'dry_run', reason: 'QUEUE_NOT_CLAIMED' };
    }

    const client = createRelayClient({ token, fetchImpl });
    state = await writeState(stateDir, { phase: 'claiming', attemptId: randomUUID() });
    const block = async (reason, job, acknowledge = false) => {
      // Save the local stop BEFORE trying to inform the server.
      await writeState(stateDir, { ...state, phase: 'blocked', reason });
      if (acknowledge && job) {
        try {
          await client.ack(job, 'unknown');
        } catch {
          // Local block persists whether the server received the ack or not.
        }
      }
      emit(logger, 'blocked', reason);
      return { status: 'blocked', reason };
    };

    let job;
    try {
      job = await client.claim();
    } catch {
      return block('CLAIM_OUTCOME_UNKNOWN');
    }
    if (!job) {
      await writeState(stateDir, { phase: 'idle' });
      emit(logger, 'queue_empty');
      return { status: 'empty' };
    }
    state = await writeState(stateDir, { ...state, phase: 'claimed', jobId: job.id });
    if (!allowedKinds.includes(job.kind)) return block('JOB_KIND_NOT_ENABLED', job, true);

    // SKT login, remaining free quota, or the month's free allocation can change
    // between the first check and claim. Recheck before the adapter may submit.
    const finalCheck = await preflight(adapter);
    if (!finalCheck.ready) return block('PREFLIGHT_CHANGED_AFTER_CLAIM', job, true);

    state = await writeState(stateDir, { ...state, phase: 'sending' });
    let sendResult;
    try {
      sendResult = await adapter.send(job);
    } catch {
      return block('SEND_OUTCOME_UNKNOWN', job, true);
    }
    if (sendResult?.status !== 'submitted') return block('SEND_OUTCOME_UNKNOWN', job, true);

    state = await writeState(stateDir, { ...state, phase: 'acknowledging' });
    let acknowledged;
    try {
      acknowledged = await client.ack(job, 'submitted');
    } catch {
      return block('ACK_OUTCOME_UNKNOWN');
    }
    if (acknowledged !== 'submitted') return block('SERVER_MARKED_UNKNOWN');

    await writeState(stateDir, { phase: 'idle' });
    emit(logger, 'submitted');
    return { status: 'submitted' };
  });
}

/** Read operational metadata only; this never reads message bodies or credentials. */
export async function inspectWorkerState({ stateDir } = {}) {
  await privateStateDirectory(stateDir);
  return readState(stateDir);
}

/**
 * Explicit operator action after checking the SKT sent list and server queue.
 * It neither requeues a job nor enables the server relay. There is deliberately
 * no automatic reset, stale-lock removal, or automatic retry after this action.
 */
export async function resetAfterReview({ stateDir, reviewed = false, expectedAttemptId } = {}) {
  if (reviewed !== true || !UUID_PATTERN.test(expectedAttemptId || '')) throw new WorkerError('EXPLICIT_REVIEW_REQUIRED');
  return withLock(stateDir, async () => {
    const state = await readState(stateDir);
    if (state.phase !== 'blocked' || state.attemptId !== expectedAttemptId) throw new WorkerError('REVIEW_ATTEMPT_MISMATCH');
    return writeState(stateDir, { phase: 'idle' });
  });
}
