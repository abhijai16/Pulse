import { v4 as uuid } from 'uuid';
import { query } from '../../db/pool.js';
import { encryptField } from '../../utils/encryption.js';
import { classifySeverity } from './severity.js';
import { triage } from './triage.js';
import { emitReportingEvent } from '../../events.js';

// Anonymous or harassment reports get description encrypted so even DB dumps
// don't reveal reporter identity or sensitive phrasing. The reporting module
// owns this — dispatch/analytics only see decrypted text via the API.

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

  // AI Triage — runs in addition to the legacy classifier, returns explainable
  // reasons that the RespondOps console can surface to the dispatcher.
  const ai = triage(category, description);

  // Encrypt description when reporter chose anonymity or category is sensitive.
  const sensitive = isAnonymous || category === 'harassment';
  const reporterToken = sensitive ? encryptField(description) : null;
  // For non-sensitive, we still store description in plaintext column for
  // dispatch readability — encryption is opt-in via anonymous flag.

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

  // Include AI fields on the socket event payload so RespondOps sees them
  // without a second round-trip.
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

  // Include last 3 status changes (we don't have a status_history table yet,
  // so derive from updated_at / resolved_at for now — keeps schema lean).
  return incident;
}

export async function listRecent(limit = 20) {
  // Includes resolved_at + response_minutes so the landing "Recent activity"
  // row can show "Fire — Library Block, resolved in 12 min".
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
