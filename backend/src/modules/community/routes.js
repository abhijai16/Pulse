// Community (civilian responder) endpoints. Two responsibilities:
//   1. Record a "I'm responding" pledge against an incident.
//   2. Read aggregate pledge state for an incident so the dispatcher
//      card can show "N volunteers en route" and a name list.
//
// Both endpoints are mounted under requireAuth at the router level.
import { Router } from 'express';
import { query } from '../../db/pool.js';
import { requireAuth } from '../auth/session.js';
import { emitVolunteerJoined } from '../../realtime/socket.js';

export const communityRouter = Router();
communityRouter.use(requireAuth);

// POST /api/community/incidents/:id/pledge
// Idempotent: a re-click is a no-op (UNIQUE constraint catches it
// and we just re-fetch the count + names). The dispatcher card needs
// the live state after this fires, so we emit a socket event.
communityRouter.post('/incidents/:id/pledge', async (req, res, next) => {
  const incidentId = Number(req.params.id);
  if (!Number.isFinite(incidentId)) {
    return res.status(400).json({ error: 'invalid_incident_id' });
  }

  try {
    // Verify the incident exists and is still open. We don't allow
    // pledges on resolved incidents — the responder side would just
    // be noise.
    const inc = await query(
      `SELECT id, tracking_id, status FROM incidents WHERE id = $1`,
      [incidentId],
    );
    if (!inc.rows[0]) return res.status(404).json({ error: 'incident_not_found' });
    if (inc.rows[0].status === 'resolved') {
      return res.status(409).json({ error: 'incident_resolved' });
    }

    // Insert. ON CONFLICT DO NOTHING turns a duplicate click into a
    // success so the UI doesn't have to differentiate.
    await query(
      `INSERT INTO responder_pledges (incident_id, user_id)
       VALUES ($1, $2)
       ON CONFLICT (incident_id, user_id) DO NOTHING`,
      [incidentId, req.userId],
    );

    const state = await readPledgeState(incidentId);
    emitVolunteerJoined({
      incidentId,
      trackingId: inc.rows[0].tracking_id,
      count: state.count,
      pledgers: state.pledgers,
    });
    res.status(201).json({ pledged: true, ...state });
  } catch (err) {
    next(err);
  }
});

// GET /api/community/incidents/:id/pledges
// Used by RespondOps to populate the "Volunteers en route" block.
communityRouter.get('/incidents/:id/pledges', async (req, res, next) => {
  const incidentId = Number(req.params.id);
  if (!Number.isFinite(incidentId)) {
    return res.status(400).json({ error: 'invalid_incident_id' });
  }
  try {
    res.json(await readPledgeState(incidentId));
  } catch (err) {
    next(err);
  }
});

async function readPledgeState(incidentId) {
  // Aggregate count + a small list of names for the dispatcher card.
  // We cap the list at 5 because the UI only renders that many and
  // the full list isn't useful at the demo scale.
  const { rows } = await query(
    `SELECT u.id, u.name, p.created_at
       FROM responder_pledges p
       JOIN users u ON u.id = p.user_id
      WHERE p.incident_id = $1
      ORDER BY p.created_at ASC
      LIMIT 5`,
    [incidentId],
  );
  const cnt = await query(
    `SELECT COUNT(*)::int AS c FROM responder_pledges WHERE incident_id = $1`,
    [incidentId],
  );
  return { count: cnt.rows[0].c, pledgers: rows };
}
