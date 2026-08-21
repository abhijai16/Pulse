import { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import { socket, joinTrackingRoom } from '../../lib/socket.js';
import { useAuth } from '../../lib/useAuth.jsx';
import GeofenceBanner from './GeofenceBanner.jsx';

const STATUS_FLOW = ['new', 'dispatched', 'on_scene', 'resolved'];

export default function TrackingView({ trackingId, onReset }) {
  const [incident, setIncident] = useState(null);
  const [liveUpdate, setLiveUpdate] = useState(null);
  const [error, setError] = useState(null);
  // Community-pledge state. Only relevant when the viewer is logged in
  // AND the incident is still open. `pledged` is "I already pressed
  // the button"; `count` is total volunteers (including me); `pledgers`
  // is the small name list.
  const [pledgeState, setPledgeState] = useState({ pledged: false, count: 0, pledgers: [] });
  const [pledging, setPledging] = useState(false);
  const [pledgeError, setPledgeError] = useState(null);
  const { user } = useAuth();

  async function load() {
    try {
      setIncident(await api.getReport(trackingId));
    } catch (err) {
      setError(err.message);
    }
  }

  async function loadPledges() {
    if (!user) return;
    try {
      const s = await api.pledges(incident?.id);
      setPledgeState((prev) => ({
        count: s.count,
        pledgers: s.pledgers,
        pledged: prev.pledged || s.pledgers.some((p) => p.id === user.id),
      }));
    } catch {
      // 401/404 — view without the widget
    }
  }

  useEffect(() => {
    load();
    joinTrackingRoom(trackingId);
    const statusHandler = (payload) => {
      if (payload.tracking_id === trackingId) {
        setLiveUpdate(payload);
        load();
      }
    };
    const volunteerHandler = (payload) => {
      if (payload.trackingId === incident?.id) {
        setPledgeState((prev) => ({
          count: payload.count,
          pledgers: payload.pledgers,
          // Only re-derive `pledged` if the count grew — if it shrank
          // (shouldn't happen yet, but future-proof) keep my own state.
          pledged: prev.pledged || payload.pledgers.some((p) => p.id === user?.id),
        }));
      }
    };
    socket.on('incident:status', statusHandler);
    socket.on('incident:volunteer_joined', volunteerHandler);
    return () => {
      socket.off('incident:status', statusHandler);
      socket.off('incident:volunteer_joined', volunteerHandler);
    };
  }, [trackingId, incident?.id, user?.id]);

  // After we have the incident id, pull the current pledge state.
  useEffect(() => {
    if (incident?.id && user) loadPledges();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incident?.id, user?.id]);

  async function onPledge() {
    if (!incident || !user || pledging) return;
    setPledgeError(null);
    setPledging(true);
    try {
      const s = await api.pledge(incident.id);
      setPledgeState({ pledged: true, count: s.count, pledgers: s.pledgers });
    } catch (err) {
      setPledgeError(err.message || 'Could not record your response');
    } finally {
      setPledging(false);
    }
  }

  if (error) {
    return (
      <div className="card">
        <p style={{ color: 'var(--red)' }}>{error}</p>
        <button onClick={onReset}>Submit another report</button>
      </div>
    );
  }
  if (!incident) return <div className="card">Loading…</div>;

  const stepIdx = STATUS_FLOW.indexOf(incident.status);
  // Only show the widget to logged-in users on incidents that aren't
  // resolved. Anonymous viewers and resolved incidents both skip it.
  const showPledge = Boolean(user) && incident.status !== 'resolved';
  const othersCount = Math.max(0, pledgeState.count - (pledgeState.pledged ? 1 : 0));

  return (
    <>
      {/* FEATURE 2: Geofence banner — also shown on the tracking page */}
      <GeofenceBanner coords={{ lat: incident.lat, lng: incident.lng }} />
      <div className="card" style={{ maxWidth: 560 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ color: 'var(--muted)', fontSize: 12 }}>Tracking ID</div>
          <div style={{ fontFamily: 'monospace', fontSize: 18 }}>{incident.tracking_id}</div>
        </div>
        <span className={`badge ${incident.severity}`}>{incident.severity}</span>
      </div>

      {liveUpdate && (
        <div style={{
          marginTop: 12, padding: 10, background: 'rgba(79,157,255,0.1)',
          border: '1px solid var(--accent)', borderRadius: 8, fontSize: 13,
        }}>
          🔔 Live update: status is now <strong>{liveUpdate.status}</strong>
        </div>
      )}

      <div style={{ marginTop: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
          {STATUS_FLOW.map((s, i) => (
            <div key={s} style={{
              fontSize: 11, textTransform: 'uppercase',
              color: i <= stepIdx ? 'var(--accent)' : 'var(--muted)',
              fontWeight: i === stepIdx ? 700 : 400,
            }}>
              {s.replace('_', ' ')}
            </div>
          ))}
        </div>
        <div style={{
          height: 6, background: 'var(--surface-2)', borderRadius: 3, overflow: 'hidden',
        }}>
          <div style={{
            width: `${((stepIdx + 1) / STATUS_FLOW.length) * 100}%`,
            height: '100%', background: 'var(--accent)',
            transition: 'width 0.4s',
          }} />
        </div>
      </div>

      <div style={{ marginTop: 20, fontSize: 13, color: 'var(--muted)' }}>
        Category: <strong style={{ color: 'var(--text)' }}>{incident.category}</strong><br />
        Submitted: {new Date(incident.created_at).toLocaleString()}<br />
        {incident.location_label && <>Location: {incident.location_label}</>}
      </div>

      {/* FEATURE: Nearby-volunteer "I'm responding" widget. Renders
          only for logged-in viewers on still-open incidents. The
          "others" line uses plural-aware copy so it reads correctly
          when nobody has pledged yet vs. when one other person has. */}
      {showPledge && (
        <div style={{
          marginTop: 20, padding: 14,
          background: 'rgba(94,177,255,0.08)',
          border: '1px solid rgba(94,177,255,0.4)',
          borderRadius: 10,
        }}>
          {pledgeState.pledged ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 18 }}>✓</span>
              <div>
                <div style={{ fontWeight: 600, color: 'var(--green)' }}>You're responding</div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                  The dispatcher can see you're on the way.
                </div>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <button
                className="primary"
                onClick={onPledge}
                disabled={pledging}
                style={{ flexShrink: 0 }}
              >
                {pledging ? 'Sending…' : "I'm responding →"}
              </button>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                Let the dispatcher know you're heading to the scene.
              </div>
            </div>
          )}
          {pledgeError && (
            <div style={{ marginTop: 8, fontSize: 12, color: 'var(--red)' }}>
              {pledgeError}
            </div>
          )}
          {othersCount > 0 && (
            <div style={{ marginTop: 10, fontSize: 12, color: 'var(--muted)' }}>
              {othersCount === 1
                ? '1 other person is already on the way.'
                : `${othersCount} other people are already on the way.`}
            </div>
          )}
        </div>
      )}

      <button onClick={onReset} style={{ marginTop: 20 }}>Submit another report</button>
    </div>
    </>
  );
}
