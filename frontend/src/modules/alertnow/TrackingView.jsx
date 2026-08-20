import { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import { socket, joinTrackingRoom } from '../../lib/socket.js';
import GeofenceBanner from './GeofenceBanner.jsx';

const STATUS_FLOW = ['new', 'dispatched', 'on_scene', 'resolved'];

export default function TrackingView({ trackingId, onReset }) {
  const [incident, setIncident] = useState(null);
  const [liveUpdate, setLiveUpdate] = useState(null);
  const [error, setError] = useState(null);

  async function load() {
    try {
      setIncident(await api.getReport(trackingId));
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    load();
    joinTrackingRoom(trackingId);
    const handler = (payload) => {
      if (payload.tracking_id === trackingId) {
        setLiveUpdate(payload);
        load();
      }
    };
    socket.on('incident:status', handler);
    return () => socket.off('incident:status', handler);
  }, [trackingId]);

  if (error) {
    return (
      <div className="card">
        <p style={{ color: 'var(--red)' }}>{error}</p>
        <button onClick={onReset}>Submit another report</button>
      </div>
    );
  }
  if (!incident) return <div className="card">Loading…</div>;

  const stepIdx = STATUS_FLOW.indexOf(incident.status);

  return (
    <>
      {/* FEATURE 2: Geofence banner — also shown on the tracking page */}
      <GeofenceBanner coords={{ lat: incident.lat, lng: incident.lng }} />
      <div className="card" style={{ maxWidth: 560 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ color: 'var(--muted)', fontSize: 12 }}>Tracking ID</div>
          <div style={{ fontFamily: 'monospace', fontSize: 18 }}>{incident.tracking_id}</div>
        </div>
        <span className={`badge ${incident.severity}`}>{incident.severity}</span>
      </div>

      {liveUpdate && (
        <div style={{
          marginTop: 12, padding: 10, background: 'rgba(79,157,255,0.1)',
          border: '1px solid var(--accent)', borderRadius: 8, fontSize: 13,
        }}>
          🔔 Live update: status is now <strong>{liveUpdate.status}</strong>
        </div>
      )}

      <div style={{ marginTop: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
          {STATUS_FLOW.map((s, i) => (
            <div key={s} style={{
              fontSize: 11, textTransform: 'uppercase',
              color: i <= stepIdx ? 'var(--accent)' : 'var(--muted)',
              fontWeight: i === stepIdx ? 700 : 400,
            }}>
              {s.replace('_', ' ')}
            </div>
          ))}
        </div>
        <div style={{
          height: 6, background: 'var(--surface-2)', borderRadius: 3, overflow: 'hidden',
        }}>
          <div style={{
            width: `${((stepIdx + 1) / STATUS_FLOW.length) * 100}%`,
            height: '100%', background: 'var(--accent)',
            transition: 'width 0.4s',
          }} />
        </div>
      </div>

      <div style={{ marginTop: 20, fontSize: 13, color: 'var(--muted)' }}>
        Category: <strong style={{ color: 'var(--text)' }}>{incident.category}</strong><br />
        Submitted: {new Date(incident.created_at).toLocaleString()}<br />
        {incident.location_label && <>Location: {incident.location_label}</>}
      </div>

      <button onClick={onReset} style={{ marginTop: 20 }}>Submit another report</button>
    </div>
    </>
  );
}
