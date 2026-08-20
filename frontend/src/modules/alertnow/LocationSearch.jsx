import { useState, useEffect, useRef } from 'react';

// OpenStreetMap Nominatim autocomplete.
//
// Performance tuning (real-world Nominatim p50 is 0.5–6s on shared infra):
//   - 220ms debounce (was 300ms) → feels snappier, still <1 req/sec
//   - Aborts in-flight requests when query changes → no stale results
//   - Local cache keyed by lowercase query → repeated prefixes are instant
//   - Spinner shown immediately on keystroke (not waiting for debounce fire)
//   - limit=5, NO addressdetails=1 (we split display_name ourselves; saves
//     a significant chunk of server-side work for Nominatim)
//   - Biased to Bhubaneswar via viewbox + bounded=1

const BHUBANESWAR_VIEWBOX = '85.75,20.30,85.90,20.45'; // [W,N,E,S]
const DEBOUNCE_MS = 220;
const MIN_CHARS = 3;

export default function LocationSearch({ coords, onSelect, onUseGps }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [error, setError] = useState(null);
  const debounceRef = useRef(null);
  const abortRef = useRef(null);
  const wrapperRef = useRef(null);

  // Tiny in-memory cache. Bounded so it doesn't grow forever in a long session.
  const cacheRef = useRef(new Map());
  const CACHE_LIMIT = 50;

  // Debounced search — fires 220ms after the user stops typing.
  // Loading spinner is shown immediately on keystroke (not after debounce).
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const trimmed = query.trim();
    if (trimmed.length < MIN_CHARS) {
      setResults([]);
      setOpen(false);
      setLoading(false);
      setError(null);
      return;
    }

    // Instant cache hit — no network round-trip
    const key = trimmed.toLowerCase();
    if (cacheRef.current.has(key)) {
      const cached = cacheRef.current.get(key);
      setResults(cached);
      setOpen(true);
      setHighlight(0);
      setLoading(false);
      setError(null);
      return;
    }

    // Show the spinner immediately so the user sees we're working on it,
    // not waiting 220ms in silence.
    setLoading(true);
    setOpen(true);
    setError(null);

    debounceRef.current = setTimeout(() => doSearch(trimmed), DEBOUNCE_MS);
    return () => clearTimeout(debounceRef.current);
  }, [query]);

  // Close dropdown on outside click.
  useEffect(() => {
    function onDocClick(e) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  async function doSearch(q) {
    if (abortRef.current) abortRef.current.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    const url =
      `https://nominatim.openstreetmap.org/search?format=json&limit=5` +
      `&q=${encodeURIComponent(q)}` +
      `&viewbox=${BHUBANESWAR_VIEWBOX}&bounded=1`;
    try {
      const res = await fetch(url, { signal: ac.signal });
      if (!res.ok) throw new Error(`Nominatim ${res.status}`);
      const data = await res.json();
      const safe = Array.isArray(data) ? data : [];

      // Populate cache (FIFO eviction when full)
      const key = q.toLowerCase();
      if (cacheRef.current.size >= CACHE_LIMIT) {
        const oldestKey = cacheRef.current.keys().next().value;
        cacheRef.current.delete(oldestKey);
      }
      cacheRef.current.set(key, safe);

      // Only update state if the request wasn't cancelled (AbortController)
      // and the query hasn't changed underneath us.
      if (!ac.signal.aborted) {
        setResults(safe);
        setHighlight(0);
        setError(null);
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        setError(err.message || 'search failed');
        setResults([]);
      }
    } finally {
      if (!ac.signal.aborted) setLoading(false);
    }
  }

  function pick(r) {
    const lat = parseFloat(r.lat);
    const lng = parseFloat(r.lon);
    onSelect({ lat, lng, label: r.display_name });
    setQuery(r.display_name.split(',').slice(0, 2).join(', '));
    setOpen(false);
  }

  function onKeyDown(e) {
    if (!open || results.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      pick(results[highlight]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  return (
    <div ref={wrapperRef} style={{ position: 'relative' }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => results.length > 0 && setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Search a place (e.g. Nandankanan, Khandagiri)…"
          autoComplete="off"
          aria-label="Search location"
          style={{ flex: 1 }}
        />
        <button type="button" onClick={onUseGps}>📍 Use my GPS</button>
      </div>

      {open && (loading || results.length > 0 || error || (query.trim().length >= MIN_CHARS && !loading)) && (
        <div
          style={{
            position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 8, boxShadow: 'var(--shadow)',
            zIndex: 100, maxHeight: 240, overflowY: 'auto',
          }}
        >
          {loading && (
            <div style={{
              padding: 10, color: 'var(--muted)', fontSize: 13,
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <span style={{
                width: 12, height: 12, borderRadius: '50%',
                border: '2px solid var(--muted)', borderTopColor: 'transparent',
                animation: 'pulse-spin 0.8s linear infinite',
                display: 'inline-block',
              }} />
              Searching…
              <style>{`@keyframes pulse-spin { to { transform: rotate(360deg); } }`}</style>
            </div>
          )}
          {error && !loading && (
            <div style={{ padding: 10, color: 'var(--red)', fontSize: 13 }}>
              Search error: {error}
            </div>
          )}
          {!loading && !error && results.length === 0 && query.trim().length >= MIN_CHARS && (
            <div style={{ padding: 10, color: 'var(--muted)', fontSize: 13 }}>No matches.</div>
          )}
          {results.map((r, i) => (
            <div
              key={`${r.place_id}-${i}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(r)}
              onMouseEnter={() => setHighlight(i)}
              style={{
                padding: '8px 10px',
                cursor: 'pointer',
                background: i === highlight ? 'var(--surface-2)' : 'transparent',
                borderBottom: '1px solid var(--border)',
                fontSize: 13,
              }}
            >
              <div style={{ fontWeight: 500 }}>{r.display_name.split(',')[0]}</div>
              <div style={{ color: 'var(--muted)', fontSize: 11 }}>
                {r.display_name.split(',').slice(1, 3).join(', ')}
              </div>
            </div>
          ))}
        </div>
      )}

      {coords && (
        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6, fontFamily: 'monospace' }}>
          {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}
        </div>
      )}
    </div>
  );
}
