import test from 'node:test';
import assert from 'node:assert/strict';
import { CdpClient, CdpEvaluationError } from './cdp.mjs';

class FakeSocket extends EventTarget {
  static latest;
  readyState = 0;
  sent = [];

  constructor() {
    super();
    FakeSocket.latest = this;
    setTimeout(() => {
      this.readyState = 1;
      this.dispatchEvent(new Event('open'));
    }, 5);
  }

  send(raw) {
    assert.equal(this.readyState, 1, 'send must wait for the socket to open');
    this.sent.push(JSON.parse(raw));
  }

  receive(payload) {
    this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(payload) }));
  }

  close() {
    if (this.readyState === 3) return;
    this.readyState = 3;
    this.dispatchEvent(new Event('close'));
  }
}

async function connect(timeoutMs = 500) {
  const client = await CdpClient.connect({
    timeoutMs,
    fetchImpl: async url => {
      assert.equal(url.href, 'http://127.0.0.1:9237/json/version');
      return { ok: true, json: async () => ({
        webSocketDebuggerUrl: 'ws://127.0.0.1:9237/devtools/browser/test',
      }) };
    },
    WebSocketImpl: FakeSocket,
  });
  return { client, socket: FakeSocket.latest };
}

test('waits for open, matches out-of-order replies, and routes flattened sessions', async t => {
  const { client, socket } = await connect();
  t.after(() => client.close());
  const targets = client.listTargets();
  const version = client.call('Browser.getVersion');
  const [targetRequest, versionRequest] = socket.sent;
  socket.receive({ id: versionRequest.id, result: { product: 'Fake Browser' } });
  socket.receive({ id: targetRequest.id, result: { targetInfos: [
    { targetId: 'page-1', type: 'page' },
    { targetId: 'frame-1', type: 'iframe' },
    { targetId: 'worker-1', type: 'worker' },
  ] } });
  assert.equal((await version).product, 'Fake Browser');
  assert.deepEqual((await targets).map(target => target.targetId), ['page-1', 'frame-1']);

  const attach = client.attachToTarget('page-1');
  const attachRequest = socket.sent.at(-1);
  assert.equal(attachRequest.params.flatten, true);
  socket.receive({ id: attachRequest.id, result: { sessionId: 'session-1' } });
  assert.equal(await attach, 'session-1');
  const evaluation = client.evaluate('session-1', 'document.title');
  const evaluationRequest = socket.sent.at(-1);
  assert.equal(evaluationRequest.sessionId, 'session-1');
  socket.receive({ id: evaluationRequest.id, sessionId: 'session-1',
    result: { result: { type: 'string', value: 'Example' } } });
  assert.equal(await evaluation, 'Example');
});

test('delivers dialogs and contexts, and never copies remote errors into thrown errors', async t => {
  const { client, socket } = await connect();
  t.after(() => client.close());
  let dialog;
  client.on('Page.javascriptDialogOpening', event => { dialog = event; });
  socket.receive({ method: 'Page.javascriptDialogOpening', sessionId: 's1',
    params: { type: 'alert', message: 'Example' } });
  socket.receive({ method: 'Runtime.executionContextCreated', sessionId: 's1',
    params: { context: { id: 4, auxData: { frameId: 'frame-1' } } } });
  assert.equal(dialog.sessionId, 's1');
  assert.equal(client.listContexts('s1')[0].id, 4);

  const failed = client.evaluate('s1', 'throw new Error("private-token")');
  socket.receive({ id: socket.sent.at(-1).id,
    result: { exceptionDetails: { text: 'private-token', lineNumber: 2,
      exception: { description: 'private-token' } } } });
  await assert.rejects(failed, error => {
    assert.ok(error instanceof CdpEvaluationError);
    assert.equal(error.lineNumber, 2);
    assert.equal(JSON.stringify(error).includes('private-token'), false);
    assert.equal(error.stack.includes('private-token'), false);
    return true;
  });

  const protocolFailure = client.call('Runtime.enable', {}, 's1');
  socket.receive({ id: socket.sent.at(-1).id,
    error: { code: -32000, message: 'private-token' } });
  await assert.rejects(protocolFailure, error => {
    assert.equal(error.code, -32000);
    assert.equal(error.message.includes('private-token'), false);
    return true;
  });
});

test('times out a stalled command, ignores its late reply, and rejects work on disconnect', async t => {
  const { client, socket } = await connect(50);
  t.after(() => client.close());
  const stalled = client.call('Runtime.enable', {}, 's1');
  const stalledId = socket.sent.at(-1).id;
  await assert.rejects(stalled, /timed out/);
  socket.receive({ id: stalledId, result: {} });
  const waiting = client.call('Browser.getVersion');
  socket.close();
  await assert.rejects(waiting, /connection closed/);
  await assert.rejects(client.call('Browser.getVersion'), /not open/);
});
