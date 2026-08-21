import { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';

// My Contributions — visible only to the authenticated user (the route
// is gated by RequireAuth, and the backend endpoint is keyed on req.userId).
// Shows the +1-per-resolved-pledge credit count plus a short history of
// incidents they pledged on. No public leaderboard, no editing.
export default function Profile() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    api.myContributions()
      .then((d) => setData(d || { user: { credits: 0 }, recentIncidents: [] }))
      .catch((e) => setErr(e.message));
  }, []);

  if (err) {
    return (
      <div className="card">
        <h3 style={{ margin: '0 0 8px 0', fontSize: 16, fontWeight: 600, color: 'var(--red)' }}>
          Couldn't load your contributions
        </h3>
        <p style={{ color: 'var(--muted)', fontSize: 14, margin: 0 }}>
          {err}
        </p>
        <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 12, marginBottom: 0 }}>
          If you just updated the backend, run <code>npm run migrate</code> in
          the <code>backend/</code> folder so the new <code>credits</code>{' '}
          column is added to the <code>users</code> table.
        </p>
      </div>
    );
  }
  if (!data) return <div className="card">Loading…</div>;

  // Defensive defaults so a partial response from the backend can never
  // produce a black screen — the destructure would throw otherwise and
  // unmount the whole React tree above (topbar included).
  const user = data.user || {};
  const recentIncidents = Array.isArray(data.recentIncidents) ? data.recentIncidents : [];
  const credits = Number.isFinite(user.credits) ? user.credits : 0;

  return (
    <>
      <h1 className="page-title">My Contributions</h1>
      <p className="page-sub">
        Visible only to you. Your credits count one incident you've helped with
        that was later resolved by an official responder.
      </p>

      <div className="grid cols-2" style={{ marginBottom: 16 }}>
        <div className="stat">
          <div className="v">{credits}</div>
          <div className="l">Credits earned</div>
        </div>
        <div className="stat">
          <div className="v">{recentIncidents.length}</div>
          <div className="l">Recent pledges</div>
        </div>
      </div>

      <div className="card">
        <h3 style={{ margin: '0 0 12px 0', fontSize: 16, fontWeight: 600 }}>
          Incidents you responded to
        </h3>
        {recentIncidents.length === 0 ? (
          <p style={{ color: 'var(--muted)', fontSize: 14, margin: 0 }}>
            You haven't pledged on any incidents yet. Tap "I'm responding" on
            an incident to start contributing.
          </p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr
                style={{
                  textAlign: 'left',
                  color: 'var(--muted)',
                  fontSize: 11,
                  textTransform: 'uppercase',
                  letterSpacing: 1,
                }}
              >
                <th style={{ padding: '8px 0' }}>Tracking ID</th>
                <th>Category</th>
                <th>Status</th>
                <th>Pledged</th>
                <th>Resolved</th>
              </tr>
            </thead>
            <tbody>
              {recentIncidents.map((i) => (
                <tr key={i.id} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '10px 0', fontFamily: 'monospace' }}>
                    {i.tracking_id}
                  </td>
                  <td>{i.category}</td>
                  <td>
                    <span className={`badge ${i.status}`}>{i.status}</span>
                  </td>
                  <td>{new Date(i.pledged_at).toLocaleString()}</td>
                  <td>
                    {i.resolved_at
                      ? new Date(i.resolved_at).toLocaleString()
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
