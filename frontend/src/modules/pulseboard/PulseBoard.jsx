import { useEffect, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from 'recharts';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import { api } from '../../lib/api.js';
import { socket } from '../../lib/socket.js';
import { useGeolocation } from '../../lib/useGeolocation.js';
import { makeCategoryIcon, makeSelfIcon } from '../../lib/mapIcons.js';
import MapLegend from '../../components/MapLegend.jsx';

const PIE_COLORS = ['#ff4d4d', '#ff7a45', '#f5a623', '#2ecc71'];
// Fallback only used if the browser denies / can't resolve geolocation.
const FALLBACK_CENTER = [19.1340, 72.9145];

export default function PulseBoard() {
  const [metrics, setMetrics] = useState(null);
  const [heatmap, setHeatmap] = useState([]);
  const [repeated, setRepeated] = useState([]);
  const [broadcasts, setBroadcasts] = useState([]);
  const { coords: userCoords, status: geoStatus } = useGeolocation({
    fallback: { lat: FALLBACK_CENTER[0], lng: FALLBACK_CENTER[1] },
  });
  const mapCenter = [userCoords.lat, userCoords.lng];

  // Live self-location for the green "you are here" marker.
  const [selfPos, setSelfPos] = useState(null);
  useEffect(() => {
    if (!navigator.geolocation) return;
    const id = navigator.geolocation.watchPosition(
      (pos) => setSelfPos({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {},
      { enableHighAccuracy: true, maximumAge: 30000, timeout: 30000 }
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  const [broadcastForm, setBroadcastForm] = useState({
    lat: FALLBACK_CENTER[0], lng: FALLBACK_CENTER[1], radiusM: 500, message: '',
    severity: 'high', durationMinutes: 30,
  });
  const [sending, setSending] = useState(false);

  async function refresh() {
    const [m, h, r, b] = await Promise.all([
      api.metrics(), api.heatmap(), api.repeated(), api.listBroadcasts(),
    ]);
    setMetrics(m);
    setHeatmap(h);
    setRepeated(r);
    setBroadcasts(b);
  }

  useEffect(() => {
    refresh();
    socket.on('broadcast:alert', () => refresh());
    return () => socket.off('broadcast:alert');
  }, []);

  async function sendBroadcast(e) {
    e.preventDefault();
    setSending(true);
    try {
      await api.createBroadcast({
        ...broadcastForm,
        lat: Number(broadcastForm.lat),
        lng: Number(broadcastForm.lng),
        radiusM: Number(broadcastForm.radiusM),
        durationMinutes: Number(broadcastForm.durationMinutes),
      });
      setBroadcastForm({ ...broadcastForm, message: '' });
      await refresh();
    } finally {
      setSending(false);
    }
  }

  if (!metrics) return <div className="card">Loading analytics…</div>;

  return (
    <>
      <h1 className="page-title">PulseBoard · Campus Safety Analytics</h1>
      <p className="page-sub">
        {metrics.total_incidents} total · {metrics.active_incidents} active · avg response{' '}
        <strong>{Math.round(metrics.avg_response_minutes)} min</strong>
      </p>

      <div className="grid cols-4" style={{ marginBottom: 16 }}>
        <Stat label="Total incidents" v={metrics.total_incidents} />
        <Stat label="Active" v={metrics.active_incidents} />
        <Stat label="Avg response (min)" v={Math.round(metrics.avg_response_minutes)} />
        <Stat label="Peer assists (month)" v={metrics.peer_assists_this_month} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 16 }}>
        <div className="card" style={{ padding: 0, overflow: 'hidden', height: 380, minHeight: 380, position: 'relative' }}>
          <MapContainer
            // Re-create when geolocation resolves so the map recenters on the user
            key={`pulseboard-map-${geoStatus}`}
            center={mapCenter}
            zoom={16}
            style={{ height: '100%', width: '100%', minHeight: 300 }}
            scrollWheelZoom
            whenCreated={(map) => setTimeout(() => map.invalidateSize(), 100)}
          >
            {geoStatus === 'locating' && (
              <div
                style={{
                  position: 'absolute', inset: 0, zIndex: 1000,
                  background: 'rgba(22,22,22,0.7)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'var(--text)', fontSize: 14,
                  backdropFilter: 'blur(2px)',
                }}
              >
                📍 Getting your location…
              </div>
            )}
            <TileLayer
              attribution='&copy; OpenStreetMap'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            {/* Self marker — green, pulsing, live-updating */}
            {(selfPos || userCoords) && (
              <Marker
                position={[selfPos?.lat ?? userCoords.lat, selfPos?.lng ?? userCoords.lng]}
                icon={makeSelfIcon()}
                zIndexOffset={1000}
              >
                <Popup>📍 You (admin)</Popup>
              </Marker>
            )}

            {/* Category-colored heatmap dots */}
            {heatmap.map((p) => (
              <Marker
                key={p.id}
                position={[p.lat, p.lng]}
                icon={makeCategoryIcon(p.category, { size: 14 })}
              />
            ))}

            <MapLegend />
          </MapContainer>
        </div>

        <div className="card">
          <h3 style={{ marginTop: 0 }}>By category</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={metrics.by_category}>
              <XAxis dataKey="category" stroke="#8a99b4" />
              <YAxis stroke="#8a99b4" allowDecimals={false} />
              <Tooltip
                contentStyle={{ background: '#1a1a1a', border: '1px solid #2a2a2e' }}
                labelStyle={{ color: '#ededee' }}
              />
              <Bar dataKey="n" fill="#5eb1ff" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>

          <h3>By severity</h3>
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie data={metrics.by_severity} dataKey="n" nameKey="severity" outerRadius={60} label>
                {metrics.by_severity.map((_entry, idx) => (
                  <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Legend wrapperStyle={{ color: '#8a99b4', fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h3 style={{ marginTop: 0 }}>🔁 Repeated-incident clusters</h3>
        {repeated.length === 0 ? (
          <div style={{ color: 'var(--muted)' }}>No repeated incidents detected.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ color: 'var(--muted)', textAlign: 'left' }}>
                <th>Location</th><th>Category</th><th>Count</th><th>Last seen</th>
              </tr>
            </thead>
            <tbody>
              {repeated.map((r, i) => (
                <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '8px 0' }}>{r.location_label || `${r.lat_r}, ${r.lng_r}`}</td>
                  <td style={{ textTransform: 'capitalize' }}>{r.category}</td>
                  <td><strong>{r.occurrences}</strong></td>
                  <td style={{ color: 'var(--muted)' }}>{new Date(r.last_seen).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 16 }}>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>📢 Broadcast alert</h3>
          <p style={{ color: 'var(--muted)', fontSize: 13 }}>
            Pushes a banner to every connected client within the radius.
          </p>
          <form onSubmit={sendBroadcast}>
            <div className="field">
              <label>Message</label>
              <input
                required
                value={broadcastForm.message}
                onChange={(e) => setBroadcastForm({ ...broadcastForm, message: e.target.value })}
                placeholder="Avoid Block C — active gas leak"
              />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div className="field">
                <label>Lat</label>
                <input
                  type="number" step="any"
                  value={broadcastForm.lat}
                  onChange={(e) => setBroadcastForm({ ...broadcastForm, lat: e.target.value })}
                />
              </div>
              <div className="field">
                <label>Lng</label>
                <input
                  type="number" step="any"
                  value={broadcastForm.lng}
                  onChange={(e) => setBroadcastForm({ ...broadcastForm, lng: e.target.value })}
                />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div className="field">
                <label>Radius (m)</label>
                <input
                  type="number" min="50" max="5000"
                  value={broadcastForm.radiusM}
                  onChange={(e) => setBroadcastForm({ ...broadcastForm, radiusM: e.target.value })}
                />
              </div>
              <div className="field">
                <label>Severity</label>
                <select
                  value={broadcastForm.severity}
                  onChange={(e) => setBroadcastForm({ ...broadcastForm, severity: e.target.value })}
                >
                  <option value="low">low</option>
                  <option value="medium">medium</option>
                  <option value="high">high</option>
                  <option value="critical">critical</option>
                </select>
              </div>
            </div>
            {/* FEATURE 2: Geofence duration */}
            <div className="field">
              <label>Geofence duration (minutes — how long the zone stays active)</label>
              <input
                type="number" min="1" max="1440"
                value={broadcastForm.durationMinutes}
                onChange={(e) => setBroadcastForm({ ...broadcastForm, durationMinutes: e.target.value })}
              />
            </div>
            <button type="submit" className="danger" disabled={sending} style={{ width: '100%', padding: 12 }}>
              {sending ? 'Sending…' : 'Push broadcast now'}
            </button>
          </form>
        </div>

        <div className="card">
          <h3 style={{ marginTop: 0 }}>Recent broadcasts</h3>
          {broadcasts.length === 0 ? (
            <div style={{ color: 'var(--muted)' }}>None yet.</div>
          ) : (
            <div style={{ fontSize: 13, maxHeight: 240, overflowY: 'auto' }}>
              {broadcasts.map((b) => {
                const expired = b.active_until && new Date(b.active_until) < new Date();
                return (
                  <div key={b.id} style={{
                    padding: '8px 0', borderBottom: '1px solid var(--border)',
                    opacity: expired ? 0.5 : 1,
                  }}>
                    <span className={`badge ${b.severity}`}>{b.severity}</span>{' '}
                    <strong>{b.message}</strong>
                    {expired && <span style={{ marginLeft: 6, fontSize: 11, color: 'var(--muted)' }}>expired</span>}
                    <div style={{ color: 'var(--muted)', fontSize: 12, marginTop: 2 }}>
                      {b.radius_m}m · {new Date(b.created_at).toLocaleString()}
                      {b.active_until && ` · active until ${new Date(b.active_until).toLocaleTimeString()}`}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h3 style={{ marginTop: 0 }}>Export for admin review</h3>
        <p style={{ color: 'var(--muted)', fontSize: 13 }}>
          Downloads a snapshot of all incidents with response times.
        </p>
        <div style={{ display: 'flex', gap: 10 }}>
          <a href={api.csvUrl()} download><button className="primary">⬇ Download CSV</button></a>
          <a href={api.pdfUrl()} download><button>⬇ Download PDF</button></a>
        </div>
      </div>
    </>
  );
}

function Stat({ v, label }) {
  return (
    <div className="stat">
      <div className="v">{v}</div>
      <div className="l">{label}</div>
    </div>
  );
}
