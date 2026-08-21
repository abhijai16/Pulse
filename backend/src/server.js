import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { initSocket, emitIncidentNew, emitIncidentStatus, emitIncidentSeverity, emitBroadcastAlert } from './realtime/socket.js';
import { reportingRouter } from './modules/reporting/routes.js';
import { dispatchRouter } from './modules/dispatch/routes.js';
import { analyticsRouter } from './modules/analytics/routes.js';
import { authRouter, requireAuth } from './modules/auth/routes.js';
import { query } from './db/pool.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = http.createServer(app);

const PORT = Number(process.env.PORT || 4000);
const ORIGIN = process.env.ALLOWED_ORIGIN || 'http://localhost:5173';

app.use(cors({
  origin: ORIGIN,
  credentials: true, // allow the session cookie to round-trip from the SPA
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

// Module routers — each is fully self-contained.
// AlertNow (reporting) stays public so anonymous reporting still works.
// RespondOps (dispatch) and PulseBoard (analytics) require login.
app.use('/api', authRouter);
app.use('/api', reportingRouter);
app.use('/api', requireAuth, dispatchRouter);
app.use('/api', requireAuth, analyticsRouter);

// 404
app.use('/api', (_req, res) => res.status(404).json({ error: 'not_found' }));

// Error handler — keep last
app.use((err, _req, res, _next) => {
  console.error('[api error]', err);
  res.status(err.status || 500).json({ error: err.message || 'internal_error' });
});

initSocket(httpServer, ORIGIN);

// Cross-module event fan-out: AlertNow reports → RespondOps listens
// Done as a tiny event bus the modules themselves emit to.
import { onReportingEvent, onDispatchEvent, onAnalyticsEvent } from './events.js';

onReportingEvent('report:submitted', (incident) => {
  emitIncidentNew(incident);
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

httpServer.listen(PORT, () => {
  console.log(`[pulse] api ready on :${PORT}`);
});
