// single socket.io hub. channels we fire:
//   incident:new       AlertNow -> RespondOps map + PulseBoard tiles
//   incident:status    RespondOps -> AlertNow tracking page
//   incident:severity  dispatcher override -> every RespondOps console
//   broadcast:alert    PulseBoard -> every connected client (radius push)

import { Server } from 'socket.io';

let io = null;

export function initSocket(httpServer, allowedOrigin) {
  io = new Server(httpServer, {
    cors: { origin: allowedOrigin, methods: ['GET', 'POST'] },
  });

  io.on('connection', (socket) => {
    // reporter joins their own tracking room so they only see their
    // own status updates
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

// fires when a dispatcher overrides AI-suggested severity. every
// RespondOps console listens and updates its badge live.
export function emitIncidentSeverity(payload) {
  io?.emit('incident:severity', payload);
}

export function emitBroadcastAlert(broadcast) {
  io?.emit('broadcast:alert', broadcast);
}

// fired when a user taps "I'm responding" on the tracking page.
// dispatch consoles use it to bump the "volunteers en route" counter
// without a refresh.
export function emitVolunteerJoined({ incidentId, trackingId, count, pledgers }) {
  io?.emit('incident:volunteer_joined', { incidentId, trackingId, count, pledgers });
}
