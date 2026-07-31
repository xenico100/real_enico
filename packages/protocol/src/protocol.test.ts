import { describe, expect, it } from 'vitest';
import {
  DEFAULT_AVATAR,
  createId,
  isAvatarConfig,
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
        profile: {
          nickname: 'VECK USER',
          palette: 'crimson',
          avatar: { ...DEFAULT_AVATAR },
          bio: 'LOCAL ONLY',
        },
      }),
    ).toBe(true);
  });

  it('rejects an unknown avatar option', () => {
    const avatar = { ...DEFAULT_AVATAR, hairStyle: 'sideways' };
    expect(isAvatarConfig(avatar)).toBe(false);
    expect(
      isJoinPayload({
        sessionId: 'local_session_456',
        profile: { nickname: 'VECK USER', palette: 'crimson', avatar, bio: '' },
      }),
    ).toBe(false);
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
