import { Routes, Route, NavLink, Link, useNavigate } from 'react-router-dom';
import AlertNow from './modules/alertnow/AlertNow.jsx';
import RespondOps from './modules/respondops/RespondOps.jsx';
import PulseBoard from './modules/pulseboard/PulseBoard.jsx';
import Profile from './modules/profile/Profile.jsx';
import BroadcastListener from './components/BroadcastListener.jsx';
import BackgroundPattern from './components/BackgroundPattern.jsx';
import RequireAuth from './components/RequireAuth.jsx';
import Landing from './pages/Landing.jsx';
import Auth from './pages/Auth.jsx';
import { AuthProvider, useAuth } from './lib/useAuth.jsx';
import { useReportLocation } from './lib/useReportLocation.js';

export default function App() {
  return (
    <AuthProvider>
      {/* Mounted ONCE at the App root so the faint Bhubaneswar street-line
          texture sits behind every route (Landing, AlertNow, RespondOps,
          PulseBoard). position:fixed + z-index:0 keeps it pinned to the
          viewport and at the very bottom of the visual stack — page content
          stacks above at z-index >= 1. pointer-events:none so it never
          intercepts clicks on the Leaflet maps in RespondOps / PulseBoard. */}
      <BackgroundPattern />
      <BroadcastListener />
      <LocationReporter />
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Auth />} />
        <Route path="/report" element={<Shell><AlertNow /></Shell>} />
        <Route path="/track/:trackingId?" element={<Shell><AlertNow /></Shell>} />
        <Route
          path="/ops"
          element={<RequireAuth><Shell><RespondOps /></Shell></RequireAuth>}
        />
        <Route
          path="/admin"
          element={<RequireAuth><Shell><PulseBoard /></Shell></RequireAuth>}
        />
        <Route
          path="/profile"
          element={<RequireAuth><Shell><Profile /></Shell></RequireAuth>}
        />
      </Routes>
    </AuthProvider>
  );
}

function Shell({ children }) {
  const { user, logout, ready } = useAuth();
  const navigate = useNavigate();
  return (
    <>
      <header className="topbar">
        <Link to="/" className="brand">
          {/* Compact icon-only logo mark (the pin + heartbeat from logo.png),
              sized to sit flush with the wordmark image without pushing the
              navbar taller. */}
          <img src="/logo.png" alt="Pulse" className="brand-mark" />
          <img src="/wordmark.png" alt="Pulse" className="brand-wordmark" />
        </Link>
        <nav>
          <NavLink to="/report" className={({ isActive }) => isActive ? 'active' : ''}>Report</NavLink>
          <NavLink to="/ops" className={({ isActive }) => isActive ? 'active' : ''}>Dispatch</NavLink>
          <NavLink to="/admin" className={({ isActive }) => isActive ? 'active' : ''}>Admin</NavLink>
        </nav>
        <div className="topbar-auth">
          {ready && user ? (
            <>
              <Link to="/profile" className="topbar-user" title={user.email} style={{ textDecoration: 'none' }}>
                {user.name}
              </Link>
              <button
                type="button"
                className="topbar-btn topbar-btn-ghost"
                onClick={async () => {
                  await logout();
                  navigate('/');
                }}
              >
                Log out
              </button>
            </>
          ) : ready ? (
            <Link to="/login" className="topbar-btn topbar-btn-primary">Log in</Link>
          ) : null}
        </div>
      </header>
      <main className="page">{children}</main>
    </>
  );
}

// Background location reporter. Renders nothing — the hook is the
// component. It pushes the user's lat/lng to the backend every 60s
// (or 25m of movement, whichever first) so the 200m radius query can
// find this user when a medical/harassment incident lands nearby.
function LocationReporter() {
  useReportLocation();
  return null;
}
