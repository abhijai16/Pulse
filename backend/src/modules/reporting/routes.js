import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { submitReport, getByTrackingId, listRecent } from './service.js';
import { listNearbyResponders } from '../dispatch/service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const UPLOAD_DIR = path.join(__dirname, '../../../uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (_req, file, cb) => {
      const safe = file.originalname.replace(/[^\w.-]/g, '_');
      cb(null, `${Date.now()}-${safe}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
});

export const reportingRouter = Router();

// POST /api/reports  — citizen submits an incident (with optional photo)
reportingRouter.post('/reports', upload.single('photo'), async (req, res, next) => {
  try {
    const body = req.body || {};
    const photoUrl = req.file ? `/uploads/${req.file.filename}` : null;
    const result = await submitReport({
      category: body.category,
      description: body.description,
      photoUrl,
      lat: body.lat ? Number(body.lat) : null,
      lng: body.lng ? Number(body.lng) : null,
      locationLabel: body.locationLabel || null,
      isAnonymous: body.isAnonymous === 'true' || body.isAnonymous === true,
    });
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

// GET /api/reports/:trackingId  — reporter checks status
reportingRouter.get('/reports/:trackingId', async (req, res, next) => {
  try {
    const incident = await getByTrackingId(req.params.trackingId);
    if (!incident) return res.status(404).json({ error: 'not_found' });
    res.json(incident);
  } catch (err) {
    next(err);
  }
});

// GET /api/reports  — recent submissions (used by landing page ticker)
reportingRouter.get('/reports', async (_req, res, next) => {
  try {
    res.json(await listRecent(10));
  } catch (err) {
    next(err);
  }
});

// GET /api/responders/nearby?lat=&lng=&limit=  — public mirror of the
// dispatch router's nearby endpoint so the AlertNow "Nearest responders"
// panel works for unauthenticated reporters too. Same SQL, same shape.
reportingRouter.get('/responders/nearby', async (req, res, next) => {
  try {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    const limit = Math.min(Math.max(Number(req.query.limit) || 3, 1), 10);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return res.status(400).json({ error: 'lat and lng required' });
    }
    res.json(await listNearbyResponders({ lat, lng, limit }));
  } catch (err) {
    next(err);
  }
});
