// In-memory OTP store. Codes are 6 digits, expire in 10 minutes, and
// are stored as sha256(code + email) so a memory dump doesn't yield
// usable codes. We deliberately keep this out of Postgres: the codes
// are throwaway, short-lived, and we'd otherwise need a row-per-attempt
// cleanup job. Single-node only — promote to Redis if we scale out.
import crypto from 'node:crypto';
import { sendOtp } from './mailer.js';

const OTP_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const OTP_TTL_MIN = OTP_TTL_MS / 60_000;

const otps = new Map(); // emailLower -> { codeHash, expiresAt, attempts }

function hashCode(code, emailLower) {
  return crypto
    .createHash('sha256')
    .update(`${code}:${emailLower}`)
    .digest();
}

function genCode() {
  // crypto.randomInt is uniform; pad to 6 digits with leading zeros.
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
}

export function issueOtp(email) {
  const key = email.toLowerCase();
  const code = genCode();
  otps.set(key, {
    codeHash: hashCode(code, key),
    expiresAt: Date.now() + OTP_TTL_MS,
    attempts: 0,
  });
  // Fire-and-forget: sendOtp logs to the console itself, so even if
  // SMTP fails the code is recoverable for the demo. The call is
  // intentionally not awaited — issuance must not block on email
  // delivery, and route handlers don't care about the send result.
  sendOtp({ to: key, code, ttlMinutes: OTP_TTL_MIN }).catch((err) => {
    console.error(`[email-otp] sendOtp threw for ${key}:`, err);
  });
  return code;
}

// Resend replaces any existing code for that email.
export function resendOtp(email) {
  return issueOtp(email);
}

export function consumeOtp(email, code) {
  const key = email.toLowerCase();
  const entry = otps.get(key);
  if (!entry) return { ok: false, reason: 'no_code' };

  if (Date.now() > entry.expiresAt) {
    otps.delete(key);
    return { ok: false, reason: 'expired' };
  }

  entry.attempts += 1;
  // Cap reached once we've exceeded the budget — delete the entry so
  // the user must request a fresh code rather than guess indefinitely.
  if (entry.attempts >= MAX_ATTEMPTS) {
    otps.delete(key);
    return { ok: false, reason: 'too_many_attempts' };
  }

  const supplied = hashCode(code, key);
  // timingSafeEqual requires equal-length buffers; hashCode produces
  // 32 bytes (sha256) on both sides, so lengths match by construction.
  const ok = crypto.timingSafeEqual(entry.codeHash, supplied);
  if (!ok) return { ok: false, reason: 'mismatch' };

  // one-shot: delete on success
  otps.delete(key);
  return { ok: true };
}
