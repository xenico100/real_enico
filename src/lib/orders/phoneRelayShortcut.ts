/**
 * Apple Shortcuts source, not a signed installable artifact. The public template
 * contains no device credential; Shortcuts asks for it during import. Sign only
 * that template on macOS before publishing it. Never sign or publish a populated
 * per-device copy: Apple's signing service receives the shortcut for validation.
 *
 * The email is only a wake-up trigger. Its input is intentionally never read.
 * Recipients and messages come only from the authenticated, fixed-origin queue.
 */

type PlistValue = string | number | boolean | PlistValue[] | { [key: string]: PlistValue };
type PlistDictionary = { [key: string]: PlistValue };

export const PHONE_RELAY_SHORTCUT_NAME = 'ENICO VECK 문자 발송';
export const PHONE_RELAY_MAIL_SUBJECT = '[ENICO PHONE]';
export const PHONE_RELAY_MAIL_SENDER = 'orders@mongsangin.life';
export const PHONE_RELAY_TOKEN_PLACEHOLDER = 'PASTE_DEVICE_TOKEN_HERE';

const ORIGIN = 'https://enicoveck.com';
const OBJECT_REPLACEMENT = '\uFFFC';

function xmlEscape(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&apos;');
}

function plistXml(value: PlistValue): string {
  if (typeof value === 'string') return `<string>${xmlEscape(value)}</string>`;
  if (typeof value === 'boolean') return value ? '<true/>' : '<false/>';
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) throw new Error('Plist integer must be safe');
    return `<integer>${value}</integer>`;
  }
  if (Array.isArray(value)) return `<array>${value.map(plistXml).join('')}</array>`;
  return `<dict>${Object.entries(value).map(([key, item]) => `<key>${xmlEscape(key)}</key>${plistXml(item)}`).join('')}</dict>`;
}

/** A deterministic document makes the public signed artifact reproducible. */
export function phoneRelayShortcutDocument(options: { token?: string } = {}): PlistDictionary {
  const token = options.token ?? PHONE_RELAY_TOKEN_PLACEHOLDER;
  if (options.token !== undefined && !/^[A-Za-z0-9_-]{43,128}$/.test(token)) {
    throw new Error('Invalid phone relay device token');
  }

  let sequence = 0;
  const nextUuid = () => `EC000000-0000-4000-8000-${(++sequence).toString(16).toUpperCase().padStart(12, '0')}`;
  const actions: PlistDictionary[] = [];
  const action = (name: string, parameters: PlistDictionary = {}) => {
    const uuid = nextUuid();
    actions.push({
      WFWorkflowActionIdentifier: `is.workflow.actions.${name}`,
      WFWorkflowActionParameters: { ...parameters, UUID: uuid },
    });
    return uuid;
  };
  const output = (uuid: string, name: string): PlistDictionary => ({
    OutputUUID: uuid, OutputName: name, Type: 'ActionOutput',
  });
  const attachment = (value: PlistDictionary): PlistDictionary => ({
    Value: value, WFSerializationType: 'WFTextTokenAttachment',
  });
  const text = (parts: (string | PlistDictionary)[]): PlistDictionary => {
    let value = '';
    const ranges: PlistDictionary = {};
    for (const part of parts) {
      if (typeof part === 'string') value += part;
      else {
        ranges[`{${value.length}, 1}`] = part;
        value += OBJECT_REPLACEMENT;
      }
    }
    return {
      Value: { string: value, ...(Object.keys(ranges).length ? { attachmentsByRange: ranges } : {}) },
      WFSerializationType: 'WFTextTokenString',
    };
  };
  const dictionary = (values: Record<string, string | PlistDictionary>): PlistDictionary => ({
    Value: {
      WFDictionaryFieldValueItems: Object.entries(values).map(([key, value]) => ({
        WFItemType: 0,
        WFKey: text([key]),
        WFValue: text([value]),
      })),
    },
    WFSerializationType: 'WFDictionaryFieldValue',
  });
  const getValue = (uuid: string, key: string) => action('getvalueforkey', {
    WFInput: attachment(output(uuid, 'Dictionary')),
    WFDictionaryKey: key,
    WFGetDictionaryValueType: 'Value',
  });
  const ifStart = (uuid: string, condition: number, comparison?: string) => {
    const group = nextUuid();
    action('conditional', {
      GroupingIdentifier: group, WFControlFlowMode: 0, WFCondition: condition,
      WFInput: { Type: 'Variable', Variable: attachment(output(uuid, 'Dictionary Value')) },
      ...(comparison === undefined ? {} : { WFConditionalActionString: comparison }),
    });
    return group;
  };
  const ifEnd = (group: string) => action('conditional', {
    GroupingIdentifier: group, WFControlFlowMode: 2,
  });

  // Import questions refer to this first action by zero-based ActionIndex.
  const tokenUuid = action('gettext', { WFTextActionText: token });
  action('comment', {
    WFCommentActionText: 'ENICO VECK 주문 문자 중계. 이메일 본문·첨부·수신 번호를 읽지 않습니다. 승인된 사이트의 대기 작업만 처리합니다. 연결키가 들어간 단축어를 공유하지 마세요. 메시지 동작 완료는 통신사 수신 확인을 뜻하지 않습니다.',
  });
  const authHeader = dictionary({
    Authorization: output(tokenUuid, 'Text'),
    'Content-Type': 'application/json',
  });
  // HTTP dictionary values use rich text so that the Bearer prefix and secret
  // are serialized as one header, never URL/query parameters or a request body.
  const headerItems = (authHeader.Value as PlistDictionary).WFDictionaryFieldValueItems as PlistDictionary[];
  headerItems[0].WFValue = text(['Bearer ', output(tokenUuid, 'Text')]);

  const repeatGroup = nextUuid();
  action('repeat.count', { GroupingIdentifier: repeatGroup, WFControlFlowMode: 0, WFRepeatCount: 10 });
  const claimUuid = action('downloadurl', {
    WFURL: text([`${ORIGIN}/api/phone-relay/claim`]),
    WFHTTPMethod: 'POST', WFHTTPHeaders: authHeader,
    WFHTTPBodyType: 'JSON', WFJSONValues: dictionary({}),
  });
  const jobUuid = getValue(claimUuid, 'job');
  const noJob = ifStart(jobUuid, 101);
  action('exit');
  ifEnd(noJob);
  const jobIdUuid = getValue(jobUuid, 'id');
  // A missing job ends the complete invocation, rather than spinning 10 empty
  // requests or inheriting a prior loop iteration's message as implicit input.
  const emptyJob = ifStart(jobIdUuid, 101);
  action('exit');
  ifEnd(emptyJob);

  const kindUuid = getValue(jobUuid, 'kind');
  const supportedKindUuid = action('text.match', {
    text: text([output(kindUuid, 'Dictionary Value')]),
    WFMatchTextPattern: '^(customer_sms|self_test)$',
    WFMatchTextCaseSensitive: true,
  });
  const invalidKind = ifStart(supportedKindUuid, 101);
  action('exit');
  ifEnd(invalidKind);

  const toUuid = getValue(jobUuid, 'to');
  const textUuid = getValue(jobUuid, 'text');
  const titleUuid = getValue(jobUuid, 'title');
  const claimTokenUuid = getValue(jobUuid, 'claimToken');
  // Defense against a malformed server response: an empty recipient must never
  // open a person picker or reuse a recipient supplied by the email trigger.
  for (const field of [toUuid, textUuid, claimTokenUuid]) {
    const missing = ifStart(field, 101);
    action('exit');
    ifEnd(missing);
  }
  action('notification', {
    WFNotificationActionTitle: text([output(titleUuid, 'Dictionary Value')]),
    WFNotificationActionBody: text([output(textUuid, 'Dictionary Value')]),
    WFNotificationActionSound: true,
  });
  action('sendmessage', {
    IntentAppIdentifier: 'com.apple.MobileSMS', ShowWhenRun: false,
    WFSendMessageActionRecipients: attachment(output(toUuid, 'Dictionary Value')),
    WFSendMessageContent: text([output(textUuid, 'Dictionary Value')]),
  });
  // Shortcuts stops at a failed/cancelled Send Message action. Only its normal
  // completion proceeds to acknowledgment. The server must never auto-replay a
  // claimed job if this HTTP request is interrupted or its result is unknown.
  action('downloadurl', {
    WFURL: text([`${ORIGIN}/api/phone-relay/ack`]),
    WFHTTPMethod: 'POST', WFHTTPHeaders: authHeader,
    WFHTTPBodyType: 'JSON', WFJSONValues: dictionary({
      jobId: output(jobIdUuid, 'Dictionary Value'),
      claimToken: output(claimTokenUuid, 'Dictionary Value'),
      status: 'submitted',
    }),
  });
  // The authenticated claim endpoint rate-limits each device to one claim per
  // two seconds. Stay outside that interval before the next bounded iteration.
  action('delay', { WFDelayTime: 3 });
  action('repeat.count', { GroupingIdentifier: repeatGroup, WFControlFlowMode: 2 });

  return {
    WFWorkflowActions: actions,
    WFWorkflowClientVersion: '2600.0',
    WFWorkflowClientRelease: '26.0',
    WFWorkflowHasOutputFallback: false,
    WFWorkflowHasShortcutInputVariables: false,
    WFWorkflowIcon: { WFWorkflowIconGlyphNumber: 59502, WFWorkflowIconStartColor: 4282601983 },
    WFWorkflowImportQuestions: options.token === undefined ? [{
      ActionIndex: 0,
      Category: 'Parameter',
      ParameterKey: 'WFTextActionText',
      Text: '관리자에서 복사한 아이폰 연결키를 붙여넣으세요. 이 키가 들어간 단축어는 공유하지 마세요.',
      DefaultValue: '',
    }] : [],
    WFWorkflowInputContentItemClasses: [],
    WFWorkflowMinimumClientVersion: 900,
    WFWorkflowMinimumClientVersionString: '900',
    WFWorkflowName: PHONE_RELAY_SHORTCUT_NAME,
    WFWorkflowOutputContentItemClasses: [],
    WFWorkflowTypes: [],
  };
}

/** Returns unsigned XML. macOS `shortcuts sign --mode anyone` is required. */
export function createPhoneRelayShortcut(options: { token?: string } = {}): string {
  return '<?xml version="1.0" encoding="UTF-8"?>\n'
    + '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n'
    + `<plist version="1.0">${plistXml(phoneRelayShortcutDocument(options))}</plist>\n`;
}
