// This function is serialized into an isolated world in the observed SKT iframe.
// Do not add outside variables or log values: payloads contain order information.
export function sktDomAction({ action, job, expectedSender }) {
  const visible = element => !!element && !!(element.offsetWidth || element.offsetHeight
    || element.getClientRects().length) && getComputedStyle(element).visibility !== 'hidden';
  const all = selector => [...document.querySelectorAll(selector)].filter(visible);
  const digits = value => String(value ?? '').replace(/[^0-9]/g, '');
  const text = document.body?.innerText ?? '';
  const number = pattern => {
    const match = text.match(pattern);
    if (!match) return null;
    const value = Number(match[1].replaceAll(',', ''));
    return Number.isSafeInteger(value) && value >= 0 ? value : null;
  };
  const atExpectedOrigin = location.protocol === 'https:' && location.hostname === 'msgmgr.tworld.co.kr';
  if (!atExpectedOrigin) return { atExpectedOrigin: false };

  const common = () => ({
    atExpectedOrigin: true,
    freeRemaining: number(/무료\s*문자\s*([\d,]+)\s*건/),
    dailySent: number(/일\s*전송\s*건수\s*([\d,]+)\s*건/),
    freeMode: text.includes('유료전환') && !text.includes('무료전환'),
    sessionSeconds: (() => {
      const match = /자동\s*로그아웃\s*잔여시간\s*(\d{1,2}):(\d{2})/.exec(text);
      return match && Number(match[2]) < 60 ? Number(match[1]) * 60 + Number(match[2]) : null;
    })(),
  });
  const composer = () => {
    const textarea = document.querySelector('textarea#write_text[name="msg_txt"]');
    const sender = document.querySelector('#send_phone_text');
    const countValue = selector => {
      const value = document.querySelector(selector)?.textContent?.trim() ?? '';
      return /^\d[\d,]*$/.test(value) ? Number(value.replaceAll(',', '')) : null;
    };
    const mmsVisible = visible(document.querySelector('#count_letter_mms'));
    const smsVisible = visible(document.querySelector('#count_letter_sms'));
    const formType = document.querySelector('input[name="msg_type"]')?.value;
    const mode = mmsVisible && !smsVisible && formType === '1' ? 'MMS'
      : smsVisible && !mmsVisible && formType === '0' ? 'SMS' : null;
    const recipientRows = all('li[data-phone-key]');
    return {
      ...common(),
      isComposer: !!textarea && visible(textarea) && !!sender,
      blockingPopup: all('iframe.popupFrame').length > 0,
      sender: digits(sender?.value),
      text: textarea?.value ?? null,
      recipients: recipientRows.map(row => {
        const key = row.getAttribute('data-phone-key') ?? '';
        return /^N010\d{8}$/.test(key) ? key.slice(1) : null;
      }),
      mode,
      usedCharacters: countValue('#count_letter'),
      maxCharacters: countValue('#count_letter_max'),
      attachmentCount: document.querySelector('input#upload[type="file"]')?.files?.length ?? 0,
      submitCount: all('[onclick*="validate_frm("]').length,
    };
  };
  const safeToSubmit = state => state.isComposer && !state.blockingPopup && state.sender === expectedSender
    && state.freeMode && Number.isSafeInteger(state.freeRemaining) && state.freeRemaining > 0
    && Number.isSafeInteger(state.dailySent) && state.dailySent < 500
    && state.recipients.length === 1 && state.recipients[0] === job.to
    && state.text === job.text && state.attachmentCount === 0 && state.submitCount === 1
    && ((state.mode === 'SMS' && [70, 160].includes(state.maxCharacters))
      || (state.mode === 'MMS' && state.maxCharacters === 2000))
    && Number.isSafeInteger(state.usedCharacters) && state.usedCharacters > 0
    && state.usedCharacters <= state.maxCharacters;

  if (action === 'dismissSessionExtension') {
    const popups = all('iframe.popupFrame');
    if (!popups.length) return { dismissed: false };
    if (popups.length !== 1) return { blocked: true };
    const frame = popups[0];
    const expected = '자동 로그아웃 시간이 연장되었습니다.';
    let url;
    try { url = new URL(frame.getAttribute('src'), location.href); }
    catch { return { blocked: true }; }
    if (url.origin !== 'https://msgmgr.tworld.co.kr'
      || url.pathname !== '/html/popup/common_ok.php'
      || url.searchParams.get('msg') !== expected) return { blocked: true };
    let popup;
    try { popup = frame.contentDocument; } catch { return { blocked: true }; }
    if (!popup || popup.readyState !== 'complete' || !popup.body?.innerText?.includes(expected)) return { pending: true };
    const buttons = [...popup.querySelectorAll('button[onclick="safeCloseModalPopup();"]')].filter(visible);
    if (buttons.length !== 1 || buttons[0].innerText.trim() !== '확인') return { blocked: true };
    buttons[0].click();
    return { dismissed: true };
  }
  if (action === 'composer') return composer();
  if (action === 'extendSession') {
    const remaining = common().sessionSeconds;
    const links = all('a[onclick="return ajax_extend_logout();"]');
    if (!Number.isSafeInteger(remaining) || remaining <= 0 || remaining > 300
      || links.length !== 1) return { extended: false };
    links[0].click();
    return { extended: true };
  }
  if (action === 'openComposer') {
    const links = all('a[href="/html/sms/sms_main.php"]');
    if (links.length !== 1) return { navigated: false };
    links[0].click();
    return { navigated: true };
  }
  if (action === 'prepare') {
    const initial = composer();
    if (!initial.isComposer || initial.sender !== expectedSender || !initial.freeMode
      || initial.freeRemaining < 1 || initial.attachmentCount !== 0
      || initial.recipients.length !== 0) return { prepared: false };
    const add = all('[onclick*="add_phone_key_li_manual("]');
    const phone = document.querySelector('#add_text[name="add_phone_no"]');
    const textarea = document.querySelector('textarea#write_text[name="msg_txt"]');
    if (add.length !== 1 || !phone || !textarea) return { prepared: false };
    // refreshRcvLst always prompts, even with no recipients. A fresh composer is
    // established before this action, so never invoke the destructive reset UI.
    textarea.value = job.text;
    for (const name of ['input', 'change', 'keyup']) textarea.dispatchEvent(new Event(name, { bubbles: true }));
    phone.value = job.to;
    for (const name of ['input', 'change', 'keyup']) phone.dispatchEvent(new Event(name, { bubbles: true }));
    add[0].click();
    return { prepared: true };
  }
  if (action === 'submit') {
    const state = composer();
    if (!safeToSubmit(state)) return { invoked: false };
    // A DOM guard is secondary to the durable worker state and in-memory guard.
    // It contains only an opaque job ID; navigation can destroy this guard.
    if (globalThis.__enicoSktSubmitAttempt) return { invoked: false };
    globalThis.__enicoSktSubmitAttempt = job.id;
    all('[onclick*="validate_frm("]')[0].click();
    return { invoked: true };
  }
  if (action === 'history') {
    const state = common();
    const panel = document.querySelector('#chating_panel');
    const selection = globalThis.__enicoSktHistorySelection;
    const hasPanel = visible(panel) && selection?.recipient === job?.to
      && selection?.sender === expectedSender;
    const entries = hasPanel ? [...panel.querySelectorAll('.chating_list li.me[data-message-id]')].filter(visible).map(row => {
      const time = row.querySelector('.time[data-date]');
      const candidates = [...row.querySelectorAll('.text span.txt, .text span.mt5')];
      const body = candidates.length === 1 ? candidates[0].textContent : null;
      return {
        id: row.getAttribute('data-message-id'),
        recipient: selection.recipient,
        recipientConsistent: true,
        sender: selection.sender,
        outgoing: true,
        statusCode: time?.querySelector('span')?.textContent?.trim() ?? null,
        text: body,
        date: time?.getAttribute('data-date') ?? null,
      };
    }) : [];
    const knownSenderRows = all('li[data-id][idx]').filter(row =>
      digits((row.getAttribute('data-id') ?? '').split('|')[1]) === expectedSender);
    const historyReady = document.readyState === 'complete'
      && Number.isSafeInteger(state.freeRemaining) && Number.isSafeInteger(state.dailySent)
      && state.freeMode && knownSenderRows.length > 0;
    const loadedMessageCount = hasPanel
      ? [...panel.querySelectorAll('.chating_list li[data-message-id]')].filter(visible).length : 0;
    return {
      ...state,
      isHistory: location.pathname === '/html/home/home_main.php',
      historyReady,
      conversationSelected: hasPanel,
      detailReady: hasPanel && loadedMessageCount > 0 && entries.every(entry =>
        typeof entry.text === 'string' && /^\d{10,30}$/.test(entry.id ?? '')
        && /^\d{2}$/.test(entry.statusCode ?? '') && typeof entry.date === 'string'),
      entries,
    };
  }
  if (action === 'openConversation') {
    const candidates = all('li[data-id][idx]').map(row => {
        const [recipientKey, senderKey] = (row.getAttribute('data-id') ?? '').split('|');
        const recipient = digits(row.querySelector('h4.name a.txt')?.textContent);
        return {
          row,
          recipient,
          recipientConsistent: recipient === digits(recipientKey),
          sender: digits(senderKey),
        };
      }).filter(row => row.recipient === job.to && row.recipientConsistent
        && row.sender === expectedSender);
    if (candidates.length === 0) return { opened: false, missing: true };
    if (candidates.length !== 1) return { opened: false, missing: false };
    const target = candidates[0].row.querySelector('p.info_con a.info');
    if (!target || !visible(target)) return { opened: false, missing: false };
    globalThis.__enicoSktHistorySelection = { recipient: job.to, sender: expectedSender };
    target.click();
    return { opened: true };
  }
  return { unsupportedAction: true };
}
