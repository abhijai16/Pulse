import { useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api.js';
import { EMERGENCY_CONTACTS, telHref } from '../../lib/emergencyContacts.js';

// Tile configuration for the "NEED EMERGENCY HELP?" row. The icon/color
// pair mirrors the existing dashboard severity palette (--red / --amber /
// --accent / --critical) so the tiles feel native to the rest of the app.
// Each tile also carries the colour it borrows from the homepage's
// gradient-orb palette so the row reads as a single design system.
const TILES = [
  {
    key: 'medical',
    label: 'Medical',
    sub: 'Emergency',
    icon: '🩺',
    color: '#ff3366',     // critical / red
    glow: 'rgba(255, 51, 102, 0.40)',
    tint: 'rgba(255, 51, 102, 0.10)',
  },
  {
    key: 'fire',
    label: 'Fire',
    sub: 'Emergency',
    icon: '🔥',
    color: '#ff7a45',     // high / orange
    glow: 'rgba(255, 122, 69, 0.40)',
    tint: 'rgba(255, 122, 69, 0.10)',
  },
  {
    key: 'harassment',
    label: 'Security',
    sub: 'Emergency',
    icon: '🛡️',
    color: '#5eb1ff',     // accent / blue
    glow: 'rgba(94, 177, 255, 0.40)',
    tint: 'rgba(94, 177, 255, 0.10)',
  },
  {
    key: 'unsafe_area',
    label: 'Report',
    sub: 'Hazard',
    icon: '⚠️',
    color: '#f5a623',     // medium / amber
    glow: 'rgba(245, 166, 35, 0.40)',
    tint: 'rgba(245, 166, 35, 0.10)',
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

// Map contact-icon key -> tint token class so the chip wears the colour
// of its category. Mirrors TILES above so Security reads blue, Medical
// reads pink, Fire reads orange, etc.
const CONTACT_COLOR = {
  shield:   'emer-contact-icon-shield',
  cross:    'emer-contact-icon-cross',
  flame:    'emer-contact-icon-flame',
  building: 'emer-contact-icon-building',
};
const CONTACT_GLYPH = {
  shield: '🛡️',
  cross: '➕',
  flame: '🔥',
  building: '🏛️',
};

// Web Audio API siren — same primitive the SOS-main reference uses,
// inlined so we don't pull a new dependency. Two oscillators sweep
// 700 → 1200 Hz to mimic an emergency vehicle.
let sirenCtx = null;
let sirenOsc = null;
let sirenInterval = null;
function startSiren() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    sirenCtx = new Ctx();
    sirenOsc = sirenCtx.createOscillator();
    const gain = sirenCtx.createGain();
    sirenOsc.type = 'sawtooth';
    sirenOsc.frequency.setValueAtTime(800, sirenCtx.currentTime);
    gain.gain.setValueAtTime(0.25, sirenCtx.currentTime);
    sirenOsc.connect(gain).connect(sirenCtx.destination);
    sirenOsc.start();
    let high = true;
    sirenInterval = setInterval(() => {
      if (sirenOsc && sirenCtx) {
        sirenOsc.frequency.setValueAtTime(high ? 1200 : 700, sirenCtx.currentTime);
        high = !high;
      }
    }, 400);
  } catch (e) {
    console.warn('Siren audio failed:', e);
  }
}
function stopSiren() {
  if (sirenInterval) { clearInterval(sirenInterval); sirenInterval = null; }
  if (sirenOsc) { try { sirenOsc.stop(); } catch (e) {} sirenOsc = null; }
  if (sirenCtx) { try { sirenCtx.close(); } catch (e) {} sirenCtx = null; }
}

// Format a byte count for the file chip (e.g. 1.4 MB, 240 KB).
function fmtBytes(n) {
  if (!Number.isFinite(n)) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

// Attachment limits — mirror the backend so we can fail fast client-side
// without round-tripping a 413. Photos and short clips only; up to 4 files.
const MAX_ATTACH = 4;
const MAX_FILE_BYTES = 25 * 1024 * 1024;     // 25 MB
const ACCEPTED = 'image/*,video/*';

// Classify a File as image / video so we can render the right thumbnail
// glyph and skip video previews (browsers handle <video> differently
// across mobile/desktop; we keep the chip uniform).
function fileKind(file) {
  if (!file) return 'file';
  if (file.type && file.type.startsWith('image/')) return 'image';
  if (file.type && file.type.startsWith('video/')) return 'video';
  return 'file';
}

export default function EmergencyView({ onSubmitted }) {
  const [coords, setCoords] = useState(null);
  const [coordsAccuracy, setCoordsAccuracy] = useState(null);
  const [coordsSource, setCoordsSource] = useState(null); // 'gps' | 'fallback' | 'manual'
  const [locating, setLocating] = useState(true);
  const [responders, setResponders] = useState([]);
  const [pickedCategory, setPickedCategory] = useState(null);
  const [description, setDescription] = useState('');
  const [isAnonymous, setIsAnonymous] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [sosConfirming, setSosConfirming] = useState(false);
  const [sirenOn, setSirenOn] = useState(false);

  // Attachments — up to MAX_ATTACH files. Each entry carries the raw
  // File object plus a transient object URL for thumbnails. We revoke
  // those URLs on remove/unmount to avoid leaking them.
  const [attachments, setAttachments] = useState([]);
  const fileInputRef = useRef(null);

  // Manual location override: free-text label the user can type when
  // GPS is wrong / unavailable. "Block 4, second floor" beats raw lat/lng.
  const [locationLabel, setLocationLabel] = useState('');
  const descRef = useRef(null);

  // Auto-capture GPS on mount; fall back to campus center.
  useEffect(() => {
    if (!navigator.geolocation) {
      setCoords(CAMPUS_FALLBACK);
      setCoordsSource('fallback');
      setLocating(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setCoordsAccuracy(pos.coords.accuracy);
        setCoordsSource('gps');
      },
      () => {
        setCoords(CAMPUS_FALLBACK);
        setCoordsSource('fallback');
      },
      { timeout: 4000, maximumAge: 30000 },
    );
    setLocating(false);
  }, []);

  // Revoke any object URLs we created so the browser can release the
  // underlying blob memory when the component unmounts or the user
  // removes a file.
  useEffect(() => () => {
    attachments.forEach((a) => { try { URL.revokeObjectURL(a.url); } catch (e) {} });
  }, [attachments]);

  // Fetch nearest responders once we have coords (or the fallback).
  // We swallow raw backend errors so users never see a SQL string on the
  // panic page — degrade to the friendly empty state instead.
  useEffect(() => {
    if (!coords) return;
    let cancelled = false;
    api.nearbyResponders(coords.lat, coords.lng, 3)
      .then((rows) => {
        if (cancelled) return;
        setResponders(Array.isArray(rows) ? rows : []);
      })
      .catch((e) => {
        if (cancelled) return;
        console.warn('[AlertNow] nearby responders failed:', e);
        setResponders([]);
      });
    return () => { cancelled = true; };
  }, [coords]);

  // After picking a tile, scroll the compact form into view and focus the
  // description so the user can immediately type.
  useEffect(() => {
    if (pickedCategory && descRef.current) {
      descRef.current.focus();
      descRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [pickedCategory]);

  // Stop the siren on unmount so it can't keep playing after navigation.
  useEffect(() => () => stopSiren(), []);

  function handleTileClick(category) {
    setPickedCategory(category);
    setError(null);
  }

  // Add attachments from the hidden <input type="file"> or a drag-drop.
  // We bail on oversized files / wrong types here so the user gets an
  // immediate in-form message instead of a 413 from the backend later.
  function addFiles(rawList) {
    if (!rawList || rawList.length === 0) return;
    setError(null);
    const incoming = Array.from(rawList);
    setAttachments((prev) => {
      const next = [...prev];
      for (const f of incoming) {
        if (next.length >= MAX_ATTACH) {
          setError(`Max ${MAX_ATTACH} attachments per report.`);
          break;
        }
        if (!/^image\/|^video\//.test(f.type)) {
          setError(`"${f.name}" isn't an image or video — skipped.`);
          continue;
        }
        if (f.size > MAX_FILE_BYTES) {
          setError(`"${f.name}" is over ${fmtBytes(MAX_FILE_BYTES)} — skipped.`);
          continue;
        }
        next.push({
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          file: f,
          kind: fileKind(f),
          url: URL.createObjectURL(f),
        });
      }
      return next;
    });
  }
  function removeAttachment(id) {
    setAttachments((prev) => {
      const target = prev.find((a) => a.id === id);
      if (target) { try { URL.revokeObjectURL(target.url); } catch (e) {} }
      return prev.filter((a) => a.id !== id);
    });
  }
  function openFilePicker() { fileInputRef.current?.click(); }
  function onPickFiles(e) { addFiles(e.target.files); e.target.value = ''; }

  // Re-request a fresh GPS fix. The user can hit this when the initial
  // location was the campus fallback and they want to try again, or when
  // their first fix was a low-accuracy one.
  function refreshLocation() {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported on this device.');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setCoordsAccuracy(pos.coords.accuracy);
        setCoordsSource('gps');
        setLocating(false);
      },
      () => {
        setError('Could not get a fresh GPS fix. Type the location manually below.');
        setLocating(false);
      },
      { timeout: 6000, maximumAge: 0 },
    );
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
      // Prefer the manual label the user typed; fall back to a
      // source-aware default so dispatch knows whether the lat/lng came
      // from a real fix or the campus fallback.
      const fallbackLabel =
        coordsSource === 'fallback'
          ? 'Campus center (GPS unavailable)'
          : 'Auto-captured location';
      fd.append('locationLabel', locationLabel.trim() || fallbackLabel);
      attachments.forEach((a) => fd.append('media', a.file));
      const result = await api.submitReport(fd);
      onSubmitted(result.tracking_id);
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
    }
  }

  // SOS opens the confirm dialog first; the actual dispatch happens on
  // the confirm button. Pattern ported from the SOS-main reference for
  // the deliberate "are you sure?" moment before broadcasting.
  function openSos() {
    if (submitting) return;
    setSosConfirming(true);
  }
  function cancelSos() {
    setSosConfirming(false);
    if (sirenOn) { stopSiren(); setSirenOn(false); }
  }
  async function confirmSos() {
    setSubmitting(true);
    setError(null);
    try {
      // Optional audible alarm — same Web Audio primitive as the
      // reference SOS service. Activates on confirmation so it doesn't
      // fire during the (potentially accidental) open-tap.
      if (!sirenOn) { startSiren(); setSirenOn(true); }
      await submit('medical', '');
    } catch (e) {
      setSubmitting(false);
      if (sirenOn) { stopSiren(); setSirenOn(false); }
    }
  }
  function toggleSiren() {
    if (sirenOn) { stopSiren(); setSirenOn(false); }
    else         { startSiren(); setSirenOn(true); }
  }

  async function handleSubmitFromForm(e) {
    e.preventDefault();
    if (!pickedCategory) return;
    await submit(pickedCategory, description.trim());
  }

  const pickedTile = TILES.find((t) => t.key === pickedCategory);

  return (
    <div className="alertnow-page">
      <div className="alertnow-grid">

      {/* ==================== LEFT COLUMN ==================== */}
      <div className="alertnow-col alertnow-col-left">

      {/* ==================== 1. NEED EMERGENCY HELP? ==================== */}
      <div className="alertnow-card">
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 14,
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

        <div className="emer-row">
          {/* Four category tiles in their own grid */}
          <div className="emer-row-tiles">
            {TILES.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => handleTileClick(t.key)}
                className={`emer-tile${pickedCategory === t.key ? ' is-selected' : ''}`}
                style={{
                  '--tile-color': t.color,
                  '--tile-glow':  t.glow,
                }}
              >
                <div className="emer-tile-icon">{t.icon}</div>
                <div className="emer-tile-label">{t.label}</div>
                <div className="emer-tile-sub">{t.sub}</div>
              </button>
            ))}
          </div>

          {/* Vertical divider with the OR label */}
          <div className="emer-divider"><span>OR</span></div>

          {/* SOS panel — circular red button + helper copy, separated
              from the category row so the panic action reads as its own
              element rather than a fifth tile. */}
          <div className="emer-sos-panel">
            <button
              type="button"
              onClick={openSos}
              disabled={submitting}
              className="emer-sos"
              aria-label="SOS emergency assistance"
            >
              <div className="emer-sos-ring" />
              <div className="emer-sos-label">SOS</div>
            </button>
            <div className="emer-sos-meta">
              <div className="emer-sos-help">Emergency Assistance</div>
              <div className="emer-sos-tap">Tap for immediate help</div>
            </div>
          </div>
        </div>

        {locating && (
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 10 }}>
            Detecting GPS…
          </div>
        )}
      </div>

      {/* ==================== SOS confirmation dialog ==================== */}
      {sosConfirming && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Confirm SOS"
          onClick={cancelSos}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(8, 6, 12, 0.65)',
            backdropFilter: 'blur(6px)',
            WebkitBackdropFilter: 'blur(6px)',
            zIndex: 60,
            display: 'grid',
            placeItems: 'center',
            padding: 16,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 'min(440px, 100%)',
              background: 'linear-gradient(180deg, #1f1f24 0%, #18181c 100%)',
              border: '1px solid rgba(255, 59, 48, 0.35)',
              borderRadius: 16,
              padding: 22,
              boxShadow: '0 18px 60px rgba(0, 0, 0, 0.55), 0 0 40px rgba(255, 59, 48, 0.25)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <span style={{ fontSize: 22 }}>🚨</span>
              <h3 style={{ margin: 0, fontSize: 18, color: '#ff6a6a' }}>
                Trigger Emergency SOS?
              </h3>
            </div>
            <p style={{ margin: '0 0 16px 0', color: 'var(--muted)', fontSize: 13, lineHeight: 1.5 }}>
              Pulse will immediately broadcast your live GPS to the nearest
              campus responders, log a critical incident, and optionally sound
              an audible alarm so people nearby know you need help.
            </p>

            <button
              type="button"
              onClick={toggleSiren}
              style={{
                width: '100%',
                marginBottom: 12,
                padding: '10px 14px',
                borderRadius: 10,
                border: '1px solid rgba(245, 166, 35, 0.45)',
                background: sirenOn ? 'rgba(245, 166, 35, 0.22)' : 'rgba(245, 166, 35, 0.10)',
                color: '#ffd99a',
                fontWeight: 600,
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              {sirenOn ? '🔊 Siren ON — tap to mute' : '🔇 Activate audible siren'}
            </button>

            <div style={{ display: 'flex', gap: 10 }}>
              <button
                type="button"
                onClick={cancelSos}
                disabled={submitting}
                style={{ flex: 1 }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmSos}
                disabled={submitting}
                className="emer-sos-confirm"
              >
                {submitting ? 'Broadcasting…' : '🚨 Send SOS Now'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================== Compact form (after tile pick) ==================== */}
      {pickedTile && (
        <form onSubmit={handleSubmitFromForm} className="alertnow-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <span style={{ fontSize: 22 }}>{pickedTile.icon}</span>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>
              {pickedTile.label} {pickedTile.sub.toLowerCase()}
            </h3>
            <button
              type="button"
              onClick={() => {
                setPickedCategory(null);
                setDescription('');
                setError(null);
                setLocationLabel('');
                // Revoke URLs before clearing so the blobs are released
                // even if the user changes their mind mid-form.
                attachments.forEach((a) => { try { URL.revokeObjectURL(a.url); } catch (e) {} });
                setAttachments([]);
              }}
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

          {/* ============ Location picker ============ */}
          <div className="field">
            <label>Location</label>
            <div className="emer-location">
              <div className="emer-location-icon" aria-hidden="true">📍</div>
              <div className="emer-location-body">
                {coords ? (
                  <>
                    <div className="emer-location-coords">
                      <span className="emer-coord-val">{coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}</span>
                      <span className={`emer-coord-source emer-coord-source-${coordsSource || 'gps'}`}>
                        {coordsSource === 'fallback' ? 'Campus fallback'
                          : coordsSource === 'manual' ? 'Manual pin'
                          : locating ? 'Locating…'
                          : 'GPS fix'}
                      </span>
                    </div>
                    {coordsAccuracy != null && coordsSource === 'gps' && (
                      <div className="emer-location-acc">±{Math.round(coordsAccuracy)} m accuracy</div>
                    )}
                    <input
                      type="text"
                      className="emer-location-input"
                      placeholder="Add a place label (e.g. Block 4, 2nd floor)"
                      value={locationLabel}
                      onChange={(e) => setLocationLabel(e.target.value)}
                      maxLength={120}
                    />
                  </>
                ) : (
                  <div className="emer-location-coords">Detecting GPS…</div>
                )}
              </div>
              <button
                type="button"
                className="emer-location-refresh"
                onClick={refreshLocation}
                disabled={locating}
                aria-label="Refresh location"
                title="Refresh GPS"
              >
                {locating ? '⟳' : '↻'}
              </button>
            </div>
          </div>

          {/* ============ Attachment picker ============ */}
          <div className="field">
            <label>
              Add evidence
              <span className="emer-attach-hint">
                {attachments.length}/{MAX_ATTACH} · image or short video · max {fmtBytes(MAX_FILE_BYTES)}
              </span>
            </label>

            {/* Hidden input — opened by the dropzone / add button so the
                styling lives on the dropzone, not the OS file picker. */}
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED}
              multiple
              onChange={onPickFiles}
              style={{ display: 'none' }}
            />

            <div
              className={`emer-attach${attachments.length >= MAX_ATTACH ? ' is-full' : ''}`}
              onClick={openFilePicker}
              onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('is-drag'); }}
              onDragLeave={(e) => e.currentTarget.classList.remove('is-drag')}
              onDrop={(e) => {
                e.preventDefault();
                e.currentTarget.classList.remove('is-drag');
                addFiles(e.dataTransfer.files);
              }}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openFilePicker(); }
              }}
            >
              <div className="emer-attach-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor"
                     strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
              </div>
              <div className="emer-attach-text">
                <div className="emer-attach-title">
                  {attachments.length >= MAX_ATTACH ? 'Attachment limit reached' : 'Tap to attach or drop files here'}
                </div>
                <div className="emer-attach-sub">
                  Photos help dispatch identify the scene faster.
                </div>
              </div>
            </div>

            {attachments.length > 0 && (
              <div className="emer-attach-grid">
                {attachments.map((a) => (
                  <div key={a.id} className={`emer-attach-chip emer-attach-chip-${a.kind}`}>
                    {a.kind === 'image' ? (
                      <img src={a.url} alt="" className="emer-attach-thumb" />
                    ) : (
                      <div className="emer-attach-thumb emer-attach-thumb-video">
                        <span aria-hidden="true">🎬</span>
                      </div>
                    )}
                    <div className="emer-attach-meta">
                      <div className="emer-attach-name" title={a.file.name}>{a.file.name}</div>
                      <div className="emer-attach-size">{fmtBytes(a.file.size)}</div>
                    </div>
                    <button
                      type="button"
                      className="emer-attach-remove"
                      onClick={() => removeAttachment(a.id)}
                      aria-label={`Remove ${a.file.name}`}
                      title="Remove"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
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

      </div>{/* /.alertnow-col-left */}

      {/* ==================== RIGHT COLUMN ==================== */}
      <div className="alertnow-col alertnow-col-right">

      {/* ==================== 2. NEAREST RESPONDERS ==================== */}
      <div className="alertnow-card">
        <h3 style={{ margin: '0 0 12px 0', fontSize: 13, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', color: 'var(--text)' }}>
          Nearest responders
        </h3>
        {!locating && responders.length === 0 && (
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
      <div className="alertnow-card">
        <h3 style={{ margin: '0 0 14px 0', fontSize: 13, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', color: 'var(--text)' }}>
          Emergency contacts
        </h3>
        <div>
          {EMERGENCY_CONTACTS.map((c) => (
            <div key={c.key} className="emer-contact-row">
              <div className={`emer-contact-icon ${CONTACT_COLOR[c.icon] || ''}`}>
                {CONTACT_GLYPH[c.icon] || '📞'}
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

      </div>{/* /.alertnow-col-right */}
      </div>{/* /.alertnow-grid */}
    </div>
  );
}
