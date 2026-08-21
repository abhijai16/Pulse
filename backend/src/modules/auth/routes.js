// auth router: signup, verify-otp, resend-otp, login, logout, /me.
// signup creates the user unverified + sends an OTP. they have to
// POST verify-otp to flip email_verified and get a session. login
// returns 403 email_not_verified until that flip happens.
import { Router } from 'express';
import {
  isAllowedEmail,
  createUser,
  authenticate,
  findUserByEmail,
  markEmailVerified,
  findUnverifiedByEmail,
} from './service.js';
import { issueOtp, consumeOtp, resendOtp } from './otp.js';
import { setSession, clearSession, readSessionUserId, requireAuth } from './session.js';
import { query } from '../../db/pool.js';

export const authRouter = Router();

function validName(n) {
  return typeof n === 'string' && n.trim().length >= 2 && n.trim().length <= 80;
}
function validPassword(p) {
  return typeof p === 'string' && p.length >= 6 && p.length <= 200;
}
function validCode(c) {
  return typeof c === 'string' && /^\d{6}$/.test(c);
}

// POST /api/auth/signup — validate, create unverified user, issue OTP.
// does NOT issue a session. the UI has to call verify-otp next.
authRouter.post('/auth/signup', async (req, res, next) => {
  try {
    const { name, email, password } = req.body || {};
    if (!validName(name)) return res.status(400).json({ error: 'invalid_name' });
    if (typeof email !== 'string' || !email.includes('@')) {
      return res.status(400).json({ error: 'invalid_email' });
    }
    if (!validPassword(password)) {
      return res.status(400).json({ error: 'weak_password', message: 'Use 6+ characters.' });
    }
    if (!isAllowedEmail(email)) {
      return res.status(403).json({
        error: 'domain_not_allowed',
        message: 'Email must be from your college domain.',
      });
    }
    const existing = await findUserByEmail(email);
    if (existing) return res.status(409).json({ error: 'email_taken' });

    await createUser({ name: name.trim(), email, password });
    issueOtp(email);
    // 200 not 201 — user row exists but isn't "live" until they verify
    res.status(200).json({ status: 'pending_verification', email: email.toLowerCase() });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/verify-otp — consume OTP, flip verified, set session
authRouter.post('/auth/verify-otp', async (req, res, next) => {
  try {
    const { email, code } = req.body || {};
    if (typeof email !== 'string' || !email.includes('@')) {
      return res.status(400).json({ error: 'invalid_email' });
    }
    if (!validCode(code)) {
      return res.status(400).json({ error: 'invalid_code', message: 'Code must be 6 digits.' });
    }
    const result = consumeOtp(email, code);
    if (!result.ok) {
      if (result.reason === 'expired' || result.reason === 'no_code') {
        return res.status(400).json({ error: 'code_expired', message: 'Code expired or never sent.' });
      }
      // both mismatch and too_many_attempts return invalid_code on
      // purpose — don't leak which one happened
      return res.status(400).json({ error: 'invalid_code' });
    }
    const user = await markEmailVerified(email);
    if (!user) {
      // OTP was valid but the user row is gone. shouldn't happen but
      // surface a clean error instead of 500
      return res.status(400).json({ error: 'user_not_found' });
    }
    setSession(res, user.id);
    res.json({ user });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/resend-otp — fresh code. always 200 so we don't leak
// whether the email is registered.
authRouter.post('/auth/resend-otp', async (req, res, next) => {
  try {
    const { email } = req.body || {};
    if (typeof email !== 'string' || !email.includes('@')) {
      return res.status(400).json({ error: 'invalid_email' });
    }
    if (!isAllowedEmail(email)) {
      return res.status(200).json({ ok: true }); // pretend it worked, don't leak the rule
    }
    const target = await findUnverifiedByEmail(email);
    if (target) resendOtp(email);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/login
authRouter.post('/auth/login', async (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    if (typeof email !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ error: 'invalid_credentials' });
    }
    const result = await authenticate({ email, password });
    if (!result) return res.status(401).json({ error: 'invalid_credentials' });
    if (result.unverified) {
      // send them a fresh code so they can recover without a separate
      // resend click. logged on the server.
      issueOtp(email);
      return res.status(403).json({
        error: 'email_not_verified',
        message: 'Verify your email first.',
        email: result.email,
      });
    }
    setSession(res, result.id);
    res.json({ user: result });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/logout
authRouter.post('/auth/logout', (req, res) => {
  clearSession(req, res);
  res.json({ ok: true });
});

// GET /api/auth/me
authRouter.get('/auth/me', async (req, res, next) => {
  try {
    const userId = readSessionUserId(req);
    if (!userId) return res.status(401).json({ error: 'unauthorized' });
    const { rows } = await query('SELECT id, name, email, credits FROM users WHERE id = $1', [userId]);
    if (!rows[0]) return res.status(401).json({ error: 'unauthorized' });
    res.json({ user: rows[0] });
  } catch (err) {
    next(err);
  }
});

// PUT /api/auth/me/location — record the user's last known position
// so the 200m radius query can find them. caller throttles to once
// per 60s; the server just stores what it's given.
authRouter.put('/auth/me/location', requireAuth, async (req, res, next) => {
  try {
    const { lat, lng } = req.body || {};
    if (typeof lat !== 'number' || typeof lng !== 'number') {
      return res.status(400).json({ error: 'invalid_location' });
    }
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return res.status(400).json({ error: 'invalid_location' });
    }
    await query(
      `UPDATE users
          SET last_known_lat = $1,
              last_known_lng = $2,
              last_location_at = NOW()
        WHERE id = $3`,
      [lat, lng, req.userId],
    );
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// re-exported so server.js can use the same requireAuth for other routers
export { requireAuth };
