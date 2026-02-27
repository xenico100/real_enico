import { randomBytes, scryptSync, timingSafeEqual } from 'crypto';

const KEY_LENGTH = 64;

export function generateGuestOrderNumber() {
  const stamp = new Date().toISOString().slice(0, 10).replaceAll('-', '');
  const randomPart = randomBytes(4).toString('hex').toUpperCase();
  return `GUEST-${stamp}-${randomPart}`;
}

export function hashGuestLookupPassword(password: string) {
  const normalized = password.trim();
  const salt = randomBytes(16).toString('hex');
  const derived = scryptSync(normalized, salt, KEY_LENGTH).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyGuestLookupPassword(password: string, storedHash: string) {
  const normalized = password.trim();
  const [salt, storedHex] = storedHash.split(':');
  if (!salt || !storedHex) return false;

  try {
    const candidate = scryptSync(normalized, salt, KEY_LENGTH);
    const stored = Buffer.from(storedHex, 'hex');
    if (stored.length !== candidate.length) return false;
    return timingSafeEqual(stored, candidate);
  } catch {
    return false;
  }
}
