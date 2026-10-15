import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createRelayClient, inspectWorkerState, loadDeviceToken, RELAY_ORIGIN,
  resetAfterReview, runOnce } from './core.mjs';

const TOKEN = 't'.repeat(43);
const CLAIM_TOKEN = 'c'.repeat(43);
const fakeJob = () => ({ id: randomUUID(), claimToken: CLAIM_TOKEN,
  to: `010${'12345678'}`, text: '테스트 주문 안내. 테스트 계좌와 금액.',
  title: '[ENICO VECK] 테스트', kind: 'self_test' });
const response = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { 'Content-Type': 'application/json' },
});

async function fixture(t, { job = fakeJob(), preflights, sendResult = { status: 'submitted' },
  sendError, ackError, claimError, ackStatus = 'submitted', claimResponse } = {}) {
  const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), 'enico-skt-test-'));
  await fs.chmod(stateDir, 0o700);
  t.after(() => fs.rm(stateDir, { recursive: true, force: true }));
  const requests = [];
  const sends = [];
  const logs = [];
  let preflightCalls = 0;
  const adapter = {
    async preflight() {
      const index = preflightCalls++;
      const value = preflights?.[index] ?? { loggedIn: true, freeRemaining: 100 };
      if (value instanceof Error) throw value;
      return value;
    },
    async send(item) {
      sends.push(item);
      if (sendError) throw sendError;
      return sendResult;
    },
  };
  const fetchImpl = async (url, options) => {
    requests.push({ url, options });
    if (url.endsWith('/claim')) {
      if (claimError) throw claimError;
      return claimResponse || response({ job });
    }
    if (url.endsWith('/ack')) {
      if (ackError) throw ackError;
      const body = JSON.parse(options.body);
      return response({ ok: true, status: body.status === 'unknown' ? 'unknown' : ackStatus });
    }
    throw new Error('Unexpected URL');
  };
  const options = { stateDir, adapter, token: TOKEN, fetchImpl, logger: value => logs.push(value) };
  return { stateDir, adapter, requests, sends, logs, options, job,
    preflightCalls: () => preflightCalls,
    run: extra => runOnce({ ...options, ...extra }),
    state: () => inspectWorkerState({ stateDir }) };
}

test('default dry run checks SKT but never claims, sends, or acknowledges', async t => {
  const f = await fixture(t);
  assert.deepEqual(await f.run({ token: undefined }), { status: 'dry_run', reason: 'QUEUE_NOT_CLAIMED' });
  assert.equal(f.preflightCalls(), 1);
  assert.equal(f.requests.length, 0);
  assert.equal(f.sends.length, 0);
});

test('expired login pauses before claim and can be retried after a human logs in', async t => {
  const f = await fixture(t, { preflights: [{ loggedIn: false, freeRemaining: 100 }] });
  assert.deepEqual(await f.run({ live: true }), { status: 'paused', reason: 'LOGIN_REQUIRED' });
  assert.equal(f.requests.length, 0);
  assert.equal((await f.state()).phase, 'idle');
  assert.equal((await f.run({ live: true })).status, 'submitted');
});

for (const [label, freeRemaining, expected] of [
  ['exhausted', 0, 'FREE_QUOTA_EMPTY'],
  ['missing', undefined, 'FREE_QUOTA_UNVERIFIED'],
  ['unparsed text', '100', 'FREE_QUOTA_UNVERIFIED'],
  ['negative', -1, 'FREE_QUOTA_UNVERIFIED'],
  ['fractional', 0.5, 'FREE_QUOTA_UNVERIFIED'],
  ['infinite', Infinity, 'FREE_QUOTA_UNVERIFIED'],
]) {
  test(`${label} free allowance never claims or sends`, async t => {
    const f = await fixture(t, { preflights: [{ loggedIn: true, freeRemaining }] });
    assert.deepEqual(await f.run({ live: true }), { status: 'paused', reason: expected });
    assert.equal(f.requests.length, 0);
    assert.equal(f.sends.length, 0);
  });
}

test('preflight exception is sanitized and no key or recipient appears in logs', async t => {
  const f = await fixture(t, { preflights: [new Error(`${TOKEN} private customer 01012345678`)] });
  assert.deepEqual(await f.run({ live: true }), { status: 'paused', reason: 'PREFLIGHT_UNAVAILABLE' });
  assert.equal(f.requests.length, 0);
  assert.doesNotMatch(JSON.stringify(f.logs), /private customer|01012345678|ttttt/);
});

test('successful self-test uses fixed endpoints, exact message, one claim and one ack', async t => {
  const f = await fixture(t);
  assert.deepEqual(await f.run({ live: true }), { status: 'submitted' });
  assert.equal(f.preflightCalls(), 2);
  assert.equal(f.sends.length, 1);
  assert.deepEqual(f.sends[0], f.job);
  assert.equal(f.requests.length, 2);
  assert.equal(f.requests[0].url, `${RELAY_ORIGIN}/api/phone-relay/claim`);
  assert.equal(f.requests[1].url, `${RELAY_ORIGIN}/api/phone-relay/ack`);
  assert.deepEqual(JSON.parse(f.requests[1].options.body), {
    jobId: f.job.id, claimToken: CLAIM_TOKEN, status: 'submitted',
  });
  for (const { options } of f.requests) {
    assert.equal(options.headers.Authorization, `Bearer ${TOKEN}`);
    assert.equal(options.redirect, 'error');
    assert.equal(options.method, 'POST');
  }
  assert.equal((await f.state()).phase, 'idle');
  const stored = await fs.readFile(path.join(f.stateDir, 'state-v1.json'), 'utf8');
  assert.doesNotMatch(stored + JSON.stringify(f.logs), /01012345678|테스트 주문|cccccc|tttttt/);
  assert.equal((await fs.stat(path.join(f.stateDir, 'state-v1.json'))).mode & 0o777, 0o600);
});

test('an empty queue never calls send or ack and returns to idle', async t => {
  const f = await fixture(t, { job: null });
  assert.deepEqual(await f.run({ live: true }), { status: 'empty' });
  assert.equal(f.requests.length, 1);
  assert.equal(f.sends.length, 0);
  assert.equal((await f.state()).phase, 'idle');
});

test('quota disappears after claim: no send, one unknown ack, persistent stop', async t => {
  const f = await fixture(t, { preflights: [
    { loggedIn: true, freeRemaining: 1 }, { loggedIn: true, freeRemaining: 0 },
  ] });
  assert.deepEqual(await f.run({ live: true }), { status: 'blocked', reason: 'PREFLIGHT_CHANGED_AFTER_CLAIM' });
  assert.equal(f.sends.length, 0);
  assert.equal(JSON.parse(f.requests[1].options.body).status, 'unknown');
  const previousRequests = f.requests.length;
  assert.equal((await f.run({ live: true })).status, 'blocked');
  assert.equal(f.requests.length, previousRequests);
  assert.equal(f.preflightCalls(), 2);
});

for (const [label, changes] of [
  ['ambiguous UI result', { sendResult: { status: 'unknown' } }],
  ['unexpected UI result', { sendResult: { status: 'sent' } }],
  ['browser exception', { sendError: new Error('recipient 01012345678 and secret') }],
]) {
  test(`${label} is acknowledged unknown once and never automatically retried`, async t => {
    const f = await fixture(t, changes);
    assert.deepEqual(await f.run({ live: true }), { status: 'blocked', reason: 'SEND_OUTCOME_UNKNOWN' });
    assert.equal(f.requests.length, 2);
    assert.equal(f.sends.length, 1);
    assert.equal(JSON.parse(f.requests[1].options.body).status, 'unknown');
    assert.equal((await f.state()).phase, 'blocked');
    assert.equal((await f.run({ live: true })).status, 'blocked');
    assert.equal(f.sends.length, 1);
    assert.equal(f.requests.length, 2);
    assert.doesNotMatch(JSON.stringify(f.logs), /01012345678|secret/);
  });
}

test('a successful UI send followed by lost ack blocks and never resends', async t => {
  const f = await fixture(t, { ackError: new Error('lost response') });
  assert.deepEqual(await f.run({ live: true }), { status: 'blocked', reason: 'ACK_OUTCOME_UNKNOWN' });
  assert.equal(f.sends.length, 1);
  assert.equal(f.requests.length, 2);
  assert.equal((await f.run({ live: true })).status, 'blocked');
  assert.equal(f.sends.length, 1);
  assert.equal(f.requests.length, 2);
});

test('server converts late acknowledgement to unknown: no success claim or retry', async t => {
  const f = await fixture(t, { ackStatus: 'unknown' });
  assert.deepEqual(await f.run({ live: true }), { status: 'blocked', reason: 'SERVER_MARKED_UNKNOWN' });
  assert.equal(f.sends.length, 1);
  assert.ok(!f.logs.some(item => item.event === 'submitted'));
});

test('lost claim response blocks before send and never repeats claim', async t => {
  const f = await fixture(t, { claimError: new Error('connection lost after server claim') });
  assert.deepEqual(await f.run({ live: true }), { status: 'blocked', reason: 'CLAIM_OUTCOME_UNKNOWN' });
  assert.equal(f.requests.length, 1);
  assert.equal(f.sends.length, 0);
  assert.equal((await f.run({ live: true })).status, 'blocked');
  assert.equal(f.requests.length, 1);
});

test('unauthorized API is not automatically retried', async t => {
  const f = await fixture(t, { claimResponse: response({ message: 'Unauthorized.' }, 401) });
  assert.equal((await f.run({ live: true })).reason, 'CLAIM_OUTCOME_UNKNOWN');
  assert.equal(f.requests.length, 1);
  assert.equal(f.sends.length, 0);
});

for (const [label, changes] of [
  ['invalid recipient', { to: '+15551234567' }],
  ['missing claim token', { claimToken: '' }],
  ['oversized message', { text: '가'.repeat(668) }],
  ['unsupported kind', { kind: 'marketing' }],
  ['multiline subject', { title: 'first\nsecond' }],
]) {
  test(`${label} in a claim fails closed without giving it to the browser`, async t => {
    const f = await fixture(t, { job: { ...fakeJob(), ...changes } });
    assert.equal((await f.run({ live: true })).reason, 'CLAIM_OUTCOME_UNKNOWN');
    assert.equal(f.sends.length, 0);
    assert.equal(f.requests.length, 1);
  });
}

test('customer jobs require explicit opt-in even when the server has enabled them', async t => {
  const f = await fixture(t, { job: { ...fakeJob(), kind: 'customer_sms' } });
  assert.deepEqual(await f.run({ live: true }), { status: 'blocked', reason: 'JOB_KIND_NOT_ENABLED' });
  assert.equal(f.sends.length, 0);
  assert.equal(JSON.parse(f.requests[1].options.body).status, 'unknown');
});

test('customer mode consumes one authorized job through the same protocol', async t => {
  const f = await fixture(t, { job: { ...fakeJob(), kind: 'customer_sms' } });
  assert.equal((await f.run({ live: true, allowedKinds: ['self_test', 'customer_sms'], commercialConsentVerified: true })).status, 'submitted');
  assert.equal(f.sends.length, 1);
});

test('customer mode without documented provider consent cannot preflight, claim, or send', async t => {
  const f = await fixture(t, { job: { ...fakeJob(), kind: 'customer_sms' } });
  assert.deepEqual(await f.run({ live: true, allowedKinds: ['self_test', 'customer_sms'] }),
    { status: 'paused', reason: 'COMMERCIAL_CONSENT_REQUIRED' });
  assert.equal(f.preflightCalls(), 0);
  assert.equal(f.requests.length, 0);
  assert.equal(f.sends.length, 0);
});

for (const phase of ['claiming', 'claimed', 'sending', 'acknowledging']) {
  test(`restart with durable ${phase} phase blocks without any external action`, async t => {
    const f = await fixture(t);
    await fs.writeFile(path.join(f.stateDir, 'state-v1.json'), JSON.stringify({
      version: 1, phase, updatedAt: new Date().toISOString(), attemptId: randomUUID(), jobId: f.job.id,
    }), { mode: 0o600 });
    assert.deepEqual(await f.run({ live: true }), { status: 'blocked', reason: 'UNRESOLVED_PRIOR_ATTEMPT' });
    assert.equal(f.preflightCalls(), 0);
    assert.equal(f.sends.length, 0);
    assert.equal(f.requests.length, 0);
  });
}

test('singleton lock refuses a concurrent worker and does not steal a stale lock', async t => {
  const f = await fixture(t);
  let release;
  let entered;
  const enteredPromise = new Promise(resolve => { entered = resolve; });
  f.adapter.preflight = async () => {
    entered();
    await new Promise(resolve => { release = resolve; });
    return { loggedIn: true, freeRemaining: 1 };
  };
  const first = f.run();
  await enteredPromise;
  await assert.rejects(f.run(), { code: 'WORKER_ALREADY_LOCKED' });
  release();
  assert.equal((await first).status, 'dry_run');
  await fs.writeFile(path.join(f.stateDir, 'worker.lock'), '{"pid":999999999}', { mode: 0o600 });
  await assert.rejects(f.run(), { code: 'WORKER_ALREADY_LOCKED' });
  assert.equal(f.requests.length, 0);
});

test('explicit reviewed reset requires the exact blocked attempt and does not touch the server', async t => {
  const f = await fixture(t, { sendResult: { status: 'unknown' } });
  await f.run({ live: true });
  const blocked = await f.state();
  await assert.rejects(resetAfterReview({ stateDir: f.stateDir, expectedAttemptId: blocked.attemptId }), { code: 'EXPLICIT_REVIEW_REQUIRED' });
  await assert.rejects(resetAfterReview({ stateDir: f.stateDir, reviewed: true, expectedAttemptId: randomUUID() }), { code: 'REVIEW_ATTEMPT_MISMATCH' });
  assert.equal((await f.state()).phase, 'blocked');
  await resetAfterReview({ stateDir: f.stateDir, reviewed: true, expectedAttemptId: blocked.attemptId });
  assert.equal((await f.state()).phase, 'idle');
  assert.equal(f.requests.length, 2);
  assert.equal(f.sends.length, 1);
});

test('token loader accepts a valid environment value without a file', async () => {
  assert.equal(await loadDeviceToken({ env: { ENICO_PHONE_RELAY_TOKEN: TOKEN } }), TOKEN);
  await assert.rejects(loadDeviceToken({ env: { ENICO_PHONE_RELAY_TOKEN: 'wrong' } }), { code: 'DEVICE_TOKEN_REQUIRED' });
});

test('token file must be private, regular, owned, nonsymlink, and the only token source', async t => {
  const f = await fixture(t);
  const filePath = path.join(f.stateDir, 'device-token');
  await fs.writeFile(filePath, `${TOKEN}\n`, { mode: 0o600 });
  assert.equal(await loadDeviceToken({ env: {}, tokenFile: filePath }), TOKEN);
  await assert.rejects(loadDeviceToken({ env: { ENICO_PHONE_RELAY_TOKEN: TOKEN }, tokenFile: filePath }), { code: 'MULTIPLE_TOKEN_SOURCES' });
  await fs.chmod(filePath, 0o644);
  await assert.rejects(loadDeviceToken({ env: {}, tokenFile: filePath }), { code: 'UNSAFE_LOCAL_PERMISSIONS' });
  await fs.chmod(filePath, 0o600);
  const link = path.join(f.stateDir, 'token-link');
  await fs.symlink(filePath, link);
  await assert.rejects(loadDeviceToken({ env: {}, tokenFile: link }), { code: 'UNSAFE_LOCAL_FILE' });
});

test('state directories with group access fail before preflight or API', async t => {
  const f = await fixture(t);
  await fs.chmod(f.stateDir, 0o750);
  await assert.rejects(f.run(), { code: 'UNSAFE_LOCAL_PERMISSIONS' });
  assert.equal(f.preflightCalls(), 0);
});

test('invalid or permissive state is not discarded and cannot cause a retry', async t => {
  const f = await fixture(t);
  const filePath = path.join(f.stateDir, 'state-v1.json');
  await fs.writeFile(filePath, 'not json', { mode: 0o600 });
  await assert.rejects(f.run({ live: true }), { code: 'INVALID_LOCAL_STATE' });
  await fs.writeFile(filePath, JSON.stringify({ version: 1, phase: 'idle', updatedAt: new Date().toISOString() }));
  await fs.chmod(filePath, 0o644);
  await assert.rejects(f.run({ live: true }), { code: 'UNSAFE_LOCAL_PERMISSIONS' });
  assert.equal(f.requests.length, 0);
});

test('client refuses non-JSON responses instead of treating a login page as an empty queue', async () => {
  const client = createRelayClient({ token: TOKEN, fetchImpl: async () => new Response('<html>Login</html>') });
  await assert.rejects(client.claim(), { code: 'INVALID_RELAY_RESPONSE' });
});

test('logger exceptions cannot make a submitted job repeat', async t => {
  const f = await fixture(t);
  assert.equal((await f.run({ live: true, logger() { throw new Error('broken logger'); } })).status, 'submitted');
  assert.equal(f.sends.length, 1);
  assert.equal((await f.state()).phase, 'idle');
});
