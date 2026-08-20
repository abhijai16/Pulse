import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';

const MODULES = [
  {
    key: 'alertnow',
    path: '/report',
    icon: '📱',
    name: 'AlertNow',
    tagline: 'Citizen Reporting',
    sellable: 'Sellable as: Anonymous Hazard Reporting Tool',
    desc: 'One-tap incident submission with auto-captured GPS, photo upload, and end-to-end encryption when filed anonymously. Citizens get a tracking ID and live status updates.',
    accent: 'blue',     // blue
  },
  {
    key: 'respondops',
    path: '/ops',
    icon: '🚨',
    name: 'RespondOps',
    tagline: 'Responder Dispatch',
    sellable: 'Sellable as: Live Dispatch Console for Security Firms',
    desc: 'Severity-colored live map, drag-and-drop responder assignment, real-time status sync back to the reporter via Socket.io. Replaces radio + spreadsheet workflows.',
    accent: 'orange',   // red/orange
  },
  {
    key: 'pulseboard',
    path: '/admin',
    icon: '📊',
    name: 'PulseBoard',
    tagline: 'Analytics & Broadcast',
    sellable: 'Sellable as: Campus Safety Analytics & Mass-Alert SaaS',
    desc: 'Incident heatmap, repeated-incident clustering, response-time KPIs, radius-push geofenced alerts, and CSV/PDF exports for campus safety officers.',
    accent: 'purple',
  },
];

const FEATURE_BADGES = [
  '🤖 AI-Powered Triage',
  '📡 Real-Time Dispatch',
  '🔒 Anonymous & Encrypted',
  '📍 Geofenced Alerts',
  '� Predictive Analytics',
  '🌐 Offline-First Sync',
];

export default function Landing() {
  const [stats, setStats] = useState({
    total: null, active: null, avgMin: null, responders: null,
  });
  const [health, setHealth] = useState(null);

  useEffect(() => {
    Promise.all([
      api.metrics().catch(() => null),
      api.listResponders().catch(() => []),
    ]).then(([m, responders]) => {
      setStats({
        total: m?.total_incidents ?? null,
        active: m?.active_incidents ?? null,
        avgMin: m ? Math.round(m.avg_response_minutes) : null,
        responders: Array.isArray(responders) ? responders.length : null,
      });
    });
    fetch('/api/health').then(r => r.json()).then(setHealth).catch(() => setHealth({ ok: false }));
  }, []);

  return (
    <div className="landing">
      {/* ============ 1. HERO ============ */}
      <section className="hero">
        <div className="hero-bg" aria-hidden="true">
          <div className="hero-orb hero-orb-1" />
          <div className="hero-orb hero-orb-2" />
          <div className="hero-orb hero-orb-3" />
        </div>
        <div className="hero-inner">
          <div className="hero-eyebrow">⚡ Pulse · Smart India Hackathon Prototype</div>
          <h1 className="hero-title">
            Smart Campus<br />
            <span className="hero-title-grad">Emergency Response</span>
          </h1>
          <p className="hero-sub">
            Fast, anonymous incident reporting + real-time dispatch + analytics —
            one platform that closes the loop between citizens, responders, and
            campus safety officers in seconds.
          </p>
          <div className="hero-cta">
            <Link to="/report" className="cta cta-primary">Try the citizen app →</Link>
            <Link to="/ops" className="cta cta-ghost">Open dispatch console</Link>
          </div>
        </div>
      </section>

      {/* ============ 2. PROBLEM CONTEXT ============ */}
      <section className="problem">
        <div className="problem-inner">
          <div className="section-label">The gap on most campuses</div>
          <p className="problem-body">
            Today, emergencies are reported too slowly, harassment goes unspoken
            because there's no anonymous channel, and campus safety officers
            have no visibility into repeat hotspots. Pulse fixes all three —
            citizens report in one tap, responders see live maps, and admins
            spot patterns before they become incidents.
          </p>
        </div>
      </section>

      {/* ============ 3. THE 3 MODULES ============ */}
      <section className="modules">
        <div className="section-label">Three products. One platform.</div>
        <h2 className="section-h2">Each module is independently shippable.</h2>
        <div className="modules-grid">
          {MODULES.map((m) => (
            <Link key={m.key} to={m.path} className={`module-card module-${m.accent}`}>
              <div className="module-card-glow" aria-hidden="true" />
              <div className="module-icon">{m.icon}</div>
              <div className="module-tagline">{m.tagline}</div>
              <h3 className="module-name">{m.name}</h3>
              <p className="module-desc">{m.desc}</p>
              <div className="module-sellable">{m.sellable}</div>
              <div className="module-btn">Open {m.name} →</div>
            </Link>
          ))}
        </div>
      </section>

      {/* ============ 4. STATS BAR ============ */}
      <section className="statsbar">
        <Stat label="Incidents tracked"     value={stats.total} />
        <Stat label="Active incidents"      value={stats.active} accent="red" />
        <Stat label="Avg response time"     value={stats.avgMin != null ? `${stats.avgMin} min` : null} accent="green" />
        <Stat label="Available responders"  value={stats.responders} accent="blue" />
        <Stat label="Modules shipped"       value={3} accent="purple" />
      </section>

      {/* ============ 5. FEATURE BADGES ============ */}
      <section className="features">
        <div className="section-label">At a glance</div>
        <div className="feature-pills">
          {FEATURE_BADGES.map((f) => (
            <span key={f} className="pill">{f}</span>
          ))}
        </div>
      </section>

      {/* ============ FOOTER ============ */}
      <footer className="landing-footer">
        <div>⚡ Pulse · built for Smart India Hackathon</div>
        <div className="footer-status">
          API: {health == null
            ? <span className="dot dot-pending" />
            : health.ok
              ? <><span className="dot dot-ok" /> connected</>
              : <><span className="dot dot-bad" /> unreachable</>}
        </div>
      </footer>
    </div>
  );
}

function Stat({ label, value, accent }) {
  return (
    <div className={`stat-tile ${accent ? `stat-${accent}` : ''}`}>
      <div className="stat-v">{value ?? '—'}</div>
      <div className="stat-l">{label}</div>
    </div>
  );
}
