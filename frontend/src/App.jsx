import { Routes, Route, NavLink, Link, useNavigate } from 'react-router-dom';
import AlertNow from './modules/alertnow/AlertNow.jsx';
import RespondOps from './modules/respondops/RespondOps.jsx';
import PulseBoard from './modules/pulseboard/PulseBoard.jsx';
import BroadcastListener from './components/BroadcastListener.jsx';
import BackgroundPattern from './components/BackgroundPattern.jsx';
import RequireAuth from './components/RequireAuth.jsx';
import Landing from './pages/Landing.jsx';
import Auth from './pages/Auth.jsx';
import { AuthProvider, useAuth } from './lib/useAuth.jsx';

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
        <Link to="/" className="brand">⚡ Pulse</Link>
        <nav>
          <NavLink to="/report" className={({ isActive }) => isActive ? 'active' : ''}>Report</NavLink>
          <NavLink to="/ops" className={({ isActive }) => isActive ? 'active' : ''}>Dispatch</NavLink>
          <NavLink to="/admin" className={({ isActive }) => isActive ? 'active' : ''}>Admin</NavLink>
        </nav>
        <div className="topbar-auth">
          {ready && user ? (
            <>
              <span className="topbar-user" title={user.email}>{user.name}</span>
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
