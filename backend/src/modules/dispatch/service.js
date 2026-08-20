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
            location_label, is_anonymous, assigned_to, created_at, updated_at,
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
  // Move incident to 'dispatched' and mark responder as busy
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
  const resolvedAt = status === 'resolved' ? 'NOW()' : 'NULL';
  const { rows } = await query(
    `UPDATE incidents
        SET status = $1, updated_at = NOW(), resolved_at = ${resolvedAt}
      WHERE id = $2
      RETURNING id, tracking_id, status, assigned_to, updated_at, resolved_at`,
    [status, id]
  );
  if (!rows[0]) {
    const err = new Error('incident_not_found');
    err.status = 404;
    throw err;
  }
  // free the responder when resolved
  if (status === 'resolved' && rows[0].assigned_to) {
    await query(`UPDATE responders SET status = 'available' WHERE id = $1`, [rows[0].assigned_to]);
  }
  // fetch tracking_id for the socket fan-out
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
  // Notify every connected console of the override so the UI updates live
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
