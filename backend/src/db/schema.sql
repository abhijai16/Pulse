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
