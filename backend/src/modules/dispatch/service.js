import { query } from '../../db/pool.js';
import { emitDispatchEvent } from '../../events.js';

const VALID_STATUS = ['new', 'dispatched', 'on_scene', 'resolved'];

export async function listActiveIncidents(statusFilter = 'active') {
  let where = '';
  const params = [];
  if (statusFilter === 'active') {
    where = `WHERE status IN ('new','dispatched','on_scene')`;
  } else if (statusFilter === 'all') {
    where = '';
  } else {
    params.push(statusFilter);
    where = `WHERE status = $1`;
  }
  const { rows } = await query(
    `SELECT id, tracking_id, category, description, severity, status, lat, lng,
            location_label, is_anonymous, is_acoustic, assigned_to, created_at, updated_at,
            ai_severity, ai_confidence, ai_reasons
       FROM incidents
       ${where}
       ORDER BY
         CASE severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END,
         created_at DESC
       LIMIT 200`,
    params
  );
  return rows;
}

export async function listResponders() {
  const { rows } = await query(
    `SELECT id, name, role, status, phone FROM responders ORDER BY status, name`
  );
  return rows;
}

// haversine in SQL, returns the N closest AVAILABLE responders in
// meters. responders without a position get NULL distance and get
// pushed to the end so they still show up, just with no km label.
//
// Implementation note: we wrap the SELECT in a CTE (rather than
// referencing the `distance_m` alias directly in ORDER BY) because
// older PG query-planner paths surfaced "column distance_m does not
// exist" against this exact SELECT when the alias wasn't materialised
// by a subquery boundary. The CTE makes the alias resolvable in the
// outer ORDER BY on every supported PG version.
export async function listNearbyResponders({ lat, lng, limit = 3 }) {
  if (lat == null || lng == null) {
    const err = new Error('lat and lng required');
    err.status = 400;
    throw err;
  }
  const { rows } = await query(
    `WITH ranked AS (
       SELECT id, name, role, status, phone, lat, lng,
              CASE
                WHEN lat IS NULL OR lng IS NULL THEN NULL
                ELSE 2 * 6371000 * asin(
                  sqrt(
                    power(sin(radians((lat - $1) / 2)), 2) +
                    cos(radians($1)) * cos(radians(lat)) *
                    power(sin(radians((lng - $2) / 2)), 2)
                  )
                )
              END AS distance_m
         FROM responders
        WHERE status = 'available'
     )
     SELECT id, name, role, status, phone, lat, lng, distance_m
       FROM ranked
      ORDER BY (distance_m IS NULL), distance_m ASC NULLS LAST, name
      LIMIT $3`,
    [lat, lng, limit]
  );
  return rows;
}

export async function assignResponder({ incidentId, responderId, note = null }) {
  if (!incidentId || !responderId) {
    const err = new Error('incidentId and responderId required');
    err.status = 400;
    throw err;
  }

  const r = await query('SELECT status FROM responders WHERE id = $1', [responderId]);
  if (!r.rows[0]) {
    const err = new Error('responder_not_found');
    err.status = 404;
    throw err;
  }
  if (r.rows[0].status === 'off') {
    const err = new Error('responder_off_duty');
    err.status = 409;
    throw err;
  }

  await query(
    `INSERT INTO dispatches (incident_id, responder_id, note) VALUES ($1,$2,$3)`,
    [incidentId, responderId, note]
  );
  // bump incident to 'dispatched', mark the responder busy
  const upd = await query(
    `UPDATE incidents
        SET status = 'dispatched', assigned_to = $1, updated_at = NOW()
      WHERE id = $2
      RETURNING id, tracking_id, status, assigned_to, updated_at`,
    [responderId, incidentId]
  );
  await query(`UPDATE responders SET status = 'busy' WHERE id = $1`, [responderId]);
  return upd.rows[0];
}

export async function updateIncidentStatus(id, status) {
  if (!VALID_STATUS.includes(status)) {
    const err = new Error(`invalid_status; allowed: ${VALID_STATUS.join(',')}`);
    err.status = 400;
    throw err;
  }
  // need the old status so the credits step below only awards on a
  // real "non-resolved -> resolved" transition. re-resolving and
  // resolved -> on_scene -> resolved both shouldn't double-pay.
  const before = await query(
    `SELECT status, assigned_to FROM incidents WHERE id = $1`,
    [id]
  );
  if (!before.rows[0]) {
    const err = new Error('incident_not_found');
    err.status = 404;
    throw err;
  }
  const previousStatus = before.rows[0].status;
  const isFreshResolve = status === 'resolved' && previousStatus !== 'resolved';

  const resolvedAt = status === 'resolved' ? 'NOW()' : 'NULL';
  const { rows } = await query(
    `UPDATE incidents
        SET status = $1, updated_at = NOW(), resolved_at = ${resolvedAt}
      WHERE id = $2
      RETURNING id, tracking_id, status, assigned_to, updated_at, resolved_at`,
    [status, id]
  );
  // free up the responder if we just resolved
  if (status === 'resolved' && rows[0].assigned_to) {
    await query(`UPDATE responders SET status = 'available' WHERE id = $1`, [rows[0].assigned_to]);
  }
  // peer-response credits: +1 to every pledger for this incident on a
  // real resolve transition. one UPDATE, no loop. the guard above keeps
  // it idempotent.
  if (isFreshResolve) {
    await query(
      `UPDATE users
          SET credits = credits + 1
        WHERE id IN (SELECT user_id FROM responder_pledges WHERE incident_id = $1)`,
      [id]
    );
  }
  // need tracking_id for the socket event
  const tr = await query(`SELECT tracking_id FROM incidents WHERE id = $1`, [id]);
  emitDispatchEvent('incident:status_changed', {
    tracking_id: tr.rows[0]?.tracking_id,
    status: rows[0].status,
    assigned_to: rows[0].assigned_to,
    updated_at: rows[0].updated_at,
    resolved_at: rows[0].resolved_at,
  });
  return rows[0];
}

// ====== FEATURE 1: AI Triage — dispatcher override ======
const VALID_SEVERITY = ['low', 'medium', 'high', 'critical'];

export async function overrideSeverity(id, severity) {
  if (!VALID_SEVERITY.includes(severity)) {
    const err = new Error(`invalid_severity; allowed: ${VALID_SEVERITY.join(',')}`);
    err.status = 400;
    throw err;
  }
  const { rows } = await query(
    `UPDATE incidents
        SET severity = $1, updated_at = NOW()
      WHERE id = $2
      RETURNING id, tracking_id, severity, ai_severity, ai_confidence, ai_reasons, updated_at`,
    [severity, id]
  );
  if (!rows[0]) {
    const err = new Error('incident_not_found');
    err.status = 404;
    throw err;
  }
  // tell every connected console about the override
  const tr = await query(`SELECT tracking_id FROM incidents WHERE id = $1`, [id]);
  emitDispatchEvent('incident:severity_changed', {
    id: rows[0].id,
    tracking_id: tr.rows[0]?.tracking_id,
    severity: rows[0].severity,
    ai_severity: rows[0].ai_severity,
    ai_confidence: rows[0].ai_confidence,
    ai_reasons: rows[0].ai_reasons,
    updated_at: rows[0].updated_at,
  });
  return rows[0];
}
