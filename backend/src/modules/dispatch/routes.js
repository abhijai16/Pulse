import { Router } from 'express';
import { query } from '../../db/pool.js';
import {
  listActiveIncidents,
  listResponders,
  assignResponder,
  updateIncidentStatus,
  overrideSeverity,
} from './service.js';

export const dispatchRouter = Router();

// GET /api/incidents?status=active  — RespondOps map markers
dispatchRouter.get('/incidents', async (req, res, next) => {
  try {
    const status = req.query.status || 'active';
    res.json(await listActiveIncidents(status));
  } catch (err) {
    next(err);
  }
});

// GET /api/responders  — available roster
dispatchRouter.get('/responders', async (_req, res, next) => {
  try {
    res.json(await listResponders());
  } catch (err) {
    next(err);
  }
});

// POST /api/dispatches  — assign a responder to an incident
dispatchRouter.post('/dispatches', async (req, res, next) => {
  try {
    const { incidentId, responderId, note } = req.body || {};
    const result = await assignResponder({ incidentId, responderId, note });
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

// PATCH /api/incidents/:id/status  — dispatched | on_scene | resolved
dispatchRouter.patch('/incidents/:id/status', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { status } = req.body || {};
    const result = await updateIncidentStatus(id, status);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Convenience: combined payload for the RespondOps console (incidents + responders)
dispatchRouter.get('/console', async (_req, res, next) => {
  try {
    const [incidents, responders] = await Promise.all([
      listActiveIncidents('active'),
      listResponders(),
    ]);
    res.json({ incidents, responders });
  } catch (err) {
    next(err);
  }
});

// ====== FEATURE 1: AI Triage — dispatcher override ======
// PATCH /api/incidents/:id/severity  body: { severity: 'critical'|'high'|'medium'|'low' }
dispatchRouter.patch('/incidents/:id/severity', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { severity } = req.body || {};
    const result = await overrideSeverity(id, severity);
    res.json(result);
  } catch (err) {
    next(err);
  }
});
