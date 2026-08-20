import { useState, useEffect, useRef } from 'react';

// OpenStreetMap Nominatim autocomplete.
// - Free public endpoint, no API key.
// - Debounced 300ms per the usage policy (<1 req/sec).
// - Biased toward Bhubaneswar via viewbox + bounded=1.
// - Selecting a result calls onSelect({ lat, lng, label }).
// - Parent supplies the currently-known coords (from GPS) so we can show
//   "use my GPS" as a quick action when no text match is desired.

const BHUBANESWAR_VIEWBOX = '85.75,20.30,85.90,20.45'; // [W,N,E,S] in Nominatim order
const DEBOUNCE_MS = 300;

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

  // Debounced search — fires 300ms after the user stops typing.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim() || query.trim().length < 3) {
      setResults([]);
      setOpen(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    debounceRef.current = setTimeout(() => doSearch(query), DEBOUNCE_MS);
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
    // cancel any in-flight request before starting a new one
    if (abortRef.current) abortRef.current.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    // Respect Nominatim usage policy: identify via User-Agent header where
    // possible (browsers strip it, but the Referer helps), and limit to ~5 hits.
    const url =
      `https://nominatim.openstreetmap.org/search?format=json&limit=5` +
      `&q=${encodeURIComponent(q)}` +
      `&viewbox=${BHUBANESWAR_VIEWBOX}&bounded=1` +
      `&addressdetails=1`;
    try {
      const res = await fetch(url, { signal: ac.signal });
      if (!res.ok) throw new Error(`Nominatim ${res.status}`);
      const data = await res.json();
      setResults(Array.isArray(data) ? data : []);
      setOpen(true);
      setHighlight(0);
      setError(null);
    } catch (err) {
      if (err.name !== 'AbortError') {
        setError(err.message || 'search failed');
        setResults([]);
      }
    } finally {
      setLoading(false);
    }
  }

  function pick(r) {
    const lat = parseFloat(r.lat);
    const lng = parseFloat(r.lon);
    onSelect({ lat, lng, label: r.display_name });
    setQuery(r.display_name.split(',').slice(0, 2).join(', ')); // keep short
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

      {open && (loading || results.length > 0 || error) && (
        <div
          style={{
            position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 8, boxShadow: 'var(--shadow)',
            zIndex: 100, maxHeight: 240, overflowY: 'auto',
          }}
        >
          {loading && (
            <div style={{ padding: 10, color: 'var(--muted)', fontSize: 13 }}>Searching…</div>
          )}
          {error && !loading && (
            <div style={{ padding: 10, color: 'var(--red)', fontSize: 13 }}>
              Search error: {error}
            </div>
          )}
          {!loading && !error && results.length === 0 && query.trim().length >= 3 && (
            <div style={{ padding: 10, color: 'var(--muted)', fontSize: 13 }}>No matches.</div>
          )}
          {results.map((r, i) => (
            <div
              key={`${r.place_id}-${i}`}
              onMouseDown={(e) => e.preventDefault()} /* don't blur input */
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
