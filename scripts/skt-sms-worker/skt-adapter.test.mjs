import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import * as fs from 'node:fs/promises';
import vm from 'node:vm';
import { EventEmitter } from 'node:events';
import { runOnce } from './core.mjs';
import { EXPECTED_SENDER, SKT_PARENT_URL, CdpSktDriver, SktAdapter, formMatchesJob, historyProvesSubmission } from './skt-adapter.mjs';
import { sktDomAction } from './skt-dom.mjs';

const NOW = Date.parse('2026-10-15T07:22:10Z'); // 16:22 KST.
const bankMessage = '[ENICO VECK] 무통장입금 주문 안내\n주문번호: TEST-ORDER-001\n상품: 테스트 바지 1개\n입금액: 123,000원\n은행: 테스트은행\n계좌: 000-000-000000\n예금주: 테스트\n입금 확인 후 제작·배송을 진행합니다. 주문이 취소된 경우 입금하지 마세요.';
const job = Object.freeze({
  id: 'b0ada310-0e88-4fa3-91a5-8fb57fe9e92a', claimToken: 'C'.repeat(43),
  to: '01011112222', text: bankMessage, title: '[ENICO VECK] 주문 안내', kind: 'customer_sms',
});

function counterDomFixture({ mode = 'MMS', formType = mode === 'MMS' ? '1' : '0' } = {}) {
  const element = (properties = {}, shown = true) => ({
    offsetWidth: shown ? 10 : 0, offsetHeight: shown ? 10 : 0,
    getClientRects: () => shown ? [{}] : [], ...properties,
  });
  const body = mode === 'MMS' ? '가'.repeat(338) : '테스트';
  const values = new Map([
    ['textarea#write_text[name="msg_txt"]', element({ value: body })],
    ['#send_phone_text', element({ value: EXPECTED_SENDER })],
    ['#count_letter', element({ textContent: String(body.length) })],
    ['#count_letter_max', element({ textContent: mode === 'MMS' ? '2000' : '70' })],
    ['#count_letter_mms', element({ textContent: 'MMS' }, mode === 'MMS')],
    ['#count_letter_sms', element({ textContent: 'SMS' }, mode === 'SMS')],
    ['input[name="msg_type"]', element({ value: formType }, false)],
    ['input#upload[type="file"]', element({ files: [] })],
  ]);
  const sendButton = element();
  const recipient = element({ getAttribute: name => name === 'data-phone-key' ? `N${job.to}` : null });
  return vm.runInNewContext(`(${sktDomAction.toString()})({action:'composer'})`, {
    location: { protocol: 'https:', hostname: 'msgmgr.tworld.co.kr' },
    getComputedStyle: () => ({ visibility: 'visible' }),
    document: {
      // SKT's header storage counters coexist with the actual compose counter.
      // Matching the whole body can accidentally find multiple SMS/MMS counters.
      body: { innerText: `무료 문자\n99 건\n일 전송 건수\n1 건\n유료전환\nSMS\n1 / 100 MMS\n0 / 10\n${body.length} / ${mode === 'MMS' ? 2000 : 70} ${mode}` },
      querySelector: selector => values.get(selector) ?? null,
      querySelectorAll: selector => selector === 'li[data-phone-key]' ? [recipient]
        : selector === '[onclick*="validate_frm("]' ? [sendButton] : [],
    },
  });
}

for (const mode of ['SMS', 'MMS']) {
  test(`${mode} counter uses compose IDs despite conflicting header storage counters`, () => {
    const snapshot = counterDomFixture({ mode });
    assert.equal(snapshot.mode, mode);
    assert.equal(snapshot.usedCharacters, mode === 'MMS' ? 338 : 3);
    assert.equal(snapshot.maxCharacters, mode === 'MMS' ? 2000 : 70);
    assert.equal(snapshot.freeRemaining, 99);
    assert.equal(snapshot.dailySent, 1);
  });
}

test('visible MMS label without matching hidden message type remains unverified', () => {
  assert.equal(counterDomFixture({ mode: 'MMS', formType: '0' }).mode, null);
});

function composer(overrides = {}) {
  return {
    atExpectedOrigin: true, isComposer: true, sender: EXPECTED_SENDER,
    freeMode: true, freeRemaining: 99, dailySent: 1,
    text: '', recipients: [], mode: 'SMS', usedCharacters: 0,
    maxCharacters: 70, attachmentCount: 0, submitCount: 1, ...overrides,
  };
}

function history(currentJob = job, overrides = {}) {
  return {
    atExpectedOrigin: true, isHistory: true, freeMode: true,
    freeRemaining: 98, dailySent: 2,
    entries: [{ recipient: currentJob.to, recipientConsistent: true,
      sender: EXPECTED_SENDER, outgoing: true, text: currentJob.text,
      id: '152275561978481', statusCode: '00', date: '2026-10-15 16:22:10' }],
    ...overrides,
  };
}

class HistoryBrowserFixture extends EventEmitter {
  historyReads = 0;
  conversationOpens = 0;
  constructor(snapshots, conversation = { opened: true }) {
    super();
    this.snapshots = snapshots;
    this.last = snapshots.at(-1);
    this.conversation = conversation;
  }
  async listTargets() { return [{ targetId: 'dedicated-tab', type: 'page', url: SKT_PARENT_URL }]; }
  async attachToTarget() { return 'session'; }
  async enableSession() {}
  async call(method) {
    if (method === 'Page.navigate') return {};
    if (method === 'Page.createIsolatedWorld') return { executionContextId: 1 };
    assert.equal(method, 'Page.getFrameTree');
    return { frameTree: { frame: { id: 'outer', url: SKT_PARENT_URL }, childFrames: [
      { frame: { id: 'sms-frame', url: 'https://msgmgr.tworld.co.kr/html/home/home_main.php' } },
    ] } };
  }
  async evaluate(session, expression) {
    if (expression.includes('"action":"openConversation"')) {
      this.conversationOpens += 1;
      return this.conversation;
    }
    assert.ok(expression.includes('"action":"history"'));
    this.historyReads += 1;
    return structuredClone(this.snapshots.shift() ?? this.last);
  }
  close() {}
}

test('home URL before AJAX data cannot become an empty baseline or unknown post-send proof', async t => {
  const loaded = history(job, { historyReady: true, conversationSelected: false, entries: [] });
  const detailed = history(job, { historyReady: true, conversationSelected: true, detailReady: true });
  const browser = new HistoryBrowserFixture([
    history(job, { historyReady: false, freeRemaining: null, dailySent: null, entries: [] }),
    loaded,
    { ...loaded, conversationSelected: true, detailReady: false },
    detailed,
  ]);
  const driver = new CdpSktDriver({ cdp: browser, sleep: async () => {} });
  t.after(() => driver.close());
  const result = await driver.readHistory(job);
  assert.equal(result.entries[0].text, bankMessage);
  assert.equal(browser.historyReads, 4);
  assert.equal(browser.conversationOpens, 1, 'conversation is opened once after its list loads');
});

test('a genuinely missing recipient is accepted only after the known sender list loads', async t => {
  const browser = new HistoryBrowserFixture([
    history(job, { historyReady: false, freeRemaining: null, dailySent: null, entries: [] }),
    history(job, { historyReady: true, entries: [] }),
  ], { opened: false, missing: true });
  const driver = new CdpSktDriver({ cdp: browser, sleep: async () => {} });
  t.after(() => driver.close());
  const result = await driver.readHistory(job);
  assert.equal(result.historyReady, true);
  assert.equal(browser.historyReads, 2);
  assert.equal(browser.conversationOpens, 1);
});

test('a permanently incomplete home page never opens a conversation or returns empty history', async t => {
  const browser = new HistoryBrowserFixture([
    history(job, { historyReady: false, freeRemaining: null, dailySent: null, entries: [] }),
  ]);
  const driver = new CdpSktDriver({ cdp: browser, sleep: async () => {} });
  t.after(() => driver.close());
  await assert.rejects(driver.readHistory(job), error => error.code === 'HISTORY_UNAVAILABLE');
  assert.equal(browser.historyReads, 12);
  assert.equal(browser.conversationOpens, 0);
});

function fixture({ initial, prepared, sent, throwAfterClick = false, unexpectedDialog = false } = {}) {
  const calls = { prepares: [], submits: [], historyReads: 0 };
  let state = composer(initial);
  const driver = {
    unexpectedDialog: false,
    async inspectComposer() { return structuredClone(state); },
    async prepare(value) {
      calls.prepares.push(structuredClone(value));
      state = composer({ text: value.text, recipients: [value.to], mode: 'MMS',
        usedCharacters: value.text.length, maxCharacters: 2000, ...prepared });
    },
    async submitOnce(value) {
      calls.submits.push(structuredClone(value));
      this.unexpectedDialog = unexpectedDialog;
      if (throwAfterClick) throw new Error('fake timeout containing a private message');
      return { invoked: true };
    },
    async readHistory() {
      calls.historyReads += 1;
      return calls.historyReads === 1
        ? history(job, { freeRemaining: 99, dailySent: 1, entries: [] }) : history(job, sent);
    },
  };
  const adapter = new SktAdapter({ driver, clock: () => NOW });
  return { calls, adapter, driver };
}

test('complete bank-transfer account, amount, and order text remains verbatim in MMS', async () => {
  const { adapter, calls } = fixture();
  assert.ok(bankMessage.length > 70);
  assert.deepEqual(await adapter.preflight(), { loggedIn: true, freeRemaining: 99 });
  assert.deepEqual(await adapter.send(job), { status: 'submitted' });
  assert.equal(calls.prepares[0].text, bankMessage);
  assert.equal(calls.submits[0].text, bankMessage);
  assert.equal(calls.submits[0].to, job.to);
  assert.equal(calls.submits.length, 1);
  assert.equal(calls.historyReads, 2);
  assert.deepEqual(await adapter.send(job), { status: 'unknown' });
  assert.equal(calls.submits.length, 1, 'same job is never clicked twice');
});

for (const [name, initial] of [
  ['paid mode', { freeMode: false }],
  ['exhausted free allocation', { freeRemaining: 0 }],
  ['unverified allowance', { freeRemaining: null }],
  ['different sender', { sender: '01000000000' }],
  ['daily ceiling', { dailySent: 500 }],
]) {
  test(`${name} cannot prepare or submit a payment notification`, async () => {
    const { adapter, calls } = fixture({ initial });
    assert.deepEqual(await adapter.send(job), { status: 'unknown' });
    assert.equal(calls.prepares.length, 0);
    assert.equal(calls.submits.length, 0);
  });
}

for (const [name, prepared] of [
  ['wrong recipient', { recipients: ['01099998888'] }],
  ['second recipient', { recipients: [job.to, '01099998888'] }],
  ['truncated account instructions', { text: bankMessage.slice(0, 70) }],
  ['quota exhausted while preparing', { freeRemaining: 0 }],
  ['unknown message mode', { mode: null }],
  ['attachment retained from another draft', { attachmentCount: 1 }],
]) {
  test(`${name} fails the final pre-submit boundary`, async () => {
    const { adapter, calls } = fixture({ prepared });
    assert.deepEqual(await adapter.send(job), { status: 'unknown' });
    assert.equal(calls.submits.length, 0);
  });
}

test('a timeout after the only click is resolved by positive sent-history proof', async () => {
  const { adapter, calls } = fixture({ throwAfterClick: true });
  assert.deepEqual(await adapter.send(job), { status: 'submitted' });
  assert.equal(calls.submits.length, 1);
  assert.equal(calls.historyReads, 2);
});

test('an unobserved JavaScript dialog makes the attempt unknown without a retry', async () => {
  const { adapter, calls } = fixture({ unexpectedDialog: true });
  assert.deepEqual(await adapter.send(job), { status: 'unknown' });
  assert.equal(calls.submits.length, 1);
  assert.equal(calls.historyReads, 1);
});

test('a self-test can target only the verified operator number', async () => {
  const { adapter, calls } = fixture();
  assert.deepEqual(await adapter.send({ ...job, kind: 'self_test' }), { status: 'unknown' });
  assert.equal(calls.prepares.length, 0);
});

test('history must prove exact outgoing recipient and full body plus one free send', () => {
  const before = composer({ text: job.text, recipients: [job.to], mode: 'MMS',
    maxCharacters: 2000, usedCharacters: job.text.length });
  assert.equal(formMatchesJob(before, job), true);
  const baseline = history(job, { freeRemaining: 99, dailySent: 1, entries: [] });
  assert.equal(historyProvesSubmission(before, history(), job, NOW, NOW, baseline), true);
  for (const overrides of [
    { freeRemaining: 99 }, { freeRemaining: 97 }, { dailySent: 1 },
    { entries: [{ ...history().entries[0], recipient: EXPECTED_SENDER }] },
    { entries: [{ ...history().entries[0], text: 'a shortened preview' }] },
    { entries: [{ ...history().entries[0], outgoing: false }] },
    { entries: [{ ...history().entries[0], date: '2026-10-15 16:21:00' }] },
    { entries: [{ ...history().entries[0], statusCode: '99' }] },
    { entries: [{ ...history().entries[0], recipientConsistent: false }] },
  ]) assert.equal(historyProvesSubmission(before, history(job, overrides), job, NOW, NOW, baseline), false);
  assert.equal(historyProvesSubmission(before, history(), job, NOW, NOW,
    { ...baseline, entries: history().entries }), false, 'an old message ID cannot prove a new send');
});

async function withQueue(t, adapter) {
  const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), 'enico-skt-adapter-test-'));
  t.after(() => fs.rm(stateDir, { recursive: true, force: true }));
  const calls = { claim: 0, ack: [] };
  const fetchImpl = async (url, options) => {
    assert.equal(options.redirect, 'error');
    const endpoint = new URL(url).pathname.split('/').at(-1);
    if (endpoint === 'claim') {
      calls.claim += 1;
      return { ok: true, text: async () => JSON.stringify({ job }) };
    }
    assert.equal(endpoint, 'ack');
    const body = JSON.parse(options.body);
    calls.ack.push(body);
    return { ok: true, text: async () => JSON.stringify({ ok: true, status: body.status }) };
  };
  return { calls, run: () => runOnce({ adapter, stateDir, fetchImpl, token: 'T'.repeat(43),
    live: true, allowedKinds: ['customer_sms'], commercialConsentVerified: true }) };
}

test('queue acknowledges submitted only after verified bank-message history', async t => {
  const { adapter, calls } = fixture();
  const queue = await withQueue(t, adapter);
  assert.deepEqual(await queue.run(), { status: 'submitted' });
  assert.equal(queue.calls.claim, 1);
  assert.equal(queue.calls.ack.length, 1);
  assert.equal(queue.calls.ack[0].jobId, job.id);
  assert.equal(queue.calls.ack[0].status, 'submitted');
  assert.equal(calls.submits.length, 1);
});

test('ambiguous history acknowledges unknown and permanently blocks the next poll', async t => {
  const { adapter, calls } = fixture({ sent: { entries: [] } });
  const queue = await withQueue(t, adapter);
  assert.equal((await queue.run()).status, 'blocked');
  assert.equal(queue.calls.ack[0].status, 'unknown');
  assert.equal((await queue.run()).status, 'blocked');
  assert.equal(queue.calls.claim, 1);
  assert.equal(calls.submits.length, 1);
});
