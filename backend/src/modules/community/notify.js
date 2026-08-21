// nearby-volunteer notification. on every report:submitted, find
// verified users within 200m of the incident and email them. transport
// + templates live in modules/auth/mailer.js; this file is just the
// radius query + fan-out.
//
// doing the haversine inline in SQL on purpose. PostGIS would be
// nicer but we don't want a native extension just for this.
import { query } from '../../db/pool.js';
import { sendVolunteerRequest } from '../auth/mailer.js';

// only medical + harassment get a civilian ask-for-help blast.
// fire/infra/unsafe_area is dispatcher-only.
const NOTIFY_CATEGORIES = new Set(['medical', 'harassment']);
const RADIUS_METERS = 200;
const MAX_RECIPIENTS = 25; // safety cap for the demo

// we're permissive on staleness — better to email the campus guard
// who only opens the app once a week than to miss them. the 200m
// radius is what keeps a stale point from triggering a far-away blast.
function isNotifiable(u) {
  return Number.isFinite(u.lat) && Number.isFinite(u.lng);
}

export async function notifyNearbyVolunteers(incident) {
  if (!incident || !NOTIFY_CATEGORIES.has(incident.category)) return;
  if (!Number.isFinite(incident.lat) || !Number.isFinite(incident.lng)) return;

  // haversine, meters. 6371000 = earth radius in m.
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

  // fire-and-forget. one slow SMTP must not block the report flow.
  // sendMail already swallows its own errors.
  for (const u of nearby) {
    sendVolunteerRequest({ to: u.email, name: u.name, incident }).catch((err) => {
      console.error(`[community] sendVolunteerRequest threw for ${u.email}:`, err);
    });
  }
}
