// Lightweight "tell the backend where the user is" hook. Runs in the
// background while the SPA is open; pushes the latest lat/lng to
// /api/auth/me/location so the 200m radius query can find this user
// when a nearby medical/harassment incident lands.
//
// Design notes:
// - We only PUT once per 60s and only when the position moved by
//   ≥ 25m, to avoid spamming the API on a stationary device.
// - Mounted once at the App root (next to BroadcastListener) so every
//   logged-in user is "visible" regardless of which page they land on.
// - No-ops if the user isn't logged in — `api.reportLocation` will
//   401 and we just swallow it.
import { useEffect, useRef } from 'react';
import { useAuth } from './useAuth.jsx';
import { api } from './api.js';

const MIN_REPORT_MS = 60_000;       // throttle window
const MIN_DISTANCE_M = 25;          // don't re-report if the user barely moved
const FALLBACK_CENTER = { lat: 19.1340, lng: 72.9145 }; // matches RespondOps fallback

function haversineM(a, b) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export function useReportLocation() {
  const { user } = useAuth();
  const lastSent = useRef({ at: 0, pos: null });

  useEffect(() => {
    // Only run when we have a session. The effect re-runs when `user`
    // changes (login/logout), so logging out tears the watcher down.
    if (!user || !navigator.geolocation) return;

    let cancelled = false;
    const report = (pos) => {
      const next = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      const prev = lastSent.current.pos;
      const now = Date.now();
      if (prev && haversineM(prev, next) < MIN_DISTANCE_M) return;
      if (now - lastSent.current.at < MIN_REPORT_MS) return;
      lastSent.current = { at: now, pos: next };
      api.reportLocation(next.lat, next.lng).catch(() => { /* 401 etc. — ignore */ });
    };

    // First reading: best-effort, doesn't matter if it fails.
    navigator.geolocation.getCurrentPosition(report, () => {}, {
      enableHighAccuracy: true, timeout: 6000, maximumAge: 60000,
    });
    const id = navigator.geolocation.watchPosition(report, () => {}, {
      enableHighAccuracy: true, maximumAge: 30000, timeout: 30000,
    });
    return () => {
      cancelled = true;
      navigator.geolocation.clearWatch(id);
      // `cancelled` is for the rare race where the component unmounts
      // while a callback is in-flight; nothing else to clean up.
      void cancelled;
    };
  }, [user]);
}

// Exposed for the demo button on the auth page if we ever want a
// "use my approximate location" affordance. Not used today — the
// browser prompt is the only entry point.
export const FALLBACK_LOCATION = FALLBACK_CENTER;
