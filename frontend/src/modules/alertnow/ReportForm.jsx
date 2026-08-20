import { useState, useEffect, useRef } from 'react';
import { api } from '../../lib/api.js';
import GeofenceBanner from './GeofenceBanner.jsx';
import LocationSearch from './LocationSearch.jsx';

const CATEGORIES = [
  { value: 'medical',     label: '🩺 Medical emergency' },
  { value: 'fire',        label: '🔥 Fire / smoke' },
  { value: 'harassment',  label: '⚠️ Harassment / safety' },
  { value: 'unsafe_area', label: '🌙 Unsafe area' },
  { value: 'infra',       label: '� Infrastructure issue' },
];

const CAMPUS_FALLBACK = { lat: 19.1334, lng: 72.9133 }; // Main Gate

export default function ReportForm({ onSubmitted }) {
  const [category, setCategory] = useState('medical');
  const [description, setDescription] = useState('');
  const [photo, setPhoto] = useState(null);
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [coords, setCoords] = useState(null);
  const [locating, setLocating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [locationLabel, setLocationLabel] = useState('Auto-captured location');
  const fileRef = useRef(null);

  function captureGps() {
    setLocating(true);
    navigator.geolocation?.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocationLabel('Auto-captured location');
      },
      () => { /* keep whatever was selected before */ },
      { timeout: 4000 }
    );
    setLocating(false);
  }

  // Try to auto-capture GPS on mount; fall back to campus center.
  useEffect(() => {
    setLocating(true);
    if (!navigator.geolocation) {
      setCoords(CAMPUS_FALLBACK);
      setLocating(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setCoords(CAMPUS_FALLBACK),
      { timeout: 4000, maximumAge: 30000 }
    );
    setLocating(false);
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!coords) return;
    if (!description.trim()) {
      setError('Description is required');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append('category', category);
      fd.append('description', description.trim());
      fd.append('lat', coords.lat);
      fd.append('lng', coords.lng);
      fd.append('isAnonymous', String(isAnonymous));
      fd.append('locationLabel', locationLabel || 'Auto-captured location');
      if (photo) fd.append('photo', photo);
      const result = await api.submitReport(fd);
      onSubmitted(result.tracking_id);
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card" style={{ maxWidth: 560 }}>
      {/* FEATURE 2: Geofence banner — shown above the form when in an active zone */}
      <GeofenceBanner coords={coords} />
      <div className="field">
        <label>Category</label>
        <select value={category} onChange={(e) => setCategory(e.target.value)}>
          {CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
      </div>

      <div className="field">
        <label>What happened?</label>
        <textarea
          rows={4}
          placeholder="Describe the situation. Include location hints if possible."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>

      <div className="field">
        <label>Photo (optional)</label>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={(e) => setPhoto(e.target.files?.[0] || null)}
        />
        {photo && (
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6 }}>
            Selected: {photo.name} ({Math.round(photo.size / 1024)} KB)
          </div>
        )}
      </div>

      <div className="field">
        <label>Location</label>
        <LocationSearch
          coords={coords}
          onSelect={({ lat, lng, label }) => {
            setCoords({ lat, lng });
            setLocationLabel(label);
          }}
          onUseGps={captureGps}
        />
        {locating && (
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
            Detecting GPS…
          </div>
        )}
      </div>

      <div className="field" style={{
        display: 'flex', alignItems: 'center', gap: 10,
        background: 'var(--surface-2)', padding: 12, borderRadius: 8,
      }}>
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
        {submitting ? 'Submitting…' : 'Submit Report'}
      </button>
    </form>
  );
}
