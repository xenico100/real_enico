/* eslint-disable @typescript-eslint/no-require-imports -- Isolated Node test runner. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

const source = ts.transpileModule(fs.readFileSync('src/lib/orders/phoneRelayShortcut.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const mod = { exports: {} };
vm.runInNewContext(`(function(module,exports){${source}\n})`, {})(mod, mod.exports);
const { phoneRelayShortcutDocument, createPhoneRelayShortcut, PHONE_RELAY_TOKEN_PLACEHOLDER } = mod.exports;
const normalize = value => JSON.parse(JSON.stringify(value));
const document = options => normalize(phoneRelayShortcutDocument(options));
const identifier = action => action.WFWorkflowActionIdentifier.replace('is.workflow.actions.', '');

test('public signing template has only an import placeholder and a matching setup question', () => {
  const doc = document();
  const question = doc.WFWorkflowImportQuestions[0];
  assert.equal(doc.WFWorkflowImportQuestions.length, 1);
  assert.equal(question.ActionIndex, 0);
  assert.equal(question.Category, 'Parameter');
  assert.equal(question.ParameterKey, 'WFTextActionText');
  assert.equal(doc.WFWorkflowActions[0].WFWorkflowActionParameters[question.ParameterKey], PHONE_RELAY_TOKEN_PLACEHOLDER);
  assert.equal(question.DefaultValue, '');
  assert.equal(doc.WFWorkflowHasShortcutInputVariables, false);
  assert.deepEqual(doc.WFWorkflowInputContentItemClasses, []);
  assert.equal(createPhoneRelayShortcut(), createPhoneRelayShortcut());
});

test('device credentials are restricted and occur only in the initial text action', () => {
  for (const invalid of ['', 'short', 'x'.repeat(42), 'x'.repeat(129), 'x'.repeat(44) + '\n', 'x'.repeat(44) + '&']) {
    assert.throws(() => document({ token: invalid }), /Invalid phone relay device token/);
  }
  const token = 'a'.repeat(43);
  const doc = document({ token });
  assert.deepEqual(doc.WFWorkflowImportQuestions, []);
  assert.equal(JSON.stringify(doc).split(token).length, 2);
  assert.equal(doc.WFWorkflowActions[0].WFWorkflowActionParameters.WFTextActionText, token);
});

test('all action references resolve backward, and control flow groups are balanced', () => {
  const doc = document();
  const seen = new Set();
  const groups = [];
  const walk = value => {
    if (!value || typeof value !== 'object') return;
    if (value.Type === 'ActionOutput') assert.ok(seen.has(value.OutputUUID), `Unknown/forward output ${value.OutputUUID}`);
    for (const item of Object.values(value)) walk(item);
  };
  for (const action of doc.WFWorkflowActions) {
    const p = action.WFWorkflowActionParameters;
    walk(p);
    assert.ok(!seen.has(p.UUID));
    seen.add(p.UUID);
    if (p.WFControlFlowMode === 0) groups.push(p.GroupingIdentifier);
    if (p.WFControlFlowMode === 2) assert.equal(groups.pop(), p.GroupingIdentifier);
  }
  assert.deepEqual(groups, []);
});

test('queue URLs are fixed, bearer headers stay out of URLs, and the loop is bounded', () => {
  const actions = document().WFWorkflowActions;
  const http = actions.filter(a => identifier(a) === 'downloadurl');
  assert.equal(http.length, 2);
  assert.equal(http[0].WFWorkflowActionParameters.WFURL.Value.string, 'https://enicoveck.com/api/phone-relay/claim');
  assert.equal(http[1].WFWorkflowActionParameters.WFURL.Value.string, 'https://enicoveck.com/api/phone-relay/ack');
  for (const action of http) {
    const p = action.WFWorkflowActionParameters;
    assert.equal(p.WFHTTPMethod, 'POST');
    const authorization = p.WFHTTPHeaders.Value.WFDictionaryFieldValueItems.find(v => v.WFKey.Value.string === 'Authorization');
    assert.equal(authorization.WFValue.Value.string, 'Bearer \uFFFC');
    assert.equal(Object.keys(authorization.WFValue.Value.attachmentsByRange)[0], '{7, 1}');
  }
  const repeats = actions.filter(a => identifier(a) === 'repeat.count');
  assert.equal(repeats.length, 2);
  assert.equal(repeats[0].WFWorkflowActionParameters.WFRepeatCount, 10);
  const delay = actions.find(a => identifier(a) === 'delay');
  assert.equal(delay.WFWorkflowActionParameters.WFDelayTime, 3);
  assert.ok(actions.indexOf(delay) > actions.findLastIndex(a => identifier(a) === 'downloadurl'));
});

test('notification and message use authenticated job fields, acknowledgment follows message', () => {
  const actions = document().WFWorkflowActions;
  const sendIndex = actions.findIndex(a => identifier(a) === 'sendmessage');
  const notifyIndex = actions.findIndex(a => identifier(a) === 'notification');
  const ackIndex = actions.findLastIndex(a => identifier(a) === 'downloadurl');
  assert.ok(notifyIndex < sendIndex && sendIndex < ackIndex);
  const send = actions[sendIndex].WFWorkflowActionParameters;
  assert.equal(send.ShowWhenRun, false);
  assert.equal(send.IntentAppIdentifier, 'com.apple.MobileSMS');
  const recipientAction = actions.find(a => a.WFWorkflowActionParameters.UUID === send.WFSendMessageActionRecipients.Value.OutputUUID);
  assert.equal(recipientAction.WFWorkflowActionParameters.WFDictionaryKey, 'to');
  const messageRef = Object.values(send.WFSendMessageContent.Value.attachmentsByRange)[0];
  assert.equal(actions.find(a => a.WFWorkflowActionParameters.UUID === messageRef.OutputUUID).WFWorkflowActionParameters.WFDictionaryKey, 'text');
  const body = actions[ackIndex].WFWorkflowActionParameters.WFJSONValues.Value.WFDictionaryFieldValueItems;
  assert.deepEqual(body.map(v => v.WFKey.Value.string), ['jobId', 'claimToken', 'status']);
  assert.equal(body[2].WFValue.Value.string, 'submitted');
  const serialized = JSON.stringify(actions);
  assert.ok(!serialized.includes('ExtensionInput'));
  assert.ok(!serialized.includes('Clipboard'));
  assert.ok(!serialized.includes('getmail'));
});

test('XML output is a deterministic unsigned plist, never described as already signed', () => {
  const xml = createPhoneRelayShortcut();
  assert.ok(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>'));
  assert.ok(xml.includes('<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"'));
  assert.ok(xml.endsWith('</plist>\n'));
  assert.ok(xml.includes('<key>ShowWhenRun</key><false/>'));
  assert.ok(xml.includes('<key>WFWorkflowImportQuestions</key><array><dict>'));
});
