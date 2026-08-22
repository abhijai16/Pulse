import { useState } from 'react';
import { api } from '../../lib/api.js';

// Manual acoustic distress trigger for demos and dispatcher testing.
// Click a keyword, set a confidence, type a sensor location, hit trigger
// — the same /api/audio/voice-detect path runs (well, /api/audio/simulate
// here, source=SIMULATION) and a real Pulse incident lands in the
// console within ~1s over Socket.io.

const KEYWORDS = [
  { value: 'HELP', label: 'HELP — general emergency' },
  { value: 'FIRE', label: 'FIRE — fire / smoke' },
  { value: 'POLICE', label: 'POLICE — security threat' },
  { value: 'GUNSHOT', label: 'GUNSHOT — critical weapon' },
  { value: 'AMBULANCE', label: 'AMBULANCE — medical' },
  { value: 'INTRUDER', label: 'INTRUDER — security threat' },
];

export default function SimulateDetection({ onSimulated, compact = false }) {
  const [keyword, setKeyword] = useState('FIRE');
  const [confidence, setConfidence] = useState('0.96');
  const [location, setLocation] = useState('Zone 4 - Academic Quad');
  const [transcript, setTranscript] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  async function handleSimulate() {
    setLoading(true);
    setError(null);
    try {
      const data = await api.simulateAudio({
        keyword,
        confidence: Number(confidence),
        location,
        rawTranscript: transcript || `Simulated distress: ${keyword}`,
      });
      setResult(data);
      onSimulated?.(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  const labelStyle = {
    fontSize: 10, fontWeight: 700, letterSpacing: '0.16em',
    textTransform: 'uppercase', color: 'var(--muted)',
    display: 'block', marginBottom: 4,
  };

  const inputStyle = {
    width: '100%', background: 'var(--bg)',
    border: '1px solid var(--border)', borderRadius: 8,
    padding: '8px 10px', fontSize: 13, color: 'var(--text)',
  };

  return (
    <div className="card">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <span style={{ fontSize: 16 }}>📡</span>
        <h3 style={{ margin: 0, fontSize: 14 }}>
          {compact ? 'Acoustic simulation' : 'Simulate Acoustic Distress Event'}
        </h3>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: compact ? '1fr' : 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: 10, marginBottom: 12,
      }}>
        <div>
          <label style={labelStyle}>Keyword</label>
          <select value={keyword} onChange={(e) => setKeyword(e.target.value)} style={inputStyle}>
            {KEYWORDS.map((k) => (
              <option key={k.value} value={k.value}>{k.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label style={labelStyle}>Confidence (0.5–1.0)</label>
          <input
            type="number" step="0.01" min="0.5" max="1.0"
            value={confidence}
            onChange={(e) => setConfidence(e.target.value)}
            style={inputStyle}
          />
        </div>

        <div>
          <label style={labelStyle}>Sensor location</label>
          <input
            type="text" value={location}
            onChange={(e) => setLocation(e.target.value)}
            style={inputStyle}
          />
        </div>
      </div>

      {!compact && (
        <div style={{ marginBottom: 12 }}>
          <label style={labelStyle}>Spoken transcript (optional)</label>
          <input
            type="text" value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            placeholder="e.g. Fire in the building!"
            style={inputStyle}
          />
        </div>
      )}

      <button
        type="button"
        onClick={handleSimulate}
        disabled={loading}
        className="primary"
        style={{ width: '100%' }}
      >
        {loading ? 'Dispatching…' : 'Trigger Simulation Event'}
      </button>

      {result && (
        <div style={{
          marginTop: 10, padding: 10,
          background: 'rgba(46,204,113,0.10)', border: '1px solid rgba(46,204,113,0.35)',
          borderRadius: 8, fontSize: 12, color: 'var(--green)', fontWeight: 600,
        }}>
          ✓ Incident <span style={{ fontFamily: 'monospace' }}>{result.trackingId}</span> created —{' '}
          category <strong>{result.category}</strong>, severity{' '}
          <span className={`badge ${result.severity}`} style={{ marginLeft: 4 }}>{result.severity}</span>
        </div>
      )}

      {error && (
        <div style={{
          marginTop: 10, padding: 10,
          background: 'rgba(255,77,77,0.10)', border: '1px solid rgba(255,77,77,0.35)',
          borderRadius: 8, fontSize: 12, color: 'var(--red)',
        }}>
          {error}
        </div>
      )}
    </div>
  );
}
