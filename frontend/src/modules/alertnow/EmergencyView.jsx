import { useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api.js';
import { EMERGENCY_CONTACTS, telHref } from '../../lib/emergencyContacts.js';

// Tile configuration for the "NEED EMERGENCY HELP?" row. The icon/color
// pair mirrors the existing dashboard severity palette (--red / --amber /
// --accent / --critical) so the tiles feel native to the rest of the app.
const TILES = [
  {
    key: 'medical',
    label: 'Medical',
    sub: 'Emergency',
    icon: '🩺',
    color: '#ff3366',     // critical / red
    glow: 'rgba(255,51,102,0.35)',
  },
  {
    key: 'fire',
    label: 'Fire',
    sub: 'Emergency',
    icon: '🔥',
    color: '#ff7a45',     // high / orange
    glow: 'rgba(255,122,69,0.35)',
  },
  {
    key: 'harassment',
    label: 'Security',
    sub: 'Emergency',
    icon: '🛡️',
    color: '#5eb1ff',     // accent / blue
    glow: 'rgba(94,177,255,0.35)',
  },
  {
    key: 'unsafe_area',
    label: 'Report',
    sub: 'Hazard',
    icon: '⚠️',
    color: '#f5a623',     // medium / amber
    glow: 'rgba(245,166,35,0.35)',
  },
];

const CAMPUS_FALLBACK = { lat: 20.27240, lng: 85.83380 }; // KIIT sample center

// Haversine for client-side distance formatting (backend already returns
// meters, we just convert to km with 1 decimal for the UI).
function fmtKm(m) {
  if (m == null) return '—';
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toFixed(1)} km`;
}

function initials(name) {
  if (!name) return '?';
  return name.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
}

// Avatar color is derived deterministically from the name so the same
// responder always gets the same color across renders.
const AVATAR_PALETTE = ['#5eb1ff', '#ff7a45', '#2ecc71', '#f5a623', '#ff3366', '#9b8cff'];
function avatarColor(name) {
  let h = 0;
  for (let i = 0; i < (name || '').length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_PALETTE[h % AVATAR_PALETTE.length];
}

export default function EmergencyView({ onSubmitted }) {
  const [coords, setCoords] = useState(null);
  const [locating, setLocating] = useState(true);
  const [responders, setResponders] = useState([]);
  const [nearbyErr, setNearbyErr] = useState(null);
  const [pickedCategory, setPickedCategory] = useState(null);
  const [description, setDescription] = useState('');
  const [isAnonymous, setIsAnonymous] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const descRef = useRef(null);

  // Auto-capture GPS on mount; fall back to campus center.
  useEffect(() => {
    if (!navigator.geolocation) {
      setCoords(CAMPUS_FALLBACK);
      setLocating(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setCoords(CAMPUS_FALLBACK),
      { timeout: 4000, maximumAge: 30000 },
    );
    setLocating(false);
  }, []);

  // Fetch nearest responders once we have coords (or the fallback).
  useEffect(() => {
    if (!coords) return;
    api.nearbyResponders(coords.lat, coords.lng, 3)
      .then((rows) => setResponders(Array.isArray(rows) ? rows : []))
      .catch((e) => setNearbyErr(e.message));
  }, [coords]);

  // After picking a tile, scroll the compact form into view and focus the
  // description so the user can immediately type.
  useEffect(() => {
    if (pickedCategory && descRef.current) {
      descRef.current.focus();
      descRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [pickedCategory]);

  function handleTileClick(category) {
    setPickedCategory(category);
    setError(null);
  }

  async function submit(category, desc) {
    if (!coords) {
      setError('Waiting for GPS — try again in a moment.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append('category', category);
      fd.append('description', desc || '');
      fd.append('lat', coords.lat);
      fd.append('lng', coords.lng);
      fd.append('isAnonymous', String(isAnonymous));
      fd.append('locationLabel', 'Auto-captured location');
      const result = await api.submitReport(fd);
      onSubmitted(result.tracking_id);
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
    }
  }

  // SOS = critical medical, no description required, anonymous by default.
  async function handleSos() {
    if (submitting) return;
    await submit('medical', '');
  }

  async function handleSubmitFromForm(e) {
    e.preventDefault();
    if (!pickedCategory) return;
    await submit(pickedCategory, description.trim());
  }

  const pickedTile = TILES.find((t) => t.key === pickedCategory);

  return (
    <>
      {/* ==================== 1. NEED EMERGENCY HELP? ==================== */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 12,
            flexWrap: 'wrap',
            gap: 8,
          }}
        >
          <h3 style={{ margin: 0, fontSize: 13, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', color: 'var(--text)' }}>
            Need emergency help?
          </h3>
          <span style={{ fontSize: 11, color: 'var(--muted)' }}>
            Tap a category or press SOS
          </span>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr) auto',
            gap: 12,
            alignItems: 'stretch',
          }}
        >
          {TILES.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => handleTileClick(t.key)}
              className="emer-tile"
              style={{
                '--tile-color': t.color,
                '--tile-glow': t.glow,
                borderColor: pickedCategory === t.key ? t.color : undefined,
              }}
            >
              <div className="emer-tile-icon">{t.icon}</div>
              <div className="emer-tile-label">{t.label}</div>
              <div className="emer-tile-sub">{t.sub}</div>
            </button>
          ))}

          {/* OR divider */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)', fontSize: 12, fontWeight: 600, padding: '0 4px' }}>
            OR
          </div>

          {/* SOS button */}
          <button
            type="button"
            onClick={handleSos}
            disabled={submitting}
            className="emer-sos"
            aria-label="SOS emergency assistance"
          >
            <div className="emer-sos-ring" />
            <div className="emer-sos-label">SOS</div>
            <div className="emer-sos-help">Emergency Assistance</div>
            <div className="emer-sos-tap">Tap for immediate help</div>
          </button>
        </div>

        {locating && (
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 10 }}>
            Detecting GPS…
          </div>
        )}
      </div>

      {/* ==================== Compact form (after tile pick) ==================== */}
      {pickedTile && (
        <form onSubmit={handleSubmitFromForm} className="card" style={{ marginBottom: 16, maxWidth: 720 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <span style={{ fontSize: 22 }}>{pickedTile.icon}</span>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>
              {pickedTile.label} {pickedTile.sub.toLowerCase()}
            </h3>
            <button
              type="button"
              onClick={() => { setPickedCategory(null); setDescription(''); setError(null); }}
              style={{ marginLeft: 'auto', fontSize: 12 }}
            >
              Change
            </button>
          </div>

          <div className="field">
            <label>What happened? (optional)</label>
            <textarea
              ref={descRef}
              rows={3}
              placeholder="Add any details that help responders. Skip if it's not safe to type."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div
            className="field"
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              background: 'var(--surface-2)', padding: 12, borderRadius: 8,
            }}
          >
            <input
              id="anon"
              type="checkbox"
              checked={isAnonymous}
              onChange={(e) => setIsAnonymous(e.target.checked)}
              style={{ width: 'auto' }}
            />
            <label htmlFor="anon" style={{ margin: 0, color: 'var(--text)' }}>
              Submit anonymously (description is encrypted, no reporter ID stored)
            </label>
          </div>

          {error && (
            <div style={{ color: 'var(--red)', fontSize: 13, marginBottom: 12 }}>{error}</div>
          )}

          <button type="submit" className="primary" disabled={submitting || !coords} style={{ width: '100%', padding: 12 }}>
            {submitting ? 'Submitting…' : 'Send report'}
          </button>
        </form>
      )}

      {/* ==================== 2. NEAREST RESPONDERS ==================== */}
      <div className="card" style={{ marginBottom: 16 }}>
        <h3 style={{ margin: '0 0 12px 0', fontSize: 13, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', color: 'var(--text)' }}>
          Nearest responders
        </h3>
        {nearbyErr && (
          <div style={{ color: 'var(--muted)', fontSize: 13 }}>
            Couldn't load responders: {nearbyErr}
          </div>
        )}
        {!nearbyErr && responders.length === 0 && !locating && (
          <div style={{ color: 'var(--muted)', fontSize: 13 }}>
            No responders on duty right now.
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {responders.map((r) => (
            <div key={r.id} className="emer-resp-row">
              <div
                className="emer-avatar"
                style={{ background: avatarColor(r.name) }}
                aria-hidden="true"
              >
                {initials(r.name)}
              </div>
              <div className="emer-resp-meta">
                <div className="emer-resp-name">{r.name}</div>
                <div className="emer-resp-team">
                  <span style={{ textTransform: 'capitalize' }}>{r.role}</span>
                  {' '}Team
                </div>
              </div>
              <div className="emer-resp-right">
                <div className="emer-resp-distance">{fmtKm(r.distance_m)} away</div>
                <div className="emer-resp-status">
                  <span className="emer-status-dot" />
                  Available
                </div>
              </div>
              {r.phone && (
                <a
                  href={telHref(r.phone)}
                  className="emer-call-btn"
                  aria-label={`Call ${r.name}`}
                >
                  📞
                </a>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ==================== 3. EMERGENCY CONTACTS ==================== */}
      <div className="card">
        <h3 style={{ margin: '0 0 12px 0', fontSize: 13, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', color: 'var(--text)' }}>
          Emergency contacts
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {EMERGENCY_CONTACTS.map((c) => (
            <div key={c.key} className="emer-contact-row">
              <div className={`emer-contact-icon emer-contact-icon-${c.icon}`}>
                {c.icon === 'shield' && '🛡️'}
                {c.icon === 'cross' && '➕'}
                {c.icon === 'flame' && '🔥'}
                {c.icon === 'building' && '🏛️'}
              </div>
              <div className="emer-contact-label">{c.label}</div>
              <div className="emer-contact-phone">{c.phone}</div>
              <a
                href={telHref(c.phone)}
                className="emer-call-btn emer-call-btn-ghost"
                aria-label={`Call ${c.label}`}
              >
                📞 Call
              </a>
            </div>
          ))}
        </div>
        <div
          style={{
            marginTop: 14,
            padding: '10px 12px',
            background: 'var(--surface-2)',
            borderRadius: 8,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 12,
            color: 'var(--muted)',
          }}
        >
          🛡️ Stay safe. Stay alert. We're here to help.
        </div>
      </div>
    </>
  );
}
