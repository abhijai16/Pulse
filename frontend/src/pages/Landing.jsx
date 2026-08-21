import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import LiveMapShowcase from '../components/LiveMapShowcase.jsx';
import HeroMapBackground from '../components/HeroMapBackground.jsx';

// Both homepage map components used to be lazy-loaded so the Leaflet bundle
// (~150KB JS) didn't block first paint. After the SVG rewrite they have no
// map-library dep at all, so direct imports keep the page simpler — no
// Suspense fallbacks, no flash of "Loading live map…".
// Live, interactive Leaflet maps still load on RespondOps and PulseBoard
// (see those route modules), where they're functionally necessary.

const MODULES = [
  {
    key: 'alertnow',
    path: '/report',
    icon: '📱',
    name: 'AlertNow',
    tagline: 'Citizen Reporting',
    sellable: 'Sellable as: Anonymous Hazard Reporting Tool',
    desc: 'One-tap incident submission with auto-captured GPS, photo upload, and end-to-end encryption when filed anonymously. Citizens get a tracking ID and live status updates.',
  },
  {
    key: 'respondops',
    path: '/ops',
    icon: '🚨',
    name: 'RespondOps',
    tagline: 'Responder Dispatch',
    sellable: 'Sellable as: Live Dispatch Console for Security Firms',
    desc: 'Severity-colored live map, drag-and-drop responder assignment, real-time status sync back to the reporter via Socket.io. Replaces radio + spreadsheet workflows.',
  },
  {
    key: 'pulseboard',
    path: '/admin',
    icon: '📊',
    name: 'PulseBoard',
    tagline: 'Analytics & Broadcast',
    sellable: 'Sellable as: Campus Safety Analytics & Mass-Alert SaaS',
    desc: 'Incident heatmap, repeated-incident clustering, response-time KPIs, radius-push geofenced alerts, and CSV/PDF exports for campus safety officers.',
  },
];

// Three feature callouts between hero and the module row. Citizen.com style:
// icon + bold one-line headline + 1-2 sentence subhead. Each pairs with the
// closest module so the funnel is obvious.
const FEATURE_CALLOUTS = [
  {
    icon: '⚡',
    title: 'Reported in seconds, not minutes',
    body: 'One-tap form with auto-captured GPS, smart category picker, and optional photo. Average time-to-submit under 20 seconds.',
  },
  {
    icon: '🎯',
    title: 'AI severity triage before dispatch',
    body: 'Keyword-weighted NLP scores each report as critical / high / medium / low with explainable reasons. Dispatchers see priority at a glance.',
  },
  {
    icon: '📡',
    title: 'Geofenced broadcasts reach every phone',
    body: 'Push alerts to anyone inside a radius around an incident. Used for lockdowns, weather, hazmat, repeat-offender locations.',
  },
];

// Pretty category name for the social proof row
function categoryLabel(c) {
  return ({
    fire: 'Fire',
    medical: 'Medical',
    harassment: 'Harassment',
    unsafe_area: 'Unsafe area',
    infra: 'Infrastructure',
  })[c] || c;
}

function formatLocation(loc) {
  if (!loc) return 'Campus';
  return loc.split(',')[0].trim();
}

function formatResponseTime(min) {
  if (min == null) return null;
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min`;
  const hrs = Math.floor(min / 60);
  const rem = min % 60;
  return rem === 0 ? `${hrs} h` : `${hrs} h ${rem} m`;
}

export default function Landing() {
  const [stats, setStats] = useState({
    total: null, active: null, avgMin: null, responders: null,
  });
  const [health, setHealth] = useState(null);
  const [activeCount, setActiveCount] = useState(null);
  const [resolved, setResolved] = useState([]);

  useEffect(() => {
    Promise.all([
      api.metrics().catch(() => null),
      api.listResponders().catch(() => []),
      api.recentReports().catch(() => []),
    ]).then(([m, responders, reports]) => {
      setStats({
        total: m?.total_incidents ?? null,
        active: m?.active_incidents ?? null,
        avgMin: m ? Math.round(m.avg_response_minutes) : null,
        responders: Array.isArray(responders) ? responders.length : null,
      });
      if (Array.isArray(m?.active_incidents) === false && typeof m?.active_incidents === 'number') {
        setActiveCount(m.active_incidents);
      }
      // Pull the resolved incidents with response minutes for "See it in action"
      const done = (Array.isArray(reports) ? reports : [])
        .filter((r) => r.status === 'resolved' && r.response_minutes != null)
        .slice(0, 4);
      setResolved(done);
    });
    fetch('/api/health').then(r => r.json()).then(setHealth).catch(() => setHealth({ ok: false }));
    fetch('/api/incidents?status=active').then(r => r.json()).then((d) => {
      if (Array.isArray(d)) setActiveCount(d.length);
    }).catch(() => {});
  }, []);

  // Prefer live active count; fall back to metrics aggregate
  const liveActive = activeCount ?? stats.active;

  return (
    <div className="landing">
      {/* ============ 0. NAVBAR ============ */}
      <header className="lnav">
        <div className="lnav-inner">
          <Link to="/" className="lnav-brand">
            <span className="lnav-brand-mark">⚡</span>
            <span className="lnav-brand-name">Pulse</span>
          </Link>
          <nav className="lnav-links">
            <a href="#modules">Modules</a>
            <a href="#live">Live</a>
            <a href="#activity">Activity</a>
            <a href="#stats">Numbers</a>
          </nav>
          <Link to="/ops" className="lnav-cta">View Live Demo →</Link>
        </div>
      </header>

      {/* ============ 1. HERO ============ */}
      <section className="lhero">
        <div className="lhero-bg" aria-hidden="true">
          <HeroMapBackground />
          <div className="lhero-orb lhero-orb-a" />
          <div className="lhero-orb lhero-orb-b" />
        </div>
        <div className="lhero-inner">
          <div className={`live-pill ${liveActive != null ? 'live-pill-on' : ''}`}>
            <span className="live-pill-dot" />
            <span>LIVE</span>
            <span className="live-pill-sep">·</span>
            <span className="live-pill-ct">
              {liveActive != null ? `${liveActive} active incidents` : 'connecting…'}
            </span>
          </div>
          <h1 className="lhero-title">
            Report it.<br />
            Route it.<br />
            <span className="lhero-title-accent">Resolve it.</span>
          </h1>
          <p className="lhero-sub">
            Smart Campus Emergency Response — citizens report in one tap,
            responders see a live map, and safety officers spot patterns
            before they become incidents. Built for the moments that matter.
          </p>
          <div className="lhero-cta">
            <Link to="/report" className="cta cta-primary cta-lg">File a report →</Link>
            <Link to="/ops" className="cta cta-ghost cta-lg">Open dispatch</Link>
          </div>
          <div className="lhero-trust">
            <span>🔒 AES-256 encrypted</span>
            <span>•</span>
            <span>⚡ Real-time Socket.io</span>
            <span>•</span>
            <span>🤖 AI-prioritized</span>
          </div>
        </div>
      </section>

      {/* ============ 2. CURVED BREAK → LIVE MAP ============ */}
      <div className="lcurve-top" aria-hidden="true" />

      <section className="llive" id="live">
        <div className="llive-inner">
          <div className="section-label">Live now</div>
          <h2 className="section-h2">A real map, showing real incidents, in real time.</h2>
          <p className="llive-sub">
            Real campus reports from the last 30 days — plotted on a live
            map centered on your current location, updated over Socket.io
            the moment a new one arrives. No mockup. No stock photo.
          </p>
          <div className="llive-card">
            <LiveMapShowcase />
          </div>
        </div>
      </section>

      <div className="lcurve-bottom" aria-hidden="true" />

      {/* ============ 3. FEATURE CALLOUTS (3 icon-led rows) ============ */}
      <section className="lfeatures">
        <div className="lfeatures-inner">
          {FEATURE_CALLOUTS.map((f, i) => (
            <div key={f.title} className={`lfeature lfeature-${i % 2 === 0 ? 'left' : 'right'}`}>
              <div className="lfeature-icon">{f.icon}</div>
              <div>
                <h3 className="lfeature-title">{f.title}</h3>
                <p className="lfeature-body">{f.body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ============ 4. THREE PRODUCTS ICON-TRIPLET ROW ============ */}
      <section className="lmodules" id="modules">
        <div className="lmodules-inner">
          <div className="section-label">Three products. One platform.</div>
          <h2 className="section-h2">
            Each module ships independently — <span className="dim">buy one, deploy it tomorrow.</span>
          </h2>
          <div className="lmodules-grid">
            {MODULES.map((m) => (
              <Link key={m.key} to={m.path} className="lmodule-card">
                <div className="lmodule-icon">{m.icon}</div>
                <div className="lmodule-tagline">{m.tagline}</div>
                <h3 className="lmodule-name">{m.name}</h3>
                <p className="lmodule-desc">{m.desc}</p>
                <div className="lmodule-sellable">{m.sellable}</div>
                <div className="lmodule-arrow">Open {m.name} →</div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ============ 5. "SEE IT IN ACTION" SOCIAL PROOF ROW ============ */}
      <section className="lactivity" id="activity">
        <div className="lactivity-inner">
          <div className="section-label">See it in action</div>
          <h2 className="section-h2">Recent campus incidents — resolved in minutes, not hours.</h2>
          {resolved.length > 0 ? (
            <div className="lactivity-grid">
              {resolved.map((r) => (
                <div key={r.id} className="lactivity-card">
                  <div className="lactivity-cat-dot" data-cat={r.category} />
                  <div className="lactivity-body">
                    <div className="lactivity-title">
                      {categoryLabel(r.category)} · {formatLocation(r.location_label)}
                    </div>
                    <div className="lactivity-meta">
                      Resolved in <strong>{formatResponseTime(r.response_minutes)}</strong>
                    </div>
                  </div>
                  <div className="lactivity-status">✓</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="lactivity-empty">
              Recent incidents will appear here as soon as a few reports are filed and resolved.
            </div>
          )}
        </div>
      </section>

      {/* ============ 6. STATS BAR ============ */}
      <section className="lstats" id="stats">
        <div className="lstats-inner">
          <Stat label="Incidents tracked"    value={stats.total} />
          <Stat label="Active right now"    value={liveActive} accent="red" urgent />
          <Stat label="Avg response"        value={stats.avgMin != null ? `${stats.avgMin} min` : null} accent="green" />
          <Stat label="Responders on duty"  value={stats.responders} accent="blue" />
          <Stat label="Modules shipped"     value={3} accent="purple" />
        </div>
      </section>

      {/* ============ FOOTER ============ */}
      <footer className="lfooter">
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

function Stat({ label, value, accent, urgent }) {
  return (
    <div className={`lstat ${accent ? `lstat-${accent}` : ''} ${urgent ? 'lstat-urgent' : ''}`}>
      <div className="lstat-v">{value ?? '—'}</div>
      <div className="lstat-l">{label}</div>
    </div>
  );
}