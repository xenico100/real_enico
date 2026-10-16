import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { EventEmitter } from 'node:events';
import { CdpSktDriver, SKT_PARENT_URL } from './skt-adapter.mjs';
import { sktDomAction } from './skt-dom.mjs';

const SENDER = '01099998888';
const NOTICE = '자동 로그아웃 시간이 연장되었습니다.';
const POPUP = 'https://msgmgr.tworld.co.kr/html/popup/common_ok.php?msg=' + encodeURIComponent(NOTICE);

function popupFixture({ src = POPUP, ready = true, message = NOTICE } = {}) {
  let clicks = 0;
  const element = properties => ({
    offsetWidth: 100, offsetHeight: 20, getClientRects: () => [{}], ...properties,
  });
  const button = element({ innerText: '확인', click: () => { clicks += 1; } });
  const popup = {
    readyState: ready ? 'complete' : 'loading',
    body: { innerText: message + '\n확인' },
    querySelectorAll: selector => selector === 'button[onclick="safeCloseModalPopup();"]' ? [button] : [],
  };
  const frame = element({ getAttribute: () => src, contentDocument: popup });
  const result = vm.runInNewContext('(' + sktDomAction.toString() + ')('
    + JSON.stringify({ action: 'dismissSessionExtension', expectedSender: SENDER }) + ')', {
    URL,
    location: { protocol: 'https:', hostname: 'msgmgr.tworld.co.kr',
      href: 'https://msgmgr.tworld.co.kr/html/sms/sms_main.php' },
    getComputedStyle: () => ({ visibility: 'visible' }),
    document: { body: { innerText: '' }, querySelectorAll: selector => selector === 'iframe.popupFrame' ? [frame] : [] },
  });
  return { result, clicks };
}

test('only the observed session-extension notice may be confirmed', () => {
  const { result, clicks } = popupFixture();
  assert.equal(result.dismissed, true);
  assert.equal(clicks, 1);
});

for (const src of [
  'https://msgmgr.tworld.co.kr/html/popup/common_ok.php?msg=' + encodeURIComponent('결제 확인'),
  'https://msgmgr.tworld.co.kr/html/popup/home_send_enter.php',
  'https://other.invalid/html/popup/common_ok.php?msg=' + encodeURIComponent(NOTICE),
]) {
  test('an unrelated modal is never accepted: ' + new URL(src).pathname + ' / ' + new URL(src).hostname, () => {
    const { result, clicks } = popupFixture({ src });
    assert.equal(result.blocked, true);
    assert.equal(clicks, 0);
  });
}

test('the known notice waits for its actual document rather than clicking a loading frame', () => {
  const { result, clicks } = popupFixture({ ready: false });
  assert.equal(result.pending, true);
  assert.equal(clicks, 0);
});

class SessionBrowser extends EventEmitter {
  constructor({ extension = false, blocked = false } = {}) {
    super();
    this.extension = extension;
    this.blocked = blocked;
    this.present = !extension;
    this.waiting = 0;
    this.worldFrames = [];
    this.actions = [];
  }
  async listTargets() { return [{ targetId: 'tab', type: 'page', url: SKT_PARENT_URL }]; }
  async attachToTarget() { return 'session'; }
  async enableSession() {}
  async call(method, params) {
    if (method === 'Page.createIsolatedWorld') {
      this.worldFrames.push(params.frameId);
      assert.equal(params.frameId, 'sms', 'session popup must never become the SMS application frame');
      return { executionContextId: 1 };
    }
    assert.equal(method, 'Page.getFrameTree');
    return { frameTree: { frame: { id: 'outer', url: SKT_PARENT_URL }, childFrames: [
      { frame: { id: 'sms', url: 'https://msgmgr.tworld.co.kr/html/sms/sms_main.php' },
        childFrames: this.present ? [{ frame: { id: 'notice', url: POPUP } }] : [] },
    ] } };
  }
  async evaluate(session, expression) {
    const action = /"action":"([^"]+)"/.exec(expression)?.[1];
    this.actions.push(action);
    if (action === 'dismissSessionExtension') {
      if (this.blocked) return { blocked: true };
      if (this.waiting > 0) { this.waiting -= 1; return { pending: true }; }
      const dismissed = this.present;
      this.present = false;
      return { dismissed };
    }
    if (action === 'composer') return {
      isComposer: true, blockingPopup: this.present,
      sessionSeconds: this.extension ? 290 : 1798,
      freeRemaining: 97, dailySent: 0,
    };
    if (action === 'extendSession') {
      this.extension = false;
      this.present = true;
      this.waiting = 1;
      return { extended: true };
    }
    assert.fail('unexpected browser action: ' + action);
  }
  close() {}
}

test('the real two-frame layout stays inspectable after the session notice opens', async t => {
  const browser = new SessionBrowser();
  const driver = new CdpSktDriver({ cdp: browser, senderPhone: SENDER, sleep: async () => {} });
  t.after(() => driver.close());
  const result = await driver.inspectComposer();
  assert.equal(result.freeRemaining, 97);
  assert.equal(result.blockingPopup, false);
  assert.ok(browser.worldFrames.length >= 2);
  assert.deepEqual(browser.actions, ['dismissSessionExtension', 'composer']);
});

test('extension waits for and closes its informational popup, then verifies the renewed timer', async t => {
  const browser = new SessionBrowser({ extension: true });
  const driver = new CdpSktDriver({ cdp: browser, senderPhone: SENDER, sleep: async () => {} });
  t.after(() => driver.close());
  const result = await driver.inspectComposer();
  assert.equal(result.sessionSeconds, 1798);
  assert.equal(result.blockingPopup, false);
  assert.equal(browser.actions.filter(action => action === 'extendSession').length, 1);
  assert.ok(browser.actions.filter(action => action === 'dismissSessionExtension').length >= 3);
  assert.equal(browser.actions.includes('submit'), false);
});

test('an unrecognized modal stops preflight before composer, queue claim or submit', async t => {
  const browser = new SessionBrowser({ blocked: true });
  const driver = new CdpSktDriver({ cdp: browser, senderPhone: SENDER, sleep: async () => {} });
  t.after(() => driver.close());
  await assert.rejects(driver.inspectComposer(), error => error.code === 'SKT_MODAL_REQUIRES_REVIEW');
  assert.deepEqual(browser.actions, ['dismissSessionExtension']);
});
