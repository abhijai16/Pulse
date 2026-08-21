import { Router } from 'express';
import { requireAuth } from '../auth/routes.js';
import { query } from '../../db/pool.js';

export const profileRouter = Router();

// GET /api/profile/me — own profile + recent pledges.
// `credits` is the +1 counter for incidents they pledged on that got
// resolved. `recentIncidents` is a small history for the profile page.
// visible only to the owner — no per-user lookup by id.
profileRouter.get('/profile/me', requireAuth, async (req, res, next) => {
  try {
    const userId = req.userId;

    const u = await query(
      'SELECT id, name, email, credits FROM users WHERE id = $1',
      [userId]
    );
    if (!u.rows[0]) return res.status(401).json({ error: 'unauthorized' });

    // recent incidents this user pledged on, newest pledge first.
    // INNER JOIN drops pledges for since-deleted incidents instead of
    // returning rows with NULL fields.
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
