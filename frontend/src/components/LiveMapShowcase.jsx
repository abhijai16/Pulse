import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api.js';
import { socket } from '../lib/socket.js';
import { useGeolocation } from '../lib/useGeolocation.js';
import { categoryColor, CATEGORIES } from '../lib/mapIcons.js';
import MapLegend from './MapLegend.jsx';

// Static SVG map — replaces the Leaflet MapContainer that used to live
// here. The previous version pulled in ~150KB of Leaflet JS + a tile-server
// roundtrip for what is fundamentally a "data viz on a map background" card.
//
// This version:
//   - uses NO Leaflet / tile-server (the homepage now ships zero map-lib JS)
//   - renders an inline SVG of the OSM-style street grid as the "map"
//   - projects real incident lat/lng → SVG coordinates so the pins still
//     reflect real data, updated over Socket.io the same way as before
//   - centers on the user's actual location (with a Delhi fallback) so
//     the card stays relevant for any campus in India
//
// The component is intentionally dumb: take incidents + a center, project,
// draw. No interaction, no pan/zoom — purely decorative + informational.

const INDIA_FALLBACK = [28.6139, 77.2090];
// Render box. Matches the 460px-tall card on desktop / 360px on mobile so the
// projection math stays simple regardless of layout.
const VIEW_W = 1000;
const VIEW_H = 500;

// Visual scale: how many "degrees" of lat/lng fit across the viewport.
// Tuned so a campus-sized area (~3 km ≈ 0.027°) fills most of the card.
const DEG_LAT_SPAN = 0.04;
const DEG_LNG_SPAN = DEG_LAT_SPAN * (VIEW_W / VIEW_H); // preserve aspect

export default function LiveMapShowcase() {
  const [incidents, setIncidents] = useState([]);
  const [selfPos, setSelfPos] = useState(null);
  const { coords: userCoords, status: geoStatus } = useGeolocation({
    fallback: { lat: INDIA_FALLBACK[0], lng: INDIA_FALLBACK[1] },
  });

  // Initial fetch + live updates
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const data = await api.heatmap();
        if (!cancelled) setIncidents(Array.isArray(data) ? data : []);
      } catch (err) {
        // Silent fail — the card just shows an empty map.
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

  // Watch position for the green self marker
  useEffect(() => {
    if (!navigator.geolocation) return;
    const id = navigator.geolocation.watchPosition(
      (pos) => setSelfPos({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {},
      { enableHighAccuracy: false, maximumAge: 60000, timeout: 30000 }
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  // Choose center: user's GPS once ready, otherwise the user's most recent
  // pin (so the map always has SOMETHING to focus on), otherwise Delhi.
  const center = useMemo(() => {
    if (selfPos) return [selfPos.lat, selfPos.lng];
    if (userCoords) return [userCoords.lat, userCoords.lng];
    if (incidents.length > 0) {
      const avgLat = incidents.reduce((s, i) => s + (i.lat || 0), 0) / incidents.length;
      const avgLng = incidents.reduce((s, i) => s + (i.lng || 0), 0) / incidents.length;
      return [avgLat, avgLng];
    }
    return INDIA_FALLBACK;
  }, [selfPos, userCoords, incidents]);

  // Project incidents → SVG coordinates. Lat shrinks cos(lat) for accurate
  // longitude spacing at non-equator latitudes, but for a 0.04° view this
  // approximation is fine.
  const projected = useMemo(() => {
    const [clat, clng] = center;
    return incidents
      .filter((i) => Number.isFinite(i.lat) && Number.isFinite(i.lng))
      .map((i) => {
        const x = ((i.lng - clng) / DEG_LNG_SPAN + 0.5) * VIEW_W;
        const y = ((clat - i.lat) / DEG_LAT_SPAN + 0.5) * VIEW_H;
        return { ...i, x, y };
      })
      .filter((p) => p.x >= -20 && p.x <= VIEW_W + 20 && p.y >= -20 && p.y <= VIEW_H + 20);
  }, [incidents, center]);

  // Same projection for the self marker
  const selfXY = useMemo(() => {
    if (!selfPos) return null;
    const [clat, clng] = center;
    const x = ((selfPos.lng - clng) / DEG_LNG_SPAN + 0.5) * VIEW_W;
    const y = ((clat - selfPos.lat) / DEG_LAT_SPAN + 0.5) * VIEW_H;
    if (x < -20 || x > VIEW_W + 20 || y < -20 || y > VIEW_H + 20) return null;
    return { x, y };
  }, [selfPos, center]);

  return (
    <div style={{ position: 'relative', height: '100%', width: '100%' }}>
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        preserveAspectRatio="xMidYMid slice"
        xmlns="http://www.w3.org/2000/svg"
        style={{ width: '100%', height: '100%', display: 'block', borderRadius: 14 }}
        role="img"
        aria-label={`Map showing ${incidents.length} incidents near current location`}
      >
        <StaticMapBackdrop />

        {/* Incident pins */}
        <g>
          {projected.map((p) => {
            const size = p.severity === 'critical' ? 18 : p.severity === 'high' ? 15 : 12;
            return (
              <g key={p.id} transform={`translate(${p.x}, ${p.y})`}>
                {/* White ring + soft outer halo */}
                <circle r={size + 4} fill={categoryColor(p.category)} opacity="0.18" />
                <circle r={size} fill={categoryColor(p.category)} stroke="#fff" strokeWidth="2" />
              </g>
            );
          })}
        </g>

        {/* Self marker — green pulsing dot, only when geolocation resolved
            AND it's within the visible viewport. */}
        {selfXY && (
          <g transform={`translate(${selfXY.x}, ${selfXY.y})`}>
            <circle r="14" fill="#22c55e" opacity="0.25">
              <animate attributeName="r" values="10;22;10" dur="2s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="0.4;0;0.4" dur="2s" repeatCount="indefinite" />
            </circle>
            <circle r="8" fill="#22c55e" stroke="#fff" strokeWidth="2" />
          </g>
        )}

        {/* If we have no data and no location yet, hint at the loading state */}
        {incidents.length === 0 && !selfXY && geoStatus !== 'ready' && (
          <g>
            <rect x="0" y="0" width={VIEW_W} height={VIEW_H} fill="#161616" opacity="0.7" />
            <text
              x={VIEW_W / 2} y={VIEW_H / 2}
              textAnchor="middle" dominantBaseline="middle"
              fill="#9a9a9a" fontSize="18" fontFamily="Poppins, sans-serif"
            >
              {geoStatus === 'locating' ? '📍 Getting your location…' : 'Loading incidents…'}
            </text>
          </g>
        )}
      </svg>

      <MapLegend />

      {/* Live overlay badge top-right */}
      <div className="llive-overlay">
        <span className="llive-overlay-dot" />
        {incidents.length} incidents · last 30 days
      </div>
    </div>
  );
}

// The "map texture" — same stylized SVG street grid the hero uses, but
// drawn at full opacity here since this card is the actual map.
function StaticMapBackdrop() {
  return (
    <g>
      <rect x="0" y="0" width={VIEW_W} height={VIEW_H} fill="#f6f7f9" />

      {/* Major arterial grid */}
      <g stroke="#dbe0e8" strokeWidth="3" fill="none">
        <line x1="0"   y1="120" x2={VIEW_W} y2="180" />
        <line x1="0"   y1="380" x2={VIEW_W} y2="320" />
        <line x1="0"   y1="500" x2={VIEW_W} y2="520" />
      </g>
      <g stroke="#e2e6ee" strokeWidth="2" fill="none">
        <line x1="240"  y1="0" x2="280"  y2={VIEW_H} />
        <line x1="640"  y1="0" x2="600"  y2={VIEW_H} />
        <line x1="940"  y1="0" x2="980"  y2={VIEW_H} />
        <line x1="0"    y1="60"  x2={VIEW_W} y2="80" />
        <line x1="0"    y1="280" x2={VIEW_W} y2="260" />
        <line x1="0"    y1="460" x2={VIEW_W} y2="440" />
      </g>

      {/* Finer street grid */}
      <g stroke="#e8ecf2" strokeWidth="1" strokeLinecap="round">
        {STREET_SEGMENTS.map(([x1, y1, x2, y2], i) => (
          <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} />
        ))}
      </g>

      {/* City blocks */}
      <g fill="#eef1f6">
        {BLOCKS.map(([x, y, w, h], i) => (
          <rect key={i} x={x} y={y} width={w} height={h} rx="2" />
        ))}
      </g>

      {/* A few water curves */}
      <g stroke="#cfe1ec" strokeWidth="4" fill="none" opacity="0.7" strokeLinecap="round">
        <path d="M -20 200 Q 200 240 380 200 T 780 220 T 1020 200" />
        <path d="M -20 420 Q 240 460 460 420 T 860 440 T 1020 420" />
      </g>

      {/* Park-ish green polygon */}
      <g fill="#dceacd" opacity="0.7">
        <rect x="120" y="80" width="160" height="100" rx="4" />
        <rect x="700" y="320" width="200" height="120" rx="4" />
      </g>
    </g>
  );
}

// Hand-tuned street/block data so server & client render identically.
const STREETS = [
  [40, 30, 220, 38], [260, 50, 410, 42], [460, 60, 600, 70],
  [40, 110, 200, 118], [240, 130, 380, 122], [420, 140, 580, 130],
  [60, 200, 240, 196], [300, 210, 480, 214], [520, 220, 700, 210],
  [80, 340, 260, 336], [300, 350, 460, 358], [500, 360, 680, 354],
  [40, 480, 220, 476], [260, 490, 420, 482], [460, 500, 620, 508],
  [80, 20, 88, 200], [200, 60, 208, 240], [340, 30, 348, 220],
  [460, 80, 468, 280], [580, 40, 588, 260], [700, 60, 708, 240],
  [820, 30, 828, 220], [940, 80, 948, 280], [960, 50, 968, 240],
  [120, 260, 128, 460], [260, 280, 268, 480], [400, 260, 408, 460],
  [540, 280, 548, 480], [680, 260, 688, 460], [820, 280, 828, 480],
  [860, 280, 868, 480], [940, 280, 948, 480],
];
const STREET_SEGMENTS = STREETS;

const BLOCKS = [
  [60, 60, 24, 16], [120, 90, 18, 14], [200, 70, 22, 18],
  [340, 100, 20, 14], [420, 80, 26, 18], [540, 60, 18, 14],
  [640, 110, 22, 16], [760, 90, 20, 14], [880, 70, 24, 18],
  [60, 200, 20, 14], [180, 220, 24, 16], [300, 200, 18, 14],
  [420, 230, 22, 18], [560, 210, 20, 14], [680, 230, 26, 16],
  [820, 220, 18, 14], [940, 200, 24, 16],
  [60, 340, 22, 16], [180, 360, 18, 14], [300, 340, 24, 18],
  [440, 360, 20, 14], [580, 340, 26, 16], [700, 360, 18, 14],
  [840, 340, 22, 16], [960, 360, 24, 14],
  [80, 460, 20, 14], [220, 480, 24, 16], [360, 460, 18, 14],
  [500, 480, 22, 18], [640, 460, 26, 14], [780, 480, 18, 16],
  [920, 460, 24, 14],
];
