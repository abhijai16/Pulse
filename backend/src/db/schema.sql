-- Smart Campus Emergency Response — shared schema
-- All three modules (AlertNow / RespondOps / PulseBoard) read and write here.
-- Tables are grouped by owning module so a single module can be extracted cleanly.

-- ============ MODULE 2: RespondOps (responders must exist before incidents FK) ============
CREATE TABLE IF NOT EXISTS responders (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  role        TEXT NOT NULL,                     -- security | medical | maintenance | fire
  status      TEXT NOT NULL DEFAULT 'available',-- available | busy | off
  phone       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- FEATURE: Responder coordinates for the "Nearest responders" panel on
-- AlertNow. Optional (NULL = no position yet → distance returns NULL and
-- the responder is sorted last). Sample positions are seeded below so the
-- panel has real km values out-of-the-box without requiring an admin UI.
ALTER TABLE responders
  ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS lng DOUBLE PRECISION;

-- Seed sample Bhubaneswar-area positions for the demo roster. ON CONFLICT
-- (name) DO NOTHING so re-running migrate keeps the same coords. The
-- (name) unique index below is what makes the conflict target valid.
CREATE UNIQUE INDEX IF NOT EXISTS idx_responders_name ON responders(name);

INSERT INTO responders (name, role, status, phone, lat, lng) VALUES
  ('Amit Kumar',   'security', 'available', '+91 98765 11101', 20.27240, 85.83380),
  ('Rahul Singh',  'medical',  'available', '+91 98765 11102', 20.27500, 85.83900),
  ('Neha Patel',   'security', 'available', '+91 98765 11103', 20.28100, 85.84100),
  ('Vikram Rao',   'maintenance','available', '+91 98765 11104', 20.27000, 85.83800),
  ('Sandeep Joshi','fire',     'available', '+91 98765 11105', 20.27400, 85.83100)
ON CONFLICT (name) DO NOTHING;

-- ============ MODULE 1: AlertNow (reporting) ============
CREATE TABLE IF NOT EXISTS incidents (
  id              SERIAL PRIMARY KEY,
  tracking_id     TEXT UNIQUE NOT NULL,
  category        TEXT NOT NULL,                 -- medical | fire | harassment | unsafe_area | infra
  description     TEXT NOT NULL,
  photo_url       TEXT,
  lat             DOUBLE PRECISION NOT NULL,
  lng             DOUBLE PRECISION NOT NULL,
  location_label  TEXT,
  severity        TEXT NOT NULL,                 -- low | medium | high | critical
  is_anonymous    BOOLEAN NOT NULL DEFAULT false,
  reporter_token  TEXT,                          -- encrypted description when anonymous/sensitive
  status          TEXT NOT NULL DEFAULT 'new',   -- new | dispatched | on_scene | resolved
  assigned_to     INTEGER,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at     TIMESTAMPTZ
);

-- FEATURE: Multi-attachment support for AlertNow reports. The single
-- photo_url column is kept for back-compat with older rows; media_urls
-- holds the up-to-4 attachment URLs (mix of image + short video) that
-- the new multipart endpoint accepts under the 'media' field name.
ALTER TABLE incidents
  ADD COLUMN IF NOT EXISTS media_urls TEXT[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_incidents_status ON incidents(status);
CREATE INDEX IF NOT EXISTS idx_incidents_category ON incidents(category);
CREATE INDEX IF NOT EXISTS idx_incidents_created ON incidents(created_at DESC);

-- ============ FEATURE 1: AI Triage (extends Module 1) ============
-- ai_severity / ai_confidence are set when the report is submitted.
-- ai_reasons stores a JSON array of matched keywords (for the pitch demo).
-- A dispatcher may override `severity` — ai_severity remains the original
-- suggestion, so the UI can show "AI suggested HIGH, dispatcher set CRITICAL".
ALTER TABLE incidents
  ADD COLUMN IF NOT EXISTS ai_severity   TEXT,
  ADD COLUMN IF NOT EXISTS ai_confidence REAL,
  ADD COLUMN IF NOT EXISTS ai_reasons    JSONB;

-- FK added after both tables exist (avoids forward-reference on fresh DB)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
     WHERE constraint_name = 'incidents_assigned_to_fk'
       AND table_name = 'incidents'
  ) THEN
    ALTER TABLE incidents
      ADD CONSTRAINT incidents_assigned_to_fk
      FOREIGN KEY (assigned_to) REFERENCES responders(id);
  END IF;
END $$;

-- ============ MODULE 2: RespondOps (dispatch) ============
CREATE TABLE IF NOT EXISTS dispatches (
  id           SERIAL PRIMARY KEY,
  incident_id  INTEGER NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  responder_id INTEGER NOT NULL REFERENCES responders(id),
  assigned_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  note         TEXT
);

CREATE INDEX IF NOT EXISTS idx_dispatches_incident ON dispatches(incident_id);

-- ============ MODULE 3: PulseBoard (analytics + broadcast) ============
CREATE TABLE IF NOT EXISTS broadcasts (
  id          SERIAL PRIMARY KEY,
  lat         DOUBLE PRECISION NOT NULL,
  lng         DOUBLE PRECISION NOT NULL,
  radius_m    INTEGER NOT NULL,
  message     TEXT NOT NULL,
  severity    TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============ FEATURE 2: Geofence ============
-- active_until is set at creation (NOW() + duration_minutes). An alert is
-- considered "live" while NOW() < active_until. NULL means evergreen
-- (admin can still expire manually).
ALTER TABLE broadcasts
  ADD COLUMN IF NOT EXISTS active_until TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_broadcasts_active
  ON broadcasts(active_until)
  WHERE active_until IS NOT NULL;

-- ============ AUTH: simple email + password ============
-- Restricted to a single college email domain (env: ALLOWED_EMAIL_DOMAIN).
-- password_hash stores scrypt(N=2^14, r=8, p=1) in the format
-- "<salt-hex>:<derived-hex>" so we don't pull in a native bcrypt dep.
CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Email verification flag. New rows default to false; existing rows
-- (created before OTP was introduced) also stay false so they can't
-- log in until they re-verify — safe default.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- ============ FEATURE: Nearby-volunteer notifications ============
-- Last location the browser told us about, for the 200 m radius query.
-- Updated by PUT /api/auth/me/location whenever the SPA reports a fresh
-- position. last_location_at is the freshness signal so we can drop
-- stale points (e.g. a user who last opened the app 3 days ago).
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS last_known_lat   DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS last_known_lng   DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS last_location_at TIMESTAMPTZ;

-- A pledge is a logged-in user saying "I'm en route" for one incident.
-- (incident_id, user_id) is unique so re-clicking the button is a
-- no-op rather than a 500. The dispatcher side joins/aggregates from
-- here to show "N volunteers en route" on the RespondOps card.
CREATE TABLE IF NOT EXISTS responder_pledges (
  id           SERIAL PRIMARY KEY,
  incident_id  INTEGER NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (incident_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_pledges_incident ON responder_pledges(incident_id);
CREATE INDEX IF NOT EXISTS idx_pledges_user     ON responder_pledges(user_id);

-- ============ FEATURE: Peer-Response Credits ============
-- Lightweight +1 counter per pledger per incident-resolution. Awarded
-- server-side in dispatch/service.js updateIncidentStatus when an
-- incident transitions non-resolved → resolved. Initialized to 0 via
-- DEFAULT so existing rows are safe on re-run.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS credits INTEGER NOT NULL DEFAULT 0;

-- ============ Audio Sentry: acoustic distress detection ============
-- is_acoustic flags incidents that were created by the audio module.
-- We can't use the description prefix (the description is encrypted
-- when is_anonymous is true), so a dedicated boolean column is the
-- cheapest way for the RespondOps UI to render the "🎙 acoustic"
-- badge without decrypting anything. Default false is safe on re-run.
ALTER TABLE incidents
  ADD COLUMN IF NOT EXISTS is_acoustic BOOLEAN NOT NULL DEFAULT false;

-- audio_detection_events is the audit log for every keyword fired by
-- the live microphone or the simulator. incident_id is a soft FK so
-- deleting an incident doesn't cascade-delete the audio history (we
-- want to be able to replay "what did the mic hear before the user
-- cancelled the report").
CREATE TABLE IF NOT EXISTS audio_detection_events (
  id               SERIAL PRIMARY KEY,
  timestamp        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sensor_location  TEXT NOT NULL,
  detected_keyword TEXT NOT NULL,
  confidence_score REAL,
  audio_level_db   REAL,
  raw_transcript   TEXT,
  source           TEXT NOT NULL DEFAULT 'LIVE_MICROPHONE', -- LIVE_MICROPHONE | SIMULATION | EXTERNAL_SENSOR
  incident_id      INTEGER REFERENCES incidents(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_audio_det_ts ON audio_detection_events(timestamp DESC);

-- Keyword directory for the audio engine. Seeded with the default
-- triggers; ON CONFLICT keeps a re-run idempotent. The active flag
-- lets an admin disable a keyword without dropping the row.
CREATE TABLE IF NOT EXISTS audio_keywords (
  id            SERIAL PRIMARY KEY,
  word          TEXT UNIQUE NOT NULL,
  severity      TEXT NOT NULL,            -- low | medium | high | critical
  target_agency TEXT NOT NULL,
  active        BOOLEAN NOT NULL DEFAULT true
);

INSERT INTO audio_keywords (word, severity, target_agency) VALUES
  ('FIRE',      'critical', 'Fire Station (Dispatch Unit 1)'),
  ('SMOKE',     'critical', 'Fire Station (Dispatch Unit 1)'),
  ('BURNING',   'critical', 'Fire Station (Dispatch Unit 1)'),
  ('POLICE',    'critical', 'Police Department & Rapid Response'),
  ('GUNSHOT',   'critical', 'Police Department & Rapid Response'),
  ('INTRUDER',  'critical', 'Police Department & Rapid Response'),
  ('ATTACK',    'critical', 'Police Department & Rapid Response'),
  ('AMBULANCE', 'high',     'Campus Hospital & Paramedic Unit'),
  ('HOSPITAL',  'high',     'Campus Hospital & Paramedic Unit'),
  ('MEDICAL',   'high',     'Campus Hospital & Paramedic Unit'),
  ('HELP',      'high',     'Central Emergency Response & Campus Police')
ON CONFLICT (word) DO NOTHING;
