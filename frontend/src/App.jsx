import { Routes, Route, NavLink, Link } from 'react-router-dom';
import AlertNow from './modules/alertnow/AlertNow.jsx';
import RespondOps from './modules/respondops/RespondOps.jsx';
import PulseBoard from './modules/pulseboard/PulseBoard.jsx';
import BroadcastListener from './components/BroadcastListener.jsx';
import Landing from './pages/Landing.jsx';

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
