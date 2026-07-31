import {
  GAME_CONFIG,
  type InputPayload,
  type PlayerDirection,
  type PlayerProfile,
  type Vec2,
} from '@enico/protocol';

export interface WorldCollider {
  id: string;
  x: number;
  z: number;
  width: number;
  depth: number;
}

export const WORLD_COLLIDERS: readonly WorldCollider[] = [
  { id: 'signal-tower', x: 0, z: 0, width: 2.2, depth: 2.2 },
  { id: 'west-poster-wall', x: -8.6, z: -2.5, width: 0.7, depth: 5.4 },
  { id: 'east-machine-bank', x: 8.2, z: -4.7, width: 1.5, depth: 3.3 },
  { id: 'north-bench', x: -4.6, z: -6.8, width: 3.2, depth: 1.1 },
  { id: 'south-bench', x: 4.8, z: 6.8, width: 3.2, depth: 1.1 },
  { id: 'archive-kiosk', x: -6.8, z: 6.4, width: 2, depth: 2 },
] as const;

export const SPAWN_POINTS: readonly Vec2[] = [
  { x: -2.8, z: 3.4 },
  { x: 2.8, z: 3.4 },
  { x: -3.7, z: -3.2 },
  { x: 3.7, z: -3.2 },
  { x: 0, z: 5.3 },
  { x: 0, z: -4.8 },
  { x: -5.6, z: 1.3 },
  { x: 5.6, z: 1.3 },
] as const;

export interface MovementResult extends Vec2 {
  direction: PlayerDirection;
  moving: boolean;
}

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: string };

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function distanceBetween(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

export function canReceiveProximityMessage(sender: Vec2, receiver: Vec2): boolean {
  return distanceBetween(sender, receiver) <= GAME_CONFIG.proximityChatRadius;
}

export function circleIntersectsCollider(
  point: Vec2,
  radius: number,
  collider: WorldCollider,
): boolean {
  const halfWidth = collider.width / 2;
  const halfDepth = collider.depth / 2;
  const closestX = clamp(point.x, collider.x - halfWidth, collider.x + halfWidth);
  const closestZ = clamp(point.z, collider.z - halfDepth, collider.z + halfDepth);
  return Math.hypot(point.x - closestX, point.z - closestZ) < radius;
}

export function isWalkable(point: Vec2): boolean {
  const limit = GAME_CONFIG.worldHalfSize - GAME_CONFIG.playerRadius;
  if (Math.abs(point.x) > limit || Math.abs(point.z) > limit) return false;
  return !WORLD_COLLIDERS.some((collider) =>
    circleIntersectsCollider(point, GAME_CONFIG.playerRadius, collider),
  );
}

function getDirection(x: number, z: number, previous: PlayerDirection): PlayerDirection {
  if (x === 0 && z === 0) return previous;
  if (Math.abs(x) > Math.abs(z)) return x > 0 ? 'east' : 'west';
  return z > 0 ? 'south' : 'north';
}

export function resolveMovement(
  position: Vec2,
  input: InputPayload,
  deltaSeconds: number,
  previousDirection: PlayerDirection = 'south',
): MovementResult {
  let axisX = Number(input.right) - Number(input.left);
  let axisZ = Number(input.down) - Number(input.up);
  const length = Math.hypot(axisX, axisZ);
  const moving = length > 0;

  if (length > 1) {
    axisX /= length;
    axisZ /= length;
  }

  const safeDelta = clamp(deltaSeconds, 0, 0.1);
  const distance = GAME_CONFIG.moveSpeed * safeDelta;
  let x = position.x;
  let z = position.z;

  const nextX = { x: x + axisX * distance, z };
  if (isWalkable(nextX)) x = nextX.x;

  const nextZ = { x, z: z + axisZ * distance };
  if (isWalkable(nextZ)) z = nextZ.z;

  return {
    x,
    z,
    moving,
    direction: getDirection(axisX, axisZ, previousDirection),
  };
}

export function selectSpawn(index: number): Vec2 {
  const spawn = SPAWN_POINTS[Math.abs(index) % SPAWN_POINTS.length] ?? SPAWN_POINTS[0]!;
  return { x: spawn.x, z: spawn.z };
}

export function validateNickname(raw: string): ValidationResult<string> {
  const value = raw.trim().replace(/\s+/g, ' ');
  if (value.length < 2 || value.length > 16) {
    return { ok: false, reason: '닉네임은 2–16자로 입력하세요.' };
  }
  if (!/^[\p{L}\p{N} _.-]+$/u.test(value)) {
    return { ok: false, reason: '문자, 숫자, 공백, _, -, .만 사용할 수 있습니다.' };
  }
  return { ok: true, value };
}

export function validateBio(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').slice(0, 48);
}

export function validateProfile(profile: PlayerProfile): ValidationResult<PlayerProfile> {
  const nickname = validateNickname(profile.nickname);
  if (!nickname.ok) return nickname;
  return {
    ok: true,
    value: {
      nickname: nickname.value,
      palette: profile.palette,
      bio: validateBio(profile.bio),
    },
  };
}

export function validateChatText(raw: string): ValidationResult<string> {
  const value = raw.trim().replace(/\s+/g, ' ');
  if (!value) return { ok: false, reason: '메시지를 입력하세요.' };
  if (value.length > GAME_CONFIG.maxMessageLength) {
    return {
      ok: false,
      reason: `메시지는 ${GAME_CONFIG.maxMessageLength}자 이하여야 합니다.`,
    };
  }
  if (/\p{C}/u.test(value)) {
    return { ok: false, reason: '제어 문자는 사용할 수 없습니다.' };
  }
  return { ok: true, value };
}

export function isRateLimited(lastSentAt: number, now: number, cooldownMs: number): boolean {
  return lastSentAt > 0 && now - lastSentAt < cooldownMs;
}
