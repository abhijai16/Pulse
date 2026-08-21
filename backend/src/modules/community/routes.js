// community (civilian responder) endpoints. two things:
//   1. record an "I'm responding" pledge
//   2. read pledge state for an incident so the dispatcher card can
//      show "N volunteers en route" + a name list
import { Router } from 'express';
import { query } from '../../db/pool.js';
import { requireAuth } from '../auth/session.js';
import { emitVolunteerJoined } from '../../realtime/socket.js';

export const communityRouter = Router();
communityRouter.use(requireAuth);

// POST /api/community/incidents/:id/pledge
// idempotent — re-click is a no-op, UNIQUE constraint catches it.
// fires a socket event so the dispatcher card stays live.
communityRouter.post('/incidents/:id/pledge', async (req, res, next) => {
  const incidentId = Number(req.params.id);
  if (!Number.isFinite(incidentId)) {
    return res.status(400).json({ error: 'invalid_incident_id' });
  }

  try {
    // pledge only on still-open incidents. resolved -> 409.
    const inc = await query(
      `SELECT id, tracking_id, status FROM incidents WHERE id = $1`,
      [incidentId],
    );
    if (!inc.rows[0]) return res.status(404).json({ error: 'incident_not_found' });
    if (inc.rows[0].status === 'resolved') {
      return res.status(409).json({ error: 'incident_resolved' });
    }

    // ON CONFLICT DO NOTHING turns a duplicate click into a 200 so
    // the UI doesn't have to handle two cases.
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
// used by RespondOps for the "Volunteers en route" block
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
  // count + first 5 names. cap at 5 because that's all the UI
  // renders, and the rest isn't useful at this scale.
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
