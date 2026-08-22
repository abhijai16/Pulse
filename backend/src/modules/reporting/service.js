import { v4 as uuid } from 'uuid';
import { query } from '../../db/pool.js';
import { encryptField } from '../../utils/encryption.js';
import { classifySeverity } from './severity.js';
import { triage } from './triage.js';
import { emitReportingEvent } from '../../events.js';

// anonymous + harassment reports get their description encrypted at
// rest. dispatch/analytics never see plaintext unless they go through
// the API. only the reporting module touches the encryption layer.

export async function submitReport(input, severityOverride = null) {
  const {
    category,
    description,
    photoUrl = null,
    mediaUrls = [],
    lat,
    lng,
    locationLabel = null,
    isAnonymous = false,
    isAcoustic = false,
  } = input;

  if (!category || !description || lat == null || lng == null) {
    const err = new Error('category, description, lat, lng are required');
    err.status = 400;
    throw err;
  }

  // FEATURE: Audio Sentry — deterministic severity override. The audio
  // module owns the keyword→severity table (FIRE→critical, HELP→high)
  // because Pulse's generic classifier doesn't know a gunshot is more
  // urgent than a stalled generator. When the override is provided we
  // trust it; otherwise the existing classifier runs unchanged.
  const ALLOWED_SEVERITY = ['low', 'medium', 'high', 'critical'];
  const severity = severityOverride && ALLOWED_SEVERITY.includes(severityOverride)
    ? severityOverride
    : classifySeverity(category, description);
  const trackingId = `PULSE-${uuid().slice(0, 8).toUpperCase()}`;

  // AI triage on top of the legacy classifier. returns reasons +
  // confidence so the dispatch console can show "why".
  const ai = triage(category, description);

  // encrypt when anonymous or when the category is sensitive.
  const sensitive = isAnonymous || category === 'harassment';
  const reporterToken = sensitive ? encryptField(description) : null;
  // non-sensitive stuff stays in plaintext — dispatch needs to read it.

  // photo_url is kept for backward-compat (older clients + older rows).
  // media_urls is the new array; first item wins as the cover photo.
  const photo = photoUrl || (mediaUrls.length > 0 ? mediaUrls[0] : null);
  const mediaList = Array.isArray(mediaUrls) ? mediaUrls : [];

  const { rows } = await query(
    `INSERT INTO incidents
       (tracking_id, category, description, photo_url, media_urls,
        lat, lng, location_label,
        severity, is_anonymous, reporter_token,
        ai_severity, ai_confidence, ai_reasons,
        is_acoustic)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
     RETURNING id, tracking_id, category, severity, status, created_at,
               ai_severity, ai_confidence, ai_reasons,
               photo_url, media_urls, is_acoustic`,
    [
      trackingId,
      category,
      sensitive ? '[encrypted — see reporter_token]' : description,
      photo,
      mediaList,
      lat,
      lng,
      locationLabel,
      severity,
      isAnonymous,
      reporterToken,
      ai.severity,
      ai.confidence,
      JSON.stringify(ai.reasons),
      isAcoustic,
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
            ai_severity, ai_confidence, ai_reasons,
            photo_url, media_urls
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
