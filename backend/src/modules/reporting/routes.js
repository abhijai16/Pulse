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

// Multer setup for the AlertNow report attachments.
//   - destination: backend/uploads/ (created above if missing).
//   - filename:    `<timestamp>-<safe-original>`. The unsafe regex
//     strips path separators + control chars so a malicious filename
//     can't escape the uploads directory.
//   - limits:      4 files × 25 MB. Photos are tiny; the headroom is
//     there for short video clips (CCTV-style 5–10 s evidence). The
//     per-file ceiling of 25 MB prevents single-movie uploads from
//     eating the disk during a campus incident spike.
const MAX_FILES = 4;
const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (_req, file, cb) => {
      const safe = file.originalname.replace(/[^\w.-]/g, '_');
      cb(null, `${Date.now()}-${safe}`);
    },
  }),
  limits: {
    fileSize: 25 * 1024 * 1024,  // 25 MB per file
    files: MAX_FILES,
  },
  fileFilter: (_req, file, cb) => {
    // accept images and short video clips only. block anything else
    // (executables, archives) at the boundary, before it hits disk.
    if (/^image\//.test(file.mimetype) || /^video\//.test(file.mimetype)) {
      return cb(null, true);
    }
    cb(new Error('only image/* or video/* attachments are accepted'));
  },
});

export const reportingRouter = Router();

// POST /api/reports — citizen submits an incident (attachments optional).
// Accepts up to MAX_FILES under the 'media' field name. The legacy
// 'photo' single-file field is still accepted for backward compatibility
// with any older client / curl invocation; new clients should use 'media'.
const legacyPhoto = upload.single('photo');
const multiMedia  = upload.array('media', MAX_FILES);
function parseReportFiles(req, res, next) {
  // Try the new multi-file field first; if it's absent, fall through to
  // the legacy single-photo field so existing tools keep working.
  multiMedia(req, res, (err) => {
    if (!err) return next();
    if (err && err.code === 'LIMIT_UNEXPECTED_FILE') {
      // no 'media' field — try the legacy 'photo' field instead.
      return legacyPhoto(req, res, next);
    }
    next(err);
  });
}
reportingRouter.post('/reports', parseReportFiles, async (req, res, next) => {
  try {
    const body = req.body || {};
    const files = Array.isArray(req.files) && req.files.length > 0
      ? req.files
      : (req.file ? [req.file] : []);
    const mediaUrls = files.map((f) => `/uploads/${f.filename}`);
    const photoUrl  = mediaUrls[0] || null;
    const result = await submitReport({
      category: body.category,
      description: body.description,
      photoUrl,
      mediaUrls,
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

// GET /api/reports/:trackingId — reporter checks status
reportingRouter.get('/reports/:trackingId', async (req, res, next) => {
  try {
    const incident = await getByTrackingId(req.params.trackingId);
    if (!incident) return res.status(404).json({ error: 'not_found' });
    res.json(incident);
  } catch (err) {
    next(err);
  }
});

// GET /api/reports — recent submissions (used by the landing ticker)
reportingRouter.get('/reports', async (_req, res, next) => {
  try {
    res.json(await listRecent(10));
  } catch (err) {
    next(err);
  }
});

// public mirror of the dispatch router's nearby endpoint so the
// "Nearest responders" panel works for anonymous reporters too. same
// SQL, same shape.
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
