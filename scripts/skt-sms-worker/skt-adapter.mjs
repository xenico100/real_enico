import { CdpClient } from './cdp.mjs';
import { sktDomAction } from './skt-dom.mjs';

export const SKT_PARENT_URL = 'https://www.tworld.co.kr/web/sms-send/bpcp';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const normalize = value => String(value ?? '').replace(/\s+/gu, ' ').trim();

export class SktAdapterError extends Error {
  constructor(code) {
    super(code);
    this.name = 'SktAdapterError';
    this.code = code;
  }
}

export function validateSenderPhone(value) {
  if (typeof value !== 'string' || !/^010\d{8}$/.test(value)) {
    throw new SktAdapterError('SENDER_PHONE_REQUIRED');
  }
  return value;
}

function parentUrlMatches(raw) {
  try {
    const value = new URL(raw);
    return value.origin === 'https://www.tworld.co.kr' && value.pathname === '/web/sms-send/bpcp'
      && !value.username && !value.password;
  } catch { return false; }
}

function ready(state, expectedSender) {
  return state?.atExpectedOrigin === true && state.isComposer === true
    && state.sender === expectedSender && state.freeMode === true
    && Number.isSafeInteger(state.freeRemaining) && state.freeRemaining > 0
    && Number.isSafeInteger(state.dailySent) && state.dailySent >= 0 && state.dailySent < 500
    && state.sessionSeconds !== 0 && state.attachmentCount === 0 && state.submitCount === 1;
}

export function formMatchesJob(state, job, expectedSender) {
  return ready(state, expectedSender) && state.text === job.text
    && state.recipients?.length === 1 && state.recipients[0] === job.to
    && ((state.mode === 'SMS' && [70, 160].includes(state.maxCharacters))
      || (state.mode === 'MMS' && state.maxCharacters === 2000))
    && Number.isSafeInteger(state.usedCharacters) && state.usedCharacters > 0
    && state.usedCharacters <= state.maxCharacters;
}

export function historyProvesSubmission(before, after, job, startedAt, now, baseline, expectedSender) {
  if (!ready(before, expectedSender) || after?.atExpectedOrigin !== true || after.isHistory !== true
    || after.freeMode !== true || after.freeRemaining !== before.freeRemaining - 1
    || after.dailySent !== before.dailySent + 1 || !Array.isArray(after.entries)
    || baseline?.atExpectedOrigin !== true || baseline.isHistory !== true
    || baseline.freeRemaining !== before.freeRemaining || baseline.dailySent !== before.dailySent
    || !Array.isArray(baseline.entries)
    || now < startedAt || now - startedAt > 120_000) return false;
  const priorIds = new Set(baseline.entries.map(entry => entry.id));
  return after.entries.some(entry => {
    const date = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(entry.date ?? '')
      ? Date.parse(`${entry.date.replace(' ', 'T')}+09:00`) : NaN;
    return /^\d{10,30}$/.test(entry.id ?? '') && !priorIds.has(entry.id)
      && entry.statusCode === '00' && Number.isFinite(date)
      && date >= startedAt - 5_000 && date <= now + 60_000
      && entry.recipient === job.to && entry.recipientConsistent === true
      && entry.sender === expectedSender && entry.outgoing === true
      && typeof entry.text === 'string' && normalize(entry.text) === normalize(job.text);
  });
}

/** Dedicated tab driver; every evaluation re-resolves the cross-origin frame. */
export class CdpSktDriver {
  #cdp;
  #targetId;
  #sessionId;
  #sleep;
  #closed = false;
  #unexpectedDialog = false;
  #submitting = false;
  #dialogListener;
  #senderPhone;

  constructor({ cdp, targetId, sleep = wait, senderPhone }) {
    this.#senderPhone = validateSenderPhone(senderPhone);
    this.#cdp = cdp;
    this.#targetId = targetId;
    this.#sleep = sleep;
    this.#dialogListener = ({ params, sessionId }) => {
      if (sessionId !== this.#sessionId) return;
      if (this.#submitting && params.type === 'alert'
        && params.message === '총 1건의 메시지 중 1건이 완료되었습니다.') {
        // Observed SKT AJAX success alert. This only releases the page; it is not
        // sufficient proof for ack. Full sent-history verification remains required.
        void this.#cdp.call('Page.handleJavaScriptDialog', { accept: true }, sessionId).catch(() => {});
        return;
      }
      this.#unexpectedDialog = true;
      void this.#cdp.call('Page.handleJavaScriptDialog', { accept: false }, sessionId).catch(() => {});
    };
    cdp.on('Page.javascriptDialogOpening', this.#dialogListener);
  }

  async #session() {
    if (this.#closed) throw new SktAdapterError('ADAPTER_CLOSED');
    const matches = (await this.#cdp.listTargets()).filter(target => target.type === 'page'
      && parentUrlMatches(target.url) && (!this.#targetId || target.targetId === this.#targetId));
    if (matches.length !== 1) throw new SktAdapterError('DEDICATED_SKT_TAB_REQUIRED');
    this.#targetId = matches[0].targetId;
    if (!this.#sessionId) {
      this.#sessionId = await this.#cdp.attachToTarget(this.#targetId);
      await this.#cdp.enableSession(this.#sessionId, { page: true });
    }
    return this.#sessionId;
  }

  async #frame() {
    const sessionId = await this.#session();
    const { frameTree } = await this.#cdp.call('Page.getFrameTree', {}, sessionId);
    const matches = [];
    const visit = node => {
      if (!node) return;
      try {
        const url = new URL(node.frame.url);
        if (url.origin === 'https://msgmgr.tworld.co.kr') matches.push(node.frame);
      } catch { /* Non-URL frame names cannot be the authenticated SMS frame. */ }
      for (const child of node.childFrames ?? []) visit(child);
    };
    visit(frameTree);
    if (matches.length !== 1) throw new SktAdapterError('SKT_IFRAME_UNAVAILABLE');
    const frame = matches[0];
    const { executionContextId } = await this.#cdp.call('Page.createIsolatedWorld', {
      frameId: frame.id, worldName: 'enico-skt-sms-worker',
    }, sessionId);
    return { sessionId, contextId: executionContextId, pathname: new URL(frame.url).pathname };
  }

  async #action(action, job) {
    const { sessionId, contextId } = await this.#frame();
    const argument = { action, expectedSender: this.#senderPhone, ...(job ? {
      job: { id: job.id, to: job.to, text: job.text },
    } : {}) };
    return this.#cdp.evaluate(sessionId, `(${sktDomAction.toString()})(${JSON.stringify(argument)})`, { contextId });
  }

  async inspectComposer() {
    let snapshot = await this.#action('composer');
    if (snapshot.isComposer) {
      if (Number.isSafeInteger(snapshot.sessionSeconds) && snapshot.sessionSeconds > 0
        && snapshot.sessionSeconds <= 300) {
        if ((await this.#action('extendSession'))?.extended) {
          await this.#sleep(200);
          snapshot = await this.#action('composer');
        }
      }
      return snapshot;
    }
    const navigation = await this.#action('openComposer');
    if (!navigation?.navigated) return snapshot;
    for (let attempt = 0; attempt < 10; attempt += 1) {
      await this.#sleep(400);
      try {
        snapshot = await this.#action('composer');
        if (snapshot.isComposer) return snapshot;
      } catch { /* A context can disappear during a known menu navigation. */ }
    }
    throw new SktAdapterError('SKT_COMPOSER_UNAVAILABLE');
  }

  async prepare(job) {
    if (!(await this.#action('prepare', job))?.prepared) throw new SktAdapterError('FORM_PREPARATION_FAILED');
  }

  async submitOnce(job) {
    this.#unexpectedDialog = false;
    this.#submitting = true;
    return this.#action('submit', job);
  }

  get unexpectedDialog() { return this.#unexpectedDialog; }
  finishAttempt() { this.#submitting = false; }

  async readHistory(job) {
    const sessionId = await this.#session();
    // Explicit GET of the observed outer URL avoids reloading an iframe POST.
    // This recovers the observed hanging send page without another submit.
    const result = await this.#cdp.call('Page.navigate', { url: SKT_PARENT_URL }, sessionId);
    if (result.errorText) throw new SktAdapterError('HISTORY_NAVIGATION_FAILED');
    let home;
    for (let attempt = 0; attempt < 12; attempt += 1) {
      await this.#sleep(500);
      try {
        const snapshot = await this.#action('history', job);
        if (snapshot.isHistory && snapshot.historyReady === true) {
          home = snapshot;
          break;
        }
      } catch { /* The safe GET replaces the iframe and its execution context. */ }
    }
    if (!home) throw new SktAdapterError('HISTORY_UNAVAILABLE');
    // The home URL appears before its AJAX quotas and conversation list. An early
    // missing recipient is not evidence of an empty history. Open only after the
    // authenticated account's existing conversation list is known to be loaded.
    const conversation = await this.#action('openConversation', job);
    if (conversation.missing === true) return home;
    if (!conversation.opened) throw new SktAdapterError('CONVERSATION_UNAVAILABLE');
    for (let attempt = 0; attempt < 12; attempt += 1) {
      await this.#sleep(400);
      try {
        const detail = await this.#action('history', job);
        if (detail.conversationSelected && detail.detailReady === true) return detail;
      } catch { /* Wait for the selected conversation's asynchronous messages. */ }
    }
    throw new SktAdapterError('CONVERSATION_HISTORY_UNAVAILABLE');
  }

  async close() {
    this.#closed = true;
    this.#cdp.off('Page.javascriptDialogOpening', this.#dialogListener);
    this.#cdp.close(); // Disconnect automation; do not close the browser or page.
  }
}

export class SktAdapter {
  #driver;
  #clock;
  #attempted = new Set();
  #busy = false;
  #senderPhone;

  constructor({ driver, clock = Date.now, senderPhone }) {
    this.#senderPhone = validateSenderPhone(senderPhone);
    this.#driver = driver;
    this.#clock = clock;
  }

  async preflight() {
    const state = await this.#driver.inspectComposer();
    return {
      loggedIn: state?.atExpectedOrigin === true && state.isComposer === true && state.sender === this.#senderPhone,
      freeRemaining: ready(state, this.#senderPhone) ? state.freeRemaining : null,
    };
  }

  async send(job) {
    if (this.#busy || !job || !UUID.test(job.id) || this.#attempted.has(job.id)
      || !/^010\d{8}$/.test(job.to) || typeof job.text !== 'string' || !job.text.trim()
      || Buffer.byteLength(job.text, 'utf8') > 2000 || /[\u0000\uD800-\uDFFF]/.test(job.text)
      || !['self_test', 'customer_sms'].includes(job.kind)
      || (job.kind === 'self_test' && job.to !== this.#senderPhone)) return { status: 'unknown' };
    this.#busy = true;
    try {
      if (!ready(await this.#driver.inspectComposer(), this.#senderPhone)) return { status: 'unknown' };
      // Capture individual message IDs before modifying the composer. The safe
      // history GET also discards leftover drafts without invoking reset prompts.
      const baseline = await this.#driver.readHistory(job);
      if (baseline?.atExpectedOrigin !== true || baseline.isHistory !== true
        || !Array.isArray(baseline.entries)) return { status: 'unknown' };
      if (!ready(await this.#driver.inspectComposer(), this.#senderPhone)) return { status: 'unknown' };
      await this.#driver.prepare(job);
      const before = await this.#driver.inspectComposer();
      if (!formMatchesJob(before, job, this.#senderPhone)) return { status: 'unknown' };
      this.#attempted.add(job.id);
      const startedAt = this.#clock();
      try {
        const submission = await this.#driver.submitOnce(job);
        if (submission?.invoked === false) return { status: 'unknown' };
      } catch {
        // The click can have succeeded even if the iframe hung or CDP timed out.
        // Only a readback can resolve this; there is never a second click.
      }
      if (this.#driver.unexpectedDialog) return { status: 'unknown' };
      let after;
      try { after = await this.#driver.readHistory(job); } catch { return { status: 'unknown' }; }
      if (this.#driver.unexpectedDialog) return { status: 'unknown' };
      return { status: historyProvesSubmission(before, after, job, startedAt, this.#clock(), baseline, this.#senderPhone)
        ? 'submitted' : 'unknown' };
    } catch {
      return { status: 'unknown' };
    } finally {
      this.#driver.finishAttempt?.();
      this.#busy = false;
    }
  }

  async close() { await this.#driver.close?.(); }
}

export async function createAdapter({ cdp, driver, clock, sleep, targetId,
  senderPhone = process.env.ENICO_SKT_SENDER_PHONE } = {}) {
  validateSenderPhone(senderPhone);
  if (driver) return new SktAdapter({ driver, clock, senderPhone });
  const client = cdp ?? await CdpClient.connect({ port: 9237 });
  return new SktAdapter({ driver: new CdpSktDriver({ cdp: client, targetId, sleep, senderPhone }), clock, senderPhone });
}
