// Redirects unauthenticated users to /login while preserving the original
// destination in `state.from` so the login page can bounce them back.
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/useAuth.jsx';

export default function RequireAuth({ children }) {
  const { user, ready } = useAuth();
  const location = useLocation();
  if (!ready) return null; // first render — wait for /me before deciding
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return children;
}
