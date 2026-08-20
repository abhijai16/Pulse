import { Routes, Route, NavLink, Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { socket } from './lib/socket.js';
import AlertNow from './modules/alertnow/AlertNow.jsx';
import RespondOps from './modules/respondops/RespondOps.jsx';
import PulseBoard from './modules/pulseboard/PulseBoard.jsx';
import BroadcastListener from './components/BroadcastListener.jsx';

export default function App() {
  return (
    <>
      <BroadcastListener />
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/report" element={<Shell><AlertNow /></Shell>} />
        <Route path="/track/:trackingId?" element={<Shell><AlertNow /></Shell>} />
        <Route path="/ops" element={<Shell><RespondOps /></Shell>} />
        <Route path="/admin" element={<Shell><PulseBoard /></Shell>} />
      </Routes>
    </>
  );
}

function Shell({ children }) {
  return (
    <>
      <header className="topbar">
        <Link to="/" className="brand">⚡ Pulse</Link>
        <nav>
          <NavLink to="/report" className={({ isActive }) => isActive ? 'active' : ''}>Report</NavLink>
          <NavLink to="/ops" className={({ isActive }) => isActive ? 'active' : ''}>Dispatch</NavLink>
          <NavLink to="/admin" className={({ isActive }) => isActive ? 'active' : ''}>Admin</NavLink>
        </nav>
      </header>
      <main className="page">{children}</main>
    </>
  );
}

function Landing() {
  const [health, setHealth] = useState(null);
  useEffect(() => {
    fetch('/api/health').then(r => r.json()).then(setHealth).catch(() => setHealth({ ok: false }));
  }, []);
  useEffect(() => {
    const onConnect = () => console.log('[socket] connected');
    socket.on('connect', onConnect);
    return () => socket.off('connect', onConnect);
  }, []);
  return (
    <div className="page">
      <h1 className="page-title">Smart Campus Emergency Response</h1>
      <p className="page-sub">
        Three products on one platform. Pick the one that fits your role for the demo.
      </p>
      <div className="grid cols-3" style={{ marginTop: 32 }}>
        <Link to="/report" className="card">
          <div style={{ fontSize: 28 }}>📱</div>
          <h2 style={{ marginTop: 12 }}>AlertNow</h2>
          <p style={{ color: 'var(--muted)' }}>Citizen reporting — submit and track incidents anonymously.</p>
        </Link>
        <Link to="/ops" className="card">
          <div style={{ fontSize: 28 }}>🚨</div>
          <h2 style={{ marginTop: 12 }}>RespondOps</h2>
          <p style={{ color: 'var(--muted)' }}>Dispatch console — live map, assign responders, real-time status.</p>
        </Link>
        <Link to="/admin" className="card">
          <div style={{ fontSize: 28 }}>📊</div>
          <h2 style={{ marginTop: 12 }}>PulseBoard</h2>
          <p style={{ color: 'var(--muted)' }}>Analytics — heatmap, response metrics, mass broadcast, exports.</p>
        </Link>
      </div>
      <div style={{ marginTop: 32, color: 'var(--muted)', fontSize: 13 }}>
        API status: {health ? (health.ok ? '✅ connected' : '❌ unreachable') : 'checking…'}
      </div>
    </div>
  );
}
