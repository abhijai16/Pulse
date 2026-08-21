// Single Socket.io hub. Three event channels:
//   incident:new      — AlertNow → RespondOps map + PulseBoard tiles
//   incident:status   — RespondOps → AlertNow tracking page
//   broadcast:alert   — PulseBoard → every connected client (radius push)

import { Server } from 'socket.io';

let io = null;

export function initSocket(httpServer, allowedOrigin) {
  io = new Server(httpServer, {
    cors: { origin: allowedOrigin, methods: ['GET', 'POST'] },
  });

  io.on('connection', (socket) => {
    // A reporter can join a tracking room so they only hear their own status updates
    socket.on('tracking:join', (trackingId) => {
      if (typeof trackingId === 'string' && trackingId.length < 64) {
        socket.join(`tracking:${trackingId}`);
      }
    });
  });

  return io;
}

export function emitIncidentNew(incident) {
  io?.emit('incident:new', incident);
}

export function emitIncidentStatus(trackingId, payload) {
  io?.to(`tracking:${trackingId}`).emit('incident:status', payload);
  io?.emit('incident:status', { ...payload, tracking_id: trackingId });
}

// FEATURE 1: AI Triage — fire when a dispatcher overrides severity so every
// RespondOps console updates the badge live.
export function emitIncidentSeverity(payload) {
  io?.emit('incident:severity', payload);
}

export function emitBroadcastAlert(broadcast) {
  io?.emit('broadcast:alert', broadcast);
}

// FEATURE: Nearby-volunteer pledge — when a user taps "I'm responding"
// on the tracking page, every connected dispatcher console updates its
// "Volunteers en route" count + name list live, no refresh needed.
export function emitVolunteerJoined({ incidentId, trackingId, count, pledgers }) {
  io?.emit('incident:volunteer_joined', { incidentId, trackingId, count, pledgers });
}
