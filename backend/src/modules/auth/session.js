// server-side session store. in-memory map keeps deps small. fine
// for a single-node campus deploy. the cookie carries just the sid,
// the user record lives here.
import crypto from 'node:crypto';

const SECRET = process.env.SESSION_SECRET || 'pulse-dev-session-secret-change-me';
const COOKIE_NAME = 'pulse_session';
const TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

const sessions = new Map(); // sid -> { userId, createdAt }

function sign(value) {
  return crypto.createHmac('sha256', SECRET).update(value).digest('hex');
}

function pack(userId) {
  const sid = crypto.randomBytes(24).toString('hex');
  const sig = sign(sid);
  sessions.set(sid, { userId, createdAt: Date.now() });
  return `${sid}.${sig}`;
}

function unpack(cookie) {
  if (!cookie || typeof cookie !== 'string') return null;
  const [sid, sig] = cookie.split('.');
  if (!sid || !sig) return null;
  if (sign(sid) !== sig) return null;
  return sid;
}

export function setSession(res, userId) {
  const value = pack(userId);
  res.cookie(COOKIE_NAME, value, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: TTL_MS,
    path: '/',
  });
}

export function clearSession(req, res) {
  const sid = unpack(req.cookies?.[COOKIE_NAME]);
  if (sid) sessions.delete(sid);
  res.clearCookie(COOKIE_NAME, { path: '/' });
}

export function readSessionUserId(req) {
  const sid = unpack(req.cookies?.[COOKIE_NAME]);
  if (!sid) return null;
  const s = sessions.get(sid);
  if (!s) return null;
  // lazy expiry sweep on read
  if (Date.now() - s.createdAt > TTL_MS) {
    sessions.delete(sid);
    return null;
  }
  return s.userId;
}

export function requireAuth(req, res, next) {
  const userId = readSessionUserId(req);
  if (!userId) return res.status(401).json({ error: 'unauthorized' });
  req.userId = userId;
  next();
}
