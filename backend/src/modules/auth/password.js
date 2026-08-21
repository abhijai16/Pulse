// scrypt-based hashing. node's built-in crypto gives us a
// constant-time compare and a tunable cost without pulling in bcrypt.
// format: "<salt-hex>:<derived-hex>" — both 64 hex chars (32 bytes).
import crypto from 'node:crypto';

const KEYLEN = 32;
const COST = { N: 1 << 14, r: 8, p: 1 };

export function hashPassword(plain) {
  const salt = crypto.randomBytes(KEYLEN);
  const derived = crypto.scryptSync(plain, salt, KEYLEN, COST);
  return `${salt.toString('hex')}:${derived.toString('hex')}`;
}

export function verifyPassword(plain, stored) {
  if (!stored || typeof stored !== 'string') return false;
  const [saltHex, derivedHex] = stored.split(':');
  if (!saltHex || !derivedHex) return false;
  const salt = Buffer.from(saltHex, 'hex');
  const expected = Buffer.from(derivedHex, 'hex');
  const actual = crypto.scryptSync(plain, salt, expected.length, COST);
  // timingSafeEqual needs equal-length buffers
  if (actual.length !== expected.length) return false;
  return crypto.timingSafeEqual(actual, expected);
}
