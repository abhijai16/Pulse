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
