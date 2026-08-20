import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import { api } from '../../lib/api.js';
import { socket } from '../../lib/socket.js';
import { useGeolocation } from '../../lib/useGeolocation.js';
import { makeCategoryIcon, makeSelfIcon, categoryColor } from '../../lib/mapIcons.js';
import MapLegend from '../../components/MapLegend.jsx';

// Fallback only used if the browser denies / can't resolve geolocation.
// (Demo dataset is anchored at Mumbai coordinates.)
const FALLBACK_CENTER = [19.1340, 72.9145];

export default function RespondOps() {
  const [incidents, setIncidents] = useState([]);
  const [responders, setResponders] = useState([]);
  const [selected, setSelected] = useState(null);
  const [error, setError] = useState(null);
  const { coords: userCoords, status: geoStatus } = useGeolocation({ fallback: { lat: FALLBACK_CENTER[0], lng: FALLBACK_CENTER[1] } });
  const mapCenter = [userCoords.lat, userCoords.lng];

  // Live self-location: also subscribe to watchPosition so the green marker
  // moves as the dispatcher moves. Falls back gracefully if unavailable.
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

  async function refresh() {
    try {
      const data = await api.consolePayload();
      setIncidents(data.incidents);
      setResponders(data.responders);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    refresh();
    const onNew = () => refresh();
    const onStatus = () => refresh();
    socket.on('incident:new', onNew);
    socket.on('incident:status', onStatus);
    // FEATURE 1: AI Triage override — every console refreshes when severity changes
    const onSeverity = (p) => {
      if (!p?.id) return;
      setIncidents((prev) => prev.map((i) => (i.id === p.id ? { ...i, severity: p.severity } : i)));
      setSelected((cur) => (cur && cur.id === p.id ? { ...cur, severity: p.severity } : cur));
    };
    socket.on('incident:severity', onSeverity);
    return () => {
      socket.off('incident:new', onNew);
      socket.off('incident:status', onStatus);
      socket.off('incident:severity', onSeverity);
    };
  }, []);

  async function handleAssign(responderId) {
    if (!selected) return;
    try {
      await api.assignResponder({ incidentId: selected.id, responderId: Number(responderId) });
      await refresh();
    } catch (err) {
      alert(err.message);
    }
  }

  async function handleStatus(status) {
    if (!selected) return;
    try {
      await api.updateStatus(selected.id, status);
      await refresh();
    } catch (err) {
      alert(err.message);
    }
  }

  // FEATURE 1: AI Triage override
  async function handleOverride(severity) {
    if (!selected || !severity) return;
    try {
      const updated = await api.overrideSeverity(selected.id, severity);
      // patch local state immediately so the UI feels snappy; the socket
      // event will also fire for every other connected console.
      setIncidents((prev) =>
        prev.map((i) => (i.id === selected.id ? { ...i, severity: updated.severity } : i))
      );
      setSelected((cur) => (cur && cur.id === selected.id ? { ...cur, severity: updated.severity } : cur));
    } catch (err) {
      alert(err.message);
    }
  }

  const availableResponders = responders.filter((r) => r.status === 'available');

  return (
    <>
      <h1 className="page-title">RespondOps · Live Dispatch</h1>
      <p className="page-sub">
        {incidents.length} active incident{incidents.length !== 1 && 's'} ·{' '}
        {availableResponders.length} responder{availableResponders.length !== 1 && 's'} free
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 16 }}>
        <div className="card" style={{ padding: 0, overflow: 'hidden', height: 540, minHeight: 540 }}>
          <MapContainer
            // Stable, route-scoped key so React tears the map down + recreates
            // it when the user navigates between Report/Dispatch/Admin instead
            // of reusing a stale Leaflet instance. Including `geoStatus` makes
            // it remount when geolocation resolves so the map recenters.
            key={`respondops-map-${geoStatus}`}
            center={mapCenter}
            zoom={16}
            style={{ height: '100%', width: '100%', minHeight: 300 }}
            scrollWheelZoom
            // after the map mounts, force Leaflet to recalc its size. Without
            // this, maps initialized while their container was hidden render
            // at the wrong size (cropped tiles). The 100ms delay lets the
            // flex/grid layout settle before Leaflet measures.
            whenCreated={(map) => setTimeout(() => map.invalidateSize(), 100)}
          >
            {geoStatus === 'locating' && (
              <div
                style={{
                  position: 'absolute', inset: 0, zIndex: 1000,
                  background: 'rgba(11,18,32,0.7)',
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
            {/* Self marker — green, pulsing, live-updating. Visible whenever
                we have a location (real or fallback). */}
            {(selfPos || userCoords) && (
              <Marker
                position={[selfPos?.lat ?? userCoords.lat, selfPos?.lng ?? userCoords.lng]}
                icon={makeSelfIcon()}
                zIndexOffset={1000}
              >
                <Popup>📍 You (dispatcher)</Popup>
              </Marker>
            )}

            {/* Category-colored incident markers */}
            {incidents.map((i) => (
              <Marker
                key={i.id}
                position={[i.lat, i.lng]}
                icon={makeCategoryIcon(i.category, {
                  size: i.severity === 'critical' ? 22 : i.severity === 'high' ? 19 : 16,
                })}
                eventHandlers={{ click: () => setSelected(i) }}
              >
                <Popup>
                  <div style={{ minWidth: 160 }}>
                    <strong style={{ color: categoryColor(i.category) }}>{i.category.toUpperCase()}</strong>
                    <span style={{ marginLeft: 8 }} className={`badge ${i.severity}`}>{i.severity}</span>
                    <div style={{ marginTop: 6, fontSize: 12 }}>{i.location_label}</div>
                    <div style={{ marginTop: 4, fontSize: 12, color: 'var(--muted)' }}>{i.tracking_id}</div>
                  </div>
                </Popup>
              </Marker>
            ))}

            <MapLegend />
          </MapContainer>
        </div>

        <div>
          <div className="card">
            <h3 style={{ marginTop: 0 }}>Incidents</h3>
            <div style={{ maxHeight: 220, overflowY: 'auto' }}>
              {incidents.length === 0 && <div style={{ color: 'var(--muted)' }}>All clear.</div>}
              {incidents.map((i) => (
                <div
                  key={i.id}
                  onClick={() => setSelected(i)}
                  style={{
                    padding: 10,
                    marginBottom: 6,
                    background: selected?.id === i.id ? 'var(--surface-2)' : 'transparent',
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    cursor: 'pointer',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600, textTransform: 'capitalize' }}>{i.category}</div>
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>{i.location_label || '—'}</div>
                    {/* FEATURE 1: AI triage hint on the row */}
                    {i.ai_severity && (
                      <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                        🤖 AI: <span className={`badge ${i.ai_severity}`}>{i.ai_severity}</span>{' '}
                        <span style={{ marginLeft: 4 }}>
                          {Math.round((i.ai_confidence || 0) * 100)}%
                        </span>
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <span className={`badge ${i.severity}`}>{i.severity}</span>
                    <span className={`badge ${i.status}`}>{i.status}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {selected && (
            <div className="card" style={{ marginTop: 16 }}>
              <h3 style={{ marginTop: 0 }}>Dispatch — {selected.tracking_id}</h3>
              <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 10 }}>
                {selected.category} · {selected.location_label} · severity <strong>{selected.severity}</strong>
              </div>

              {/* FEATURE 1: AI Triage block */}
              <div style={{
                background: 'rgba(79,157,255,0.08)',
                border: '1px solid rgba(79,157,255,0.4)',
                borderRadius: 8, padding: 12, marginBottom: 14,
              }}>
                <div style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 600, marginBottom: 6 }}>
                  🤖 AI-powered triage
                </div>
                <div style={{ fontSize: 13 }}>
                  Suggested severity:{' '}
                  <span className={`badge ${selected.ai_severity || 'medium'}`}>
                    {selected.ai_severity || '—'}
                  </span>{' '}
                  <span style={{ color: 'var(--muted)', marginLeft: 6 }}>
                    confidence {Math.round((selected.ai_confidence || 0) * 100)}%
                  </span>
                </div>
                {selected.ai_reasons && selected.ai_reasons.length > 0 && (
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6 }}>
                    Matched: {selected.ai_reasons.join(', ')}
                  </div>
                )}
                <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <label style={{ margin: 0, color: 'var(--muted)', fontSize: 12 }}>Override:</label>
                  <select
                    defaultValue=""
                    onChange={(e) => handleOverride(e.target.value)}
                    style={{ width: 'auto', padding: '4px 8px', fontSize: 12 }}
                  >
                    <option value="" disabled>set…</option>
                    {['low','medium','high','critical'].map((s) => (
                      <option key={s} value={s} disabled={s === selected.severity}>{s}</option>
                    ))}
                  </select>
                  {selected.ai_severity && selected.severity !== selected.ai_severity && (
                    <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                      (overridden from {selected.ai_severity})
                    </span>
                  )}
                </div>
              </div>

              {selected.status === 'new' && (
                <div className="field">
                  <label>Assign responder</label>
                  <select onChange={(e) => e.target.value && handleAssign(e.target.value)} defaultValue="">
                    <option value="" disabled>Select responder…</option>
                    {availableResponders.map((r) => (
                      <option key={r.id} value={r.id}>{r.name} — {r.role}</option>
                    ))}
                  </select>
                </div>
              )}

              {selected.status !== 'resolved' && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {selected.status === 'dispatched' && (
                    <button onClick={() => handleStatus('on_scene')}>Mark on-scene</button>
                  )}
                  <button className="primary" onClick={() => handleStatus('resolved')}>Mark resolved</button>
                </div>
              )}

              {selected.status === 'resolved' && (
                <div style={{ color: 'var(--green)', fontSize: 13 }}>✓ Resolved.</div>
              )}
            </div>
          )}

          <div className="card" style={{ marginTop: 16 }}>
            <h3 style={{ marginTop: 0 }}>Responders</h3>
            <div style={{ fontSize: 13 }}>
              {responders.map((r) => (
                <div key={r.id} style={{
                  display: 'flex', justifyContent: 'space-between',
                  padding: '6px 0', borderBottom: '1px solid var(--border)',
                }}>
                  <span>{r.name} <span style={{ color: 'var(--muted)' }}>· {r.role}</span></span>
                  <span style={{
                    color: r.status === 'available' ? 'var(--green)'
                          : r.status === 'busy' ? 'var(--amber)'
                          : 'var(--muted)',
                  }}>{r.status}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {error && <div className="card" style={{ marginTop: 12, color: 'var(--red)' }}>{error}</div>}
    </>
  );
}
