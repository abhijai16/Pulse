// Nearby-volunteer notification. On every report:submitted, find
// verified users within 200 m of the incident and email them. The
// transport + templates live in modules/auth/mailer.js; this module
// is just the radius query + dispatch loop.
//
// We deliberately do the distance calc inline in SQL with the
// Haversine formula — PostGIS would be cleaner but the dataset is
// small and we don't want to add a native extension just for this.
import { query } from '../../db/pool.js';
import { sendVolunteerRequest } from '../auth/mailer.js';

// Categories that warrant a civilian ask-for-help blast. Anything
// else (fire, infra, unsafe_area) is dispatcher-only.
const NOTIFY_CATEGORIES = new Set(['medical', 'harassment']);
const RADIUS_METERS = 200;
const MAX_RECIPIENTS = 25; // belt-and-braces cap for the demo

// Returns true if the user is "fresh enough" to notify. We allow
// stale points (no time filter) because the alternative is missing
// the campus security guard who only opens the app once a week — but
// we still cap the radius at 200 m so a stale point far away can't
// trigger a blast.
function isNotifiable(u) {
  return Number.isFinite(u.lat) && Number.isFinite(u.lng);
}

export async function notifyNearbyVolunteers(incident) {
  if (!incident || !NOTIFY_CATEGORIES.has(incident.category)) return;
  if (!Number.isFinite(incident.lat) || !Number.isFinite(incident.lng)) return;

  // Haversine in meters. 6371000 = Earth radius in m.
  // The (u.last_known_lat - $lat) factors cancel out at the boundary
  // so we use 0 as a tie-break by sorting on distance, then id.
  const { rows } = await query(
    `SELECT u.id, u.name, u.email, u.last_known_lat  AS lat, u.last_known_lng AS lng,
            (
              6371000 * 2 * ASIN(SQRT(
                POWER(SIN(RADIANS(u.last_known_lat - $1) / 2), 2) +
                COS(RADIANS($1)) * COS(RADIANS(u.last_known_lat)) *
                POWER(SIN(RADIANS(u.last_known_lng - $2) / 2), 2)
              ))
            ) AS distance_m
       FROM users u
      WHERE u.email_verified = true
        AND u.last_known_lat IS NOT NULL
        AND u.last_known_lng IS NOT NULL
      ORDER BY distance_m ASC, u.id ASC
      LIMIT $3`,
    [incident.lat, incident.lng, MAX_RECIPIENTS],
  );

  const nearby = rows.filter((u) => isNotifiable(u) && u.distance_m <= RADIUS_METERS);
  if (nearby.length === 0) {
    console.log(
      `[community] ${incident.tracking_id} (${incident.category}): ` +
      `no verified users within ${RADIUS_METERS}m — skipping email blast`,
    );
    return;
  }

  console.log(
    `[community] ${incident.tracking_id} (${incident.category}): ` +
    `notifying ${nearby.length} verified user(s) within ${RADIUS_METERS}m`,
  );

  // Fire-and-forget. We intentionally don't await: a single slow
  // SMTP connection must not back up the report flow. Each sendMail
  // already swallows + logs its own errors.
  for (const u of nearby) {
    sendVolunteerRequest({ to: u.email, name: u.name, incident }).catch((err) => {
      console.error(`[community] sendVolunteerRequest threw for ${u.email}:`, err);
    });
  }
}
