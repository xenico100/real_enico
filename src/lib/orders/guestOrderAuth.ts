import 'server-only';

import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const SCRYPT_KEYLEN = 64;
const HASH_PREFIX = 'scrypt';

export function hashGuestOrderPassword(password: string) {
  const normalized = password.trim();
  if (normalized.length < 4) {
    throw new Error('비회원 주문조회 비밀번호는 4자 이상으로 입력하세요.');
  }

  const salt = randomBytes(16).toString('hex');
  const derived = scryptSync(normalized, salt, SCRYPT_KEYLEN).toString('hex');
  return `${HASH_PREFIX}$${salt}$${derived}`;
}

export function verifyGuestOrderPassword(password: string, encodedHash: string) {
  const normalized = password.trim();
  if (!normalized) return false;

  const parts = encodedHash.split('$');
  if (parts.length !== 3 || parts[0] !== HASH_PREFIX) return false;

  const salt = parts[1];
  const expectedHex = parts[2];
  if (!salt || !expectedHex) return false;

  const actual = scryptSync(normalized, salt, SCRYPT_KEYLEN);
  const expected = Buffer.from(expectedHex, 'hex');
  if (actual.length !== expected.length) return false;

  return timingSafeEqual(actual, expected);
}

export function generateGuestOrderNumber() {
  const date = new Date();
  const yy = String(date.getFullYear()).slice(-2);
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const randomPart = randomBytes(3).toString('hex').toUpperCase();
  return `G${yy}${mm}${dd}-${randomPart}`;
}
