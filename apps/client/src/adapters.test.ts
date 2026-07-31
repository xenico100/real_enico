import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_AVATAR } from '@enico/protocol';
import { LocalIdentityProvider } from './adapters';

const PROFILE_KEY = 'enico.pixel-square.profile.v2';
const LEGACY_PROFILE_KEY = 'enico.pixel-square.profile.v1';

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length(): number {
    return this.values.size;
  }

  clear(): void {
    this.values.clear();
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
let localStorage: MemoryStorage;

beforeEach(() => {
  localStorage = new MemoryStorage();
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      localStorage,
      sessionStorage: new MemoryStorage(),
    },
  });
});

afterEach(() => {
  if (originalWindow) {
    Object.defineProperty(globalThis, 'window', originalWindow);
  } else {
    Reflect.deleteProperty(globalThis, 'window');
  }
});

describe('LocalIdentityProvider', () => {
  it('migrates a v1 profile to v2 with the default avatar', () => {
    localStorage.setItem(
      LEGACY_PROFILE_KEY,
      JSON.stringify({ nickname: 'ALPHA', palette: 'violet', bio: 'LOCAL SOUL' }),
    );

    const profile = new LocalIdentityProvider().loadProfile();

    expect(profile).toEqual({
      nickname: 'ALPHA',
      palette: 'violet',
      avatar: DEFAULT_AVATAR,
      bio: 'LOCAL SOUL',
    });
    expect(localStorage.getItem(LEGACY_PROFILE_KEY)).toBeNull();
    expect(JSON.parse(localStorage.getItem(PROFILE_KEY)!)).toEqual(profile);
  });

  it('repairs a corrupt v2 avatar without discarding the profile', () => {
    localStorage.setItem(
      PROFILE_KEY,
      JSON.stringify({
        nickname: 'BETA',
        palette: 'oxide',
        avatar: { ...DEFAULT_AVATAR, eyes: 'laser' },
        bio: 'STILL HERE',
      }),
    );

    const profile = new LocalIdentityProvider().loadProfile();

    expect(profile).toMatchObject({ nickname: 'BETA', avatar: DEFAULT_AVATAR });
    expect(JSON.parse(localStorage.getItem(PROFILE_KEY)!)).toMatchObject({
      nickname: 'BETA',
      avatar: DEFAULT_AVATAR,
    });
  });
});
