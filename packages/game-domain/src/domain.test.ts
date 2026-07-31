import { describe, expect, it } from 'vitest';
import { GAME_CONFIG, type InputPayload } from '@enico/protocol';
import {
  WORLD_COLLIDERS,
  canReceiveProximityMessage,
  circleIntersectsCollider,
  isWalkable,
  resolveMovement,
  validateChatText,
  validateNickname,
} from './index';

const input = (partial: Partial<InputPayload>): InputPayload => ({
  sequence: 1,
  up: false,
  down: false,
  left: false,
  right: false,
  ...partial,
});

describe('movement and collision', () => {
  it('normalizes diagonal movement speed', () => {
    const straight = resolveMovement({ x: -5, z: 0 }, input({ right: true }), 0.05);
    const diagonal = resolveMovement(
      { x: -5, z: 0 },
      input({ right: true, down: true }),
      0.05,
    );
    const straightDistance = Math.hypot(straight.x + 5, straight.z);
    const diagonalDistance = Math.hypot(diagonal.x + 5, diagonal.z);
    expect(diagonalDistance).toBeCloseTo(straightDistance, 5);
    expect(diagonal.direction).toBe('south');
  });

  it('blocks the central signal tower and world boundary', () => {
    const tower = WORLD_COLLIDERS.find((collider) => collider.id === 'signal-tower');
    expect(tower).toBeDefined();
    expect(circleIntersectsCollider({ x: 0.9, z: 0 }, GAME_CONFIG.playerRadius, tower!)).toBe(true);
    expect(isWalkable({ x: 0, z: 0 })).toBe(false);
    expect(isWalkable({ x: GAME_CONFIG.worldHalfSize + 1, z: 0 })).toBe(false);

    const blocked = resolveMovement({ x: -1.5, z: 0 }, input({ right: true }), 0.1);
    expect(blocked.x).toBe(-1.5);
  });
});

describe('social rules', () => {
  it('validates Korean and Latin display names', () => {
    expect(validateNickname('  에니코 벡  ')).toEqual({ ok: true, value: '에니코 벡' });
    expect(validateNickname('<script>')).toMatchObject({ ok: false });
    expect(validateNickname('A')).toMatchObject({ ok: false });
  });

  it('normalizes chat and rejects control characters or oversized text', () => {
    expect(validateChatText('  hello   square  ')).toEqual({ ok: true, value: 'hello square' });
    expect(validateChatText('hello\u0000')).toMatchObject({ ok: false });
    expect(validateChatText('x'.repeat(GAME_CONFIG.maxMessageLength + 1))).toMatchObject({ ok: false });
  });

  it('enforces proximity radius', () => {
    expect(canReceiveProximityMessage({ x: 0, z: 0 }, { x: 6, z: 0 })).toBe(true);
    expect(canReceiveProximityMessage({ x: 0, z: 0 }, { x: 7, z: 0 })).toBe(false);
  });
});
