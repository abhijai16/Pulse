// Audio Sentry — acoustic distress detection backend.
//
// Keyword triggers from the live microphone, the simulator, or an
// external sensor land here. Each detection becomes a real Pulse
// incident (via submitReport so the existing report:submitted
// listener fans it out over Socket.io), with an audit row in
// audio_detection_events for the PulseBoard counter and the
// dispatch log "Acoustic Source" badge.

import { query } from '../../db/pool.js';
import { submitReport } from '../reporting/service.js';

// Pulse campus default coords — sensors report a free-text location
// today, so we anchor acoustic incidents to the campus center until
// the audio sensor hardware reports real coordinates.
const DEFAULT_LAT = 20.27240;
const DEFAULT_LNG = 85.83380;

// Keyword → Pulse category + severity + agency. This is the single
// source of truth; the audio_keywords table is seeded with the same
// data but kept separate for admin-time disablement without code edits.
const KEYWORD_MAP = {
  FIRE:      { category: 'fire',        severity: 'critical', agency: 'Fire Station (Dispatch Unit 1)' },
  SMOKE:     { category: 'fire',        severity: 'critical', agency: 'Fire Station (Dispatch Unit 1)' },
  BURNING:   { category: 'fire',        severity: 'critical', agency: 'Fire Station (Dispatch Unit 1)' },
  POLICE:    { category: 'unsafe_area', severity: 'critical', agency: 'Police Department & Rapid Response' },
  GUNSHOT:   { category: 'unsafe_area', severity: 'critical', agency: 'Police Department & Rapid Response' },
  INTRUDER:  { category: 'unsafe_area', severity: 'critical', agency: 'Police Department & Rapid Response' },
  ATTACK:    { category: 'unsafe_area', severity: 'critical', agency: 'Police Department & Rapid Response' },
  AMBULANCE: { category: 'medical',     severity: 'high',     agency: 'Campus Hospital & Paramedic Unit' },
  HOSPITAL:  { category: 'medical',     severity: 'high',     agency: 'Campus Hospital & Paramedic Unit' },
  MEDICAL:   { category: 'medical',     severity: 'high',     agency: 'Campus Hospital & Paramedic Unit' },
  HELP:      { category: 'unsafe_area', severity: 'high',     agency: 'Central Emergency Response & Campus Police' },
};

// Pick the first keyword from the spoken transcript. Order matters —
// GUNSHOT before POLICE so we don't route "gunshot near police
// station" to the police station instead of as a gunshot incident.
function detectKeyword(transcript) {
  const upper = String(transcript || '').toUpperCase();
  const ordered = Object.keys(KEYWORD_MAP);
  for (const kw of ordered) {
    if (upper.includes(kw)) return kw;
  }
  return null;
}

// Fire-and-forget upstream webhook fan-out. Mirrors the original
// standalone module's dual dispatch — Notification Engine + SCER
// radar. Failures are non-fatal: a dead upstream must never block
// the incident pipeline.
function fanOut(payload) {
  const notifyUrl = process.env.NOTIFICATION_SERVICE_URL;
  const scerWebhookUrl = process.env.SCER_WEBHOOK_URL;
  const body = JSON.stringify(payload);
  if (notifyUrl) {
    fetch(notifyUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body })
      .catch((e) => console.error('[audio] notify upstream failed', e.message));
  }
  if (scerWebhookUrl) {
    fetch(scerWebhookUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body })
      .catch((e) => console.error('[audio] scer webhook failed', e.message));
  }
}

export async function processDetection({
  detectedKeyword,
  confidenceScore = 0.95,
  audioLevelDb = -18.0,
  sensorLocation = 'Unknown sensor',
  rawTranscript = '',
  source = 'LIVE_MICROPHONE',
}) {
  // Normalize keyword. If the caller passed one explicitly we honor it;
  // otherwise we infer from the transcript so /simulate can fire with
  // just a transcript and still produce the right category.
  const kw = (detectedKeyword || detectKeyword(rawTranscript) || 'HELP').toUpperCase();
  const route = KEYWORD_MAP[kw] || KEYWORD_MAP.HELP;

  // Build the incident description with an [acoustic] prefix so the
  // dispatcher can see the source at a glance, and so Pulse's existing
  // triage reasons (which look at the description text) still get a
  // useful "why" for the AI Triage UI block.
  const description = `[acoustic:${source.toLowerCase()}] ${kw}: ${rawTranscript || 'keyword detected'}`;

  // Reuse submitReport so the report:submitted listener fires and the
  // Socket.io fan-out + nearby-volunteer notification happen for free.
  // severityOverride is the only path where audio wins over the generic
  // classifier; everything else (encryption for sensitive categories,
  // ai_severity/ai_confidence/ai_reasons) runs unchanged.
  const incident = await submitReport(
    {
      category: route.category,
      description,
      lat: DEFAULT_LAT,
      lng: DEFAULT_LNG,
      locationLabel: sensorLocation,
      isAnonymous: true,
      isAcoustic: true,
    },
    route.severity,
  );

  // Log the detection itself. We tolerate a failure here (e.g. the
  // audio_detection_events table is missing on a brand-new DB that
  // hasn't finished autoMigrate) — the incident already exists, the
  // audit row is best-effort.
  let audioEventId = null;
  try {
    const { rows } = await query(
      `INSERT INTO audio_detection_events
         (sensor_location, detected_keyword, confidence_score, audio_level_db,
          raw_transcript, source, incident_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING id`,
      [
        sensorLocation,
        kw,
        Number(confidenceScore) || null,
        Number(audioLevelDb) || null,
        rawTranscript || null,
        source,
        incident.id,
      ],
    );
    audioEventId = rows[0]?.id ?? null;
  } catch (e) {
    console.error('[audio] audit insert failed (incident still created)', e.message);
  }

  // Upstream fan-out (Notification Engine + SCER webhook). Same shape
  // the standalone module used so any downstream consumer that already
  // parses it keeps working.
  fanOut({
    eventType: source === 'SIMULATION' ? 'SIMULATED_DISTRESS' : 'VOICE_DISTRESS',
    severity: route.severity,
    recipient: route.agency,
    message: `🚨 [${source === 'SIMULATION' ? 'ACOUSTIC SIMULATION' : 'VOICE DISTRESS'}] Keyword "${kw}" at ${sensorLocation} — transcript: "${rawTranscript}"`,
    incidentId: incident.id,
    trackingId: incident.tracking_id,
  });

  return {
    success: true,
    eventId: audioEventId,
    incidentId: incident.id,
    trackingId: incident.tracking_id,
    keyword: kw,
    category: route.category,
    severity: route.severity,
    targetAgency: route.agency,
    dispatched: true,
  };
}

export async function listRecentEvents(limit = 8) {
  const { rows } = await query(
    `SELECT id, timestamp, sensor_location, detected_keyword, confidence_score,
            audio_level_db, raw_transcript, source, incident_id
       FROM audio_detection_events
      ORDER BY timestamp DESC
      LIMIT $1`,
    [limit],
  );
  return rows;
}

// 24-hour count for the PulseBoard "Acoustic Triggers" KPI tile.
export async function countSince(hours = 24) {
  const { rows } = await query(
    `SELECT COUNT(*)::int AS n
       FROM audio_detection_events
      WHERE timestamp > NOW() - ($1 || ' hours')::interval`,
    [hours],
  );
  return rows[0]?.n ?? 0;
}
