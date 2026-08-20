import { Router } from 'express';
import { buildCsv } from './export.js';
import { generatePdf } from './export.js';
import {
  getHeatmap,
  getMetrics,
  getRepeatedIncidents,
  createBroadcast,
  listBroadcasts,
  findActiveGeofencesForPoint,
} from './service.js';

export const analyticsRouter = Router();

// GET /api/analytics/heatmap
analyticsRouter.get('/analytics/heatmap', async (_req, res, next) => {
  try {
    res.json(await getHeatmap());
  } catch (err) {
    next(err);
  }
});

// GET /api/analytics/metrics
analyticsRouter.get('/analytics/metrics', async (_req, res, next) => {
  try {
    res.json(await getMetrics());
  } catch (err) {
    next(err);
  }
});

// GET /api/analytics/repeated  — clusters: same location + category ≥ 2 times
analyticsRouter.get('/analytics/repeated', async (_req, res, next) => {
  try {
    res.json(await getRepeatedIncidents());
  } catch (err) {
    next(err);
  }
});

// POST /api/broadcasts
analyticsRouter.post('/broadcasts', async (req, res, next) => {
  try {
    const { lat, lng, radiusM, message, severity } = req.body || {};
    const result = await createBroadcast({ lat, lng, radiusM, message, severity });
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

analyticsRouter.get('/broadcasts', async (_req, res, next) => {
  try {
    res.json(await listBroadcasts());
  } catch (err) {
    next(err);
  }
});

// ====== FEATURE 2: Geofence ======
// GET /api/geofences/active?lat=...&lng=... → returns broadcasts whose
// radius contains the point and are not expired.
analyticsRouter.get('/geofences/active', async (req, res, next) => {
  try {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    res.json(await findActiveGeofencesForPoint(lat, lng));
  } catch (err) {
    next(err);
  }
});

// GET /api/exports/report.csv
analyticsRouter.get('/exports/report.csv', async (_req, res, next) => {
  try {
    const csv = await buildCsv();
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="pulse-report.csv"');
    res.send(csv);
  } catch (err) {
    next(err);
  }
});

// GET /api/exports/report.pdf
analyticsRouter.get('/exports/report.pdf', async (_req, res, next) => {
  try {
    const pdfBuffer = await generatePdf();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="pulse-report.pdf"');
    res.send(pdfBuffer);
  } catch (err) {
    next(err);
  }
});
