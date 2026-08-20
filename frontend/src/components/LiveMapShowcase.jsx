import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import { api } from '../lib/api.js';
import { socket } from '../lib/socket.js';
import { useGeolocation } from '../lib/useGeolocation.js';
import { makeCategoryIcon, makeSelfIcon, categoryColor } from '../lib/mapIcons.js';
import MapLegend from './MapLegend.jsx';

// Default center: Bhubaneswar (where the seed data is anchored).
// The live map will recenter to the user's actual GPS once it resolves.
const BHUBANESWAR_CENTER = [20.2961, 85.8245];

export default function LiveMapShowcase() {
  const [incidents, setIncidents] = useState([]);
  const [selfPos, setSelfPos] = useState(null);
  const { coords: userCoords, status: geoStatus } = useGeolocation({
    fallback: { lat: BHUBANESWAR_CENTER[0], lng: BHUBANESWAR_CENTER[1] },
  });

  // Always center on Bhubaneswar for the showcase, but the green self-marker
  // follows the user's actual location when we can get it.
  const mapCenter = BHUBANESWAR_CENTER;

  // Initial fetch + live updates
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        // The heatmap endpoint returns last-30-days incidents with lat/lng —
        // perfect for a "real data on a real map" showcase without needing
        // server-side filtering.
        const data = await api.heatmap();
        if (!cancelled) setIncidents(Array.isArray(data) ? data : []);
      } catch (err) {
        // Silent fail — the showcase card just shows an empty map.
      }
    }
    load();
    const onNew = () => load();
    socket.on('incident:new', onNew);
    socket.on('incident:status', onNew);
    return () => {
      cancelled = true;
      socket.off('incident:new', onNew);
      socket.off('incident:status', onNew);
    };
  }, []);

  // Watch position for the green self marker (optional polish)
  useEffect(() => {
    if (!navigator.geolocation) return;
    const id = navigator.geolocation.watchPosition(
      (pos) => setSelfPos({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {},
      { enableHighAccuracy: false, maximumAge: 60000, timeout: 30000 }
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  return (
    <div style={{ position: 'relative', height: '100%', width: '100%' }}>
      <MapContainer
        key={`live-map-${geoStatus}`}
        center={mapCenter}
        zoom={14}
        style={{ height: '100%', width: '100%', minHeight: 360, borderRadius: 14 }}
        scrollWheelZoom={false}
        whenCreated={(map) => setTimeout(() => map.invalidateSize(), 100)}
      >
        <TileLayer
          attribution='&copy; OpenStreetMap'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {/* Self marker — only shown if we successfully resolved a real
            location. Skipped entirely if browser denies geolocation. */}
        {(selfPos || (geoStatus === 'ready' && userCoords)) && (
          <Marker
            position={[
              selfPos?.lat ?? userCoords.lat,
              selfPos?.lng ?? userCoords.lng,
            ]}
            icon={makeSelfIcon()}
            zIndexOffset={1000}
          >
            <Popup>📍 You</Popup>
          </Marker>
        )}

        {incidents.map((i) => (
          <Marker
            key={i.id}
            position={[i.lat, i.lng]}
            icon={makeCategoryIcon(i.category, {
              size: i.severity === 'critical' ? 20 : i.severity === 'high' ? 17 : 14,
            })}
          >
            <Popup>
              <div style={{ minWidth: 140 }}>
                <strong style={{ color: categoryColor(i.category), textTransform: 'capitalize' }}>
                  {i.category}
                </strong>
                <span style={{ marginLeft: 8 }} className={`badge ${i.severity}`}>
                  {i.severity}
                </span>
                <div style={{ marginTop: 4, fontSize: 12 }}>{i.location_label || '—'}</div>
                <div style={{ marginTop: 2, fontSize: 11, color: 'var(--muted)' }}>
                  {i.tracking_id}
                </div>
              </div>
            </Popup>
          </Marker>
        ))}

        <MapLegend />
      </MapContainer>

      {/* Live overlay badge top-right */}
      <div className="llive-overlay">
        <span className="llive-overlay-dot" />
        {incidents.length} incidents · last 30 days
      </div>
    </div>
  );
}