import { useEffect, useState, useRef } from 'react';
import { api } from '../../lib/api.js';
import { socket } from '../../lib/socket.js';

// FEATURE 2: Geofence banner.
// Shows a persistent warning when the browser's GPS falls inside an active
// broadcast geofence. Two refresh paths:
//   (a) poll /api/geofences/active whenever our coords change (initial
//       detect + manual "Refresh location"), AND every 30s as a safety net;
//   (b) react instantly to the existing broadcast:alert socket event (push
//       from PulseBoard), then re-verify with the API to filter out zones
//       we're not actually inside.
export default function GeofenceBanner({ coords }) {
  const [zones, setZones] = useState([]); // active zones that contain our point
  const [seen, setSeen] = useState(new Set()); // dismissed in this session
  const lastQueryRef = useRef(null);

  async function check() {
    if (!coords) return;
    const key = `${coords.lat.toFixed(5)},${coords.lng.toFixed(5)}`;
    if (lastQueryRef.current === key) return;
    lastQueryRef.current = key;
    try {
      const inside = await api.activeGeofences(coords.lat, coords.lng);
      setZones(inside);
    } catch {
      // silent — banner is best-effort
    }
  }

  // Re-check when coords change
  useEffect(() => { check(); }, [coords?.lat, coords?.lng]);

  // Background poll every 30s in case a zone was created elsewhere
  useEffect(() => {
    const t = setInterval(check, 30000);
    return () => clearInterval(t);
  }, [coords]);

  // React to push: re-check immediately so we pick up zones we might be inside
  useEffect(() => {
    const handler = () => check();
    socket.on('broadcast:alert', handler);
    return () => socket.off('broadcast:alert', handler);
  }, [coords]);

  if (!coords || zones.length === 0) return null;
  const visible = zones.filter((z) => !seen.has(z.id));
  if (visible.length === 0) return null;

  return (
    <div style={{
      background: 'var(--critical)',
      color: 'white',
      padding: '14px 18px',
      borderRadius: 10,
      marginBottom: 16,
      boxShadow: 'var(--shadow)',
      maxWidth: 560,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, marginBottom: 6 }}>
        📍 You are in an active alert zone
      </div>
      {visible.map((z) => (
        <div key={z.id} style={{
          display: 'flex', alignItems: 'flex-start', gap: 10,
          background: 'rgba(0,0,0,0.18)', padding: 10, borderRadius: 8, marginTop: 6,
        }}>
          <span className={`badge ${z.severity}`}>{z.severity}</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600 }}>{z.message}</div>
            <div style={{ fontSize: 12, opacity: 0.85, marginTop: 2 }}>
              within {z.radius_m}m
              {z.active_until && ` · until ${new Date(z.active_until).toLocaleTimeString()}`}
            </div>
          </div>
          <button
            onClick={() => setSeen((prev) => new Set(prev).add(z.id))}
            style={{ background: 'rgba(0,0,0,0.3)', borderColor: 'transparent', color: 'white' }}
            title="Dismiss for this session"
          >✕</button>
        </div>
      ))}
    </div>
  );
}
