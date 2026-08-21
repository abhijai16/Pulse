// auth data layer. college email domain is checked at the boundary
// (env: ALLOWED_EMAIL_DOMAIN) so the policy lives in one spot.
import { query } from '../../db/pool.js';
import { hashPassword, verifyPassword } from './password.js';

const ALLOWED_DOMAIN = (process.env.ALLOWED_EMAIL_DOMAIN || '').toLowerCase().trim();

export function isAllowedEmail(email) {
  if (!ALLOWED_DOMAIN) return false; // fail closed if env is missing
  return email.toLowerCase().endsWith(`@${ALLOWED_DOMAIN}`);
}

export async function createUser({ name, email, password }) {
  const password_hash = hashPassword(password);
  const { rows } = await query(
    `INSERT INTO users (name, email, password_hash)
     VALUES ($1, $2, $3)
     RETURNING id, name, email, email_verified`,
    [name, email.toLowerCase(), password_hash],
  );
  return rows[0];
}

export async function findUserByEmail(email) {
  const { rows } = await query(
    'SELECT id, name, email, password_hash, email_verified FROM users WHERE email = $1',
    [email.toLowerCase()],
  );
  return rows[0] || null;
}

// returns a sentinel object so the route can tell "wrong password"
// apart from "not verified" without service.js knowing HTTP shapes.
//
// for unverified accounts we return { unverified: true } BEFORE
// checking the password. the OTP is what proves email control, so
// saying "you need to verify first" doesn't reveal anything. the
// trade-off (an attacker can probe which emails are registered) is
// fine for a campus deployment.
export async function authenticate({ email, password }) {
  const user = await findUserByEmail(email);
  if (!user) return null;
  if (!user.email_verified) return { unverified: true, email: user.email };
  if (!verifyPassword(password, user.password_hash)) return null;
  return { id: user.id, name: user.name, email: user.email };
}

export async function markEmailVerified(email) {
  const { rows } = await query(
    `UPDATE users SET email_verified = true
     WHERE email = $1
     RETURNING id, name, email`,
    [email.toLowerCase()],
  );
  return rows[0] || null;
}

export async function findUnverifiedByEmail(email) {
  const { rows } = await query(
    'SELECT id, name, email, email_verified FROM users WHERE email = $1',
    [email.toLowerCase()],
  );
  if (!rows[0]) return null;
  if (rows[0].email_verified) return null; // already verified, no resend needed
  return rows[0];
}
