import { query } from '../../db/pool.js';
import { emitAnalyticsEvent } from '../../events.js';

export async function getHeatmap() {
  // every point in the last 30 days — frontend will cluster
  const { rows } = await query(
    `SELECT id, tracking_id, category, severity, lat, lng, location_label, status, created_at
       FROM incidents
      WHERE created_at > NOW() - INTERVAL '30 days'
      ORDER BY created_at DESC`
  );
  return rows;
}

export async function getMetrics() {
  // avg response time = avg(resolved_at - created_at) for resolved incidents
  const r1 = await query(
    `SELECT
       COUNT(*)::int AS total_incidents,
       COUNT(*) FILTER (WHERE status = 'resolved')::int AS resolved_incidents,
       COUNT(*) FILTER (WHERE status IN ('new','dispatched','on_scene'))::int AS active_incidents,
       COALESCE(AVG(EXTRACT(EPOCH FROM (resolved_at - created_at)) / 60.0) FILTER (WHERE resolved_at IS NOT NULL), 0)::float AS avg_response_minutes
     FROM incidents`
  );
  const r2 = await query(
    `SELECT category, COUNT(*)::int AS n
       FROM incidents
       GROUP BY category
       ORDER BY n DESC`
  );
  const r3 = await query(
    `SELECT severity, COUNT(*)::int AS n
       FROM incidents
       GROUP BY severity
       ORDER BY n DESC`
  );
  // FEATURE: Peer-Response Credits — aggregate community engagement on
  // PulseBoard. Counts pledge-rows (not distinct users) so multiple
  // pledges across multiple incidents stack, matching the spec wording
  // "count of total peer-response actions".
  const r4 = await query(
    `SELECT COUNT(*)::int AS peer_assists_this_month
       FROM responder_pledges
      WHERE created_at >= date_trunc('month', NOW())`
  );
  return {
    ...r1.rows[0],
    by_category: r2.rows,
    by_severity: r3.rows,
    peer_assists_this_month: r4.rows[0].peer_assists_this_month,
  };
}

export async function getRepeatedIncidents() {
  // naive cluster: round coords to ~3 decimal places (~100m), group by category + location
  const { rows } = await query(
    `SELECT
        ROUND(lat::numeric, 3) AS lat_r,
        ROUND(lng::numeric, 3) AS lng_r,
        category,
        MAX(location_label) AS location_label,
        COUNT(*)::int AS occurrences,
        MAX(created_at) AS last_seen
       FROM incidents
       GROUP BY ROUND(lat::numeric, 3), ROUND(lng::numeric, 3), category
      HAVING COUNT(*) >= 2
       ORDER BY occurrences DESC, last_seen DESC
       LIMIT 50`
  );
  return rows;
}

export async function createBroadcast({ lat, lng, radiusM, message, severity, durationMinutes = 30 }) {
  if (lat == null || lng == null || !message || !radiusM || !severity) {
    const err = new Error('lat, lng, radiusM, message, severity required');
    err.status = 400;
    throw err;
  }
  // FEATURE 2: geofence — every broadcast is now also an active geofence
  // for `durationMinutes` (default 30). NULL = evergreen until manually cleared.
  const activeUntil = durationMinutes > 0
    ? new Date(Date.now() + durationMinutes * 60_000).toISOString()
    : null;
  const { rows } = await query(
    `INSERT INTO broadcasts (lat, lng, radius_m, message, severity, active_until)
     VALUES ($1,$2,$3,$4,$5,$6)
     RETURNING id, lat, lng, radius_m, message, severity, created_at, active_until`,
    [lat, lng, radiusM, message, severity, activeUntil]
  );
  emitAnalyticsEvent('broadcast:created', rows[0]);
  return rows[0];
}

export async function listBroadcasts() {
  const { rows } = await query(
    `SELECT id, lat, lng, radius_m, message, severity, created_at, active_until
       FROM broadcasts
       ORDER BY created_at DESC
       LIMIT 50`
  );
  return rows;
}

// ====== FEATURE 2: Geofence — find active zones containing a point ======
// Uses the haversine formula to test containment. We only return zones that
// are not yet expired (active_until IS NULL OR active_until > NOW()).
export async function findActiveGeofencesForPoint(lat, lng) {
  if (lat == null || lng == null) {
    const err = new Error('lat, lng required');
    err.status = 400;
    throw err;
  }
  // Pull every candidate zone (still small for a campus-scale app) and filter
  // in JS. For city-scale we'd use PostGIS ST_DWithin.
  const { rows } = await query(
    `SELECT id, lat, lng, radius_m, message, severity, created_at, active_until
       FROM broadcasts
      WHERE active_until IS NULL OR active_until > NOW()
      ORDER BY created_at DESC
      LIMIT 200`
  );
  return rows.filter((b) => haversineMeters(lat, lng, b.lat, b.lng) <= b.radius_m);
}

function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
