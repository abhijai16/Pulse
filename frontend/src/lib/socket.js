import { io } from 'socket.io-client';

const URL = import.meta.env.VITE_SOCKET_URL || '';

export const socket = io(URL, {
  transports: ['websocket', 'polling'],
  autoConnect: true,
});

export function joinTrackingRoom(trackingId) {
  socket.emit('tracking:join', trackingId);
}
