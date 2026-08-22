import { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import LiveMicDetector from './LiveMicDetector.jsx';
import SimulateDetection from './SimulateDetection.jsx';

// Audio Sentry — dedicated /audio route.
//
// Layout: two-column. Left column = the live microphone detector +
// the simulator card stacked. Right column = recent acoustic event
// log. The right column auto-refreshes on every successful detection
// (LiveMicDetector calls onDetection, which re-fetches) and on
// every successful simulation (SimulateDetection calls onSimulated).

export default function AudioSentry() {
  const [events, setEvents] = useState([]);
  const [stats, setStats] = useState(null);
  const [sensorLocation, setSensorLocation] = useState('Zone 4 - Academic Quad (Mic Sensor 01)');
  const [loading, setLoading] = useState(true);

  async function refresh() {
    try {
      const [ev, st] = await Promise.all([
        api.recentAudio(8),
        api.audioStats(),
      ]);
      setEvents(Array.isArray(ev) ? ev : []);
      setStats(st);
    } catch {
      // Audio service may not be up yet — render gracefully.
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(); }, []);

  return (
    <>
      <h1 className="page-title">Audio Sentry · Acoustic Distress</h1>
      <p className="page-sub">
        Continuous microphone monitoring, keyword detection, and
        automatic agency dispatch — turned into real Pulse incidents.
      </p>

      <div style={{
        display: 'grid',
        gridTemplateColumns: '1.4fr 1fr',
        gap: 16,
      }}>
        {/* LEFT — live mic + simulator */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card">
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap',
            }}>
              <span style={{
                fontSize: 10, fontWeight: 800, letterSpacing: '0.2em',
                textTransform: 'uppercase', color: 'var(--accent)',
              }}>
                Sensor config
              </span>
            </div>
            <label style={{
              fontSize: 10, fontWeight: 700, letterSpacing: '0.16em',
              textTransform: 'uppercase', color: 'var(--muted)',
            }}>
              Sensor label (where the mic lives)
            </label>
            <input
              type="text"
              value={sensorLocation}
              onChange={(e) => setSensorLocation(e.target.value)}
              placeholder="e.g. Library East Wing — Mic 03"
              style={{
                width: '100%', background: 'var(--bg)',
                border: '1px solid var(--border)', borderRadius: 8,
                padding: '8px 10px', fontSize: 13, color: 'var(--text)', marginTop: 6,
              }}
            />
          </div>

          <LiveMicDetector sensorLocation={sensorLocation} onDetection={refresh} />
          <SimulateDetection onSimulated={refresh} />
        </div>

        {/* RIGHT — recent log + stats */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card">
            <h3 style={{ marginTop: 0 }}>24-hour stats</h3>
            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--accent)' }}>
                  {stats?.last24h ?? '—'}
                </div>
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>Acoustic triggers</div>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--green)' }}>
                  {events.length}
                </div>
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>In this session</div>
              </div>
            </div>
          </div>

          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <h3 style={{ margin: 0 }}>Recent acoustic events</h3>
              <button
                type="button"
                onClick={refresh}
                style={{ fontSize: 11, padding: '4px 10px' }}
              >
                Refresh
              </button>
            </div>
            <div style={{ maxHeight: 520, overflowY: 'auto' }}>
              {loading ? (
                <div style={{ color: 'var(--muted)', fontSize: 12 }}>Loading…</div>
              ) : events.length === 0 ? (
                <div style={{ color: 'var(--muted)', fontSize: 12, padding: 24, textAlign: 'center' }}>
                  No acoustic events yet. Start the microphone or trigger a
                  simulation — every keyword creates a Pulse incident and
                  appears here within ~1s.
                </div>
              ) : (
                events.map((e) => (
                  <div
                    key={e.id}
                    style={{
                      padding: 10, marginBottom: 6,
                      background: 'var(--bg)', border: '1px solid var(--border)',
                      borderRadius: 8, fontSize: 12,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <span style={{
                        fontSize: 10, fontWeight: 800, letterSpacing: '0.16em',
                        textTransform: 'uppercase',
                        color: e.source === 'SIMULATION' ? 'var(--amber)' : 'var(--accent)',
                        background: e.source === 'SIMULATION' ? 'rgba(245,166,35,0.15)' : 'var(--accent-soft)',
                        padding: '2px 8px', borderRadius: 6,
                      }}>
                        {e.detected_keyword}
                      </span>
                      <span style={{ fontSize: 10, fontFamily: 'monospace', color: 'var(--muted)' }}>
                        {new Date(e.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    <div style={{ color: 'var(--text)', fontWeight: 600 }}>
                      📍 {e.sensor_location}
                    </div>
                    {e.raw_transcript && (
                      <div style={{ color: 'var(--muted)', fontStyle: 'italic', marginTop: 2 }}>
                        "{e.raw_transcript}"
                      </div>
                    )}
                    <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 4 }}>
                      source: {e.source} · confidence: {Math.round((e.confidence_score || 0) * 100)}%
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
