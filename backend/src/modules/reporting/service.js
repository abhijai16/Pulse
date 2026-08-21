import { v4 as uuid } from 'uuid';
import { query } from '../../db/pool.js';
import { encryptField } from '../../utils/encryption.js';
import { classifySeverity } from './severity.js';
import { triage } from './triage.js';
import { emitReportingEvent } from '../../events.js';

// anonymous + harassment reports get their description encrypted at
// rest. dispatch/analytics never see plaintext unless they go through
// the API. only the reporting module touches the encryption layer.

export async function submitReport(input) {
  const {
    category,
    description,
    photoUrl = null,
    lat,
    lng,
    locationLabel = null,
    isAnonymous = false,
  } = input;

  if (!category || !description || lat == null || lng == null) {
    const err = new Error('category, description, lat, lng are required');
    err.status = 400;
    throw err;
  }

  const severity = classifySeverity(category, description);
  const trackingId = `PULSE-${uuid().slice(0, 8).toUpperCase()}`;

  // AI triage on top of the legacy classifier. returns reasons +
  // confidence so the dispatch console can show "why".
  const ai = triage(category, description);

  // encrypt when anonymous or when the category is sensitive.
  const sensitive = isAnonymous || category === 'harassment';
  const reporterToken = sensitive ? encryptField(description) : null;
  // non-sensitive stuff stays in plaintext — dispatch needs to read it.

  const { rows } = await query(
    `INSERT INTO incidents
       (tracking_id, category, description, photo_url, lat, lng, location_label,
        severity, is_anonymous, reporter_token,
        ai_severity, ai_confidence, ai_reasons)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     RETURNING id, tracking_id, category, severity, status, created_at,
               ai_severity, ai_confidence, ai_reasons`,
    [
      trackingId,
      category,
      sensitive ? '[encrypted — see reporter_token]' : description,
      photoUrl,
      lat,
      lng,
      locationLabel,
      severity,
      isAnonymous,
      reporterToken,
      ai.severity,
      ai.confidence,
      JSON.stringify(ai.reasons),
    ]
  );

  // stick AI fields on the socket payload so RespondOps doesn't need
  // a second round-trip to get them.
  const out = { ...rows[0], ai_reasons: ai.reasons, ai_confidence: ai.confidence, ai_severity: ai.severity };
  emitReportingEvent('report:submitted', out);
  return out;
}

export async function getByTrackingId(trackingId) {
  const { rows } = await query(
    `SELECT id, tracking_id, category, severity, status, lat, lng, location_label,
            is_anonymous, created_at, updated_at, resolved_at, assigned_to,
            ai_severity, ai_confidence, ai_reasons
       FROM incidents
      WHERE tracking_id = $1`,
    [trackingId]
  );
  if (!rows[0]) return null;
  const incident = rows[0];

  // no status_history table yet. if we ever need it, this is the spot.
  return incident;
}

export async function listRecent(limit = 20) {
  // response_minutes is computed in SQL so the landing ticker can show
  // "Fire — Library Block, resolved in 12 min" without a second query.
  const { rows } = await query(
    `SELECT id, tracking_id, category, severity, status, location_label, created_at,
            ai_severity, ai_confidence, ai_reasons, resolved_at,
            CASE WHEN resolved_at IS NOT NULL
                 THEN ROUND(EXTRACT(EPOCH FROM (resolved_at - created_at)) / 60.0)::int
                 ELSE NULL END AS response_minutes
       FROM incidents
      ORDER BY created_at DESC
      LIMIT $1`,
    [limit]
  );
  return rows;
}
