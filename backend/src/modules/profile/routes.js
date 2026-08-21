import { Router } from 'express';
import { requireAuth } from '../auth/routes.js';
import { query } from '../../db/pool.js';

export const profileRouter = Router();

// GET /api/profile/me — the authenticated user's own profile + recent pledges.
// `credits` is the +1 counter awarded when an incident they pledged on was
// resolved by an official responder. `recentIncidents` joins their pledges
// back to the incident for a short history on the profile page. Visible
// only to the owner: there is no per-user lookup by id.
profileRouter.get('/profile/me', requireAuth, async (req, res, next) => {
  try {
    const userId = req.userId;

    const u = await query(
      'SELECT id, name, email, credits FROM users WHERE id = $1',
      [userId]
    );
    if (!u.rows[0]) return res.status(401).json({ error: 'unauthorized' });

    // Recent incidents this user pledged on, newest pledge first.
    // INNER JOIN so a pledge for a since-deleted incident is silently
    // dropped rather than producing a row with NULL fields.
    const i = await query(
      `SELECT i.id, i.tracking_id, i.category, i.severity,
              i.status, i.resolved_at, p.created_at AS pledged_at
         FROM responder_pledges p
         JOIN incidents i ON i.id = p.incident_id
        WHERE p.user_id = $1
        ORDER BY p.created_at DESC
        LIMIT 25`,
      [userId]
    );

    res.json({
      user: u.rows[0],
      recentIncidents: i.rows,
    });
  } catch (err) {
    next(err);
  }
});
