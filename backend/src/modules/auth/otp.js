// in-memory OTP store. 6 digits, 10 min ttl, stored as sha256(code+email)
// so a memory dump doesn't yield usable codes. kept out of Postgres on
// purpose — codes are throwaway and short-lived, no point running a
// cleanup job. single-node only. move to redis if we scale out.
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
  // randomInt is uniform, pad to 6 with leading zeros
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
  // fire-and-forget. sendOtp logs the code on its own line, so even
  // if SMTP fails the dev can still grab it. we don't await — issuance
  // must not block on email delivery, and routes don't care.
  sendOtp({ to: key, code, ttlMinutes: OTP_TTL_MIN }).catch((err) => {
    console.error(`[email-otp] sendOtp threw for ${key}:`, err);
  });
  return code;
}

// resend just replaces whatever's in the map
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
  // over the budget — drop the entry so the user has to ask for a
  // fresh code instead of guessing forever
  if (entry.attempts >= MAX_ATTEMPTS) {
    otps.delete(key);
    return { ok: false, reason: 'too_many_attempts' };
  }

  const supplied = hashCode(code, key);
  // timingSafeEqual needs equal-length buffers. both sides are sha256
  // (32 bytes) so they match by construction.
  const ok = crypto.timingSafeEqual(entry.codeHash, supplied);
  if (!ok) return { ok: false, reason: 'mismatch' };

  // one-shot, delete on success
  otps.delete(key);
  return { ok: true };
}
