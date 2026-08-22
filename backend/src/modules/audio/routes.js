import { Router } from 'express';
import { processDetection, listRecentEvents, countSince } from './service.js';

// Audio router. Mounted OPEN (no requireAuth) so:
//   - the live mic in the browser can POST keyword triggers without
//     a session cookie
//   - external sensors (Raspberry Pi / ESP32 / CCTV pre-processor)
//     can POST without juggling session tokens
// All detection data is anonymous-by-design (submitReport is called
// with isAnonymous: true). Auth is not the threat model here; rate
// limiting at the gateway / reverse proxy is.
export const audioRouter = Router();

// POST /api/audio/voice-detect — live microphone trigger.
// Body: { detectedKeyword, confidenceScore, audioLevelDb,
//         sensorLocation, rawTranscript }
audioRouter.post('/audio/voice-detect', async (req, res, next) => {
  try {
    const result = await processDetection({
      ...req.body,
      source: 'LIVE_MICROPHONE',
    });
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

// POST /api/audio/simulate — manual trigger from the dispatch console
// or the Audio Sentry page. Same pipeline as the live mic; differs
// only by `source` so PulseBoard can split them in stats later if it
// wants to.
audioRouter.post('/audio/simulate', async (req, res, next) => {
  try {
    const result = await processDetection({
      ...req.body,
      source: 'SIMULATION',
    });
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

// GET /api/audio/events — recent detection log for the Audio Sentry
// right-rail. Public, no auth, returns the latest N events.
audioRouter.get('/audio/events', async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 8, 1), 50);
    res.json(await listRecentEvents(limit));
  } catch (err) {
    next(err);
  }
});

// GET /api/audio/stats — 24-hour counter for the PulseBoard KPI tile.
audioRouter.get('/audio/stats', async (_req, res, next) => {
  try {
    const last24h = await countSince(24);
    res.json({ last24h });
  } catch (err) {
    next(err);
  }
});
