import { describe, expect, it } from 'vitest';
import {
  createId,
  isChatSendPayload,
  isEmoteSendPayload,
  isInputPayload,
  isJoinPayload,
} from './index';

describe('protocol guards', () => {
  it('accepts a complete local join payload', () => {
    expect(
      isJoinPayload({
        sessionId: 'local_session_123',
        profile: { nickname: 'VECK USER', palette: 'crimson', bio: 'LOCAL ONLY' },
      }),
    ).toBe(true);
  });

  it('rejects malformed realtime payloads', () => {
    expect(isJoinPayload({ sessionId: 'short', profile: {} })).toBe(false);
    expect(isInputPayload({ sequence: 1, up: true, down: false, left: false })).toBe(false);
    expect(isChatSendPayload({ text: 42 })).toBe(false);
    expect(isEmoteSendPayload({ emote: 'invalid' })).toBe(false);
  });

  it('creates namespaced unique ids', () => {
    const first = createId('test');
    const second = createId('test');
    expect(first).toMatch(/^test_/);
    expect(first).not.toBe(second);
  });
});
