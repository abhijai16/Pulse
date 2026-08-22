import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import http from 'node:http';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { initSocket, emitIncidentNew, emitIncidentStatus, emitIncidentSeverity, emitBroadcastAlert } from './realtime/socket.js';
import { reportingRouter } from './modules/reporting/routes.js';
import { dispatchRouter } from './modules/dispatch/routes.js';
import { analyticsRouter } from './modules/analytics/routes.js';
import { authRouter, requireAuth } from './modules/auth/routes.js';
import { communityRouter } from './modules/community/routes.js';
import { profileRouter } from './modules/profile/routes.js';
import { audioRouter } from './modules/audio/routes.js';
import { notifyNearbyVolunteers } from './modules/community/notify.js';
import { query } from './db/pool.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Apply schema.sql once on boot so the live DB always has the latest
// columns/tables. schema.sql uses CREATE TABLE IF NOT EXISTS / ADD COLUMN
// IF NOT EXISTS / CREATE INDEX IF NOT EXISTS, so it's safe to re-run on
// every start — new tables land, missing columns get added, and existing
// rows are untouched. We log loudly if migration fails so the operator
// notices; the server still starts so existing endpoints keep serving.
const SCHEMA_PATH = path.join(__dirname, 'db/schema.sql');
async function autoMigrate() {
  try {
    const sql = readFileSync(SCHEMA_PATH, 'utf8');
    await query(sql);
    console.log('[server] schema.sql applied (auto-migrate on boot)');
  } catch (err) {
    console.error('[server] auto-migrate failed:', err.message);
  }
}

const app = express();
const httpServer = http.createServer(app);

const PORT = Number(process.env.PORT || 4000);
const ORIGIN = process.env.ALLOWED_ORIGIN || 'http://localhost:5173';

app.use(cors({
  origin: ORIGIN,
  credentials: true, // let the session cookie come through from the SPA
}));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// serve uploaded incident photos
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// health
app.get('/api/health', async (_req, res) => {
  try {
    await query('SELECT 1');
    res.json({ ok: true, ts: Date.now() });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

// module routers. reporting is left open so anonymous reports work
// without login; the rest sit behind requireAuth.
app.use('/api', authRouter);
app.use('/api', reportingRouter);
// Audio Sentry: acoustic distress detection. Open (no requireAuth) so
// browser live-mic + external sensors can POST keyword triggers
// without juggling session cookies. Detection data is anonymous-by-
// design (submitReport is called with isAnonymous: true).
app.use('/api', audioRouter);
app.use('/api', requireAuth, dispatchRouter);
app.use('/api', requireAuth, analyticsRouter);
app.use('/api', requireAuth, communityRouter);
app.use('/api', requireAuth, profileRouter);

// 404 catch-all for /api
app.use('/api', (_req, res) => res.status(404).json({ error: 'not_found' }));

// keep this last
app.use((err, _req, res, _next) => {
  console.error('[api error]', err);
  res.status(err.status || 500).json({ error: err.message || 'internal_error' });
});

initSocket(httpServer, ORIGIN);

// wire up the cross-module event bus. modules fire these and we
// forward them to socket.io so the consoles update in real time.
import { onReportingEvent, onDispatchEvent, onAnalyticsEvent } from './events.js';

onReportingEvent('report:submitted', (incident) => {
  emitIncidentNew(incident);
  // fire-and-forget: a slow SMTP call must not delay the response to
  // the reporter. only triggers for medical/harassment, and only if
  // there's a verified user within 200m.
  notifyNearbyVolunteers(incident).catch((e) =>
    console.error('[community] notifyNearbyVolunteers failed', e),
  );
});

onDispatchEvent('incident:status_changed', (payload) => {
  emitIncidentStatus(payload.tracking_id, payload);
});

onDispatchEvent('incident:severity_changed', (payload) => {
  emitIncidentSeverity(payload);
});

onAnalyticsEvent('broadcast:created', (broadcast) => {
  emitBroadcastAlert(broadcast);
});

// Run auto-migrate BEFORE listen so the new columns (e.g. media_urls)
// are guaranteed to exist by the time the first request can hit /api/reports.
// On failure we still start the server — the catch in autoMigrate logs the
// error, and existing endpoints remain available so the operator can fix
// the DB without taking the API down.
(async () => {
  await autoMigrate();
  httpServer.listen(PORT, () => {
    console.log(`[pulse] api ready on :${PORT}`);
  });
})();
