import { useEffect, useState } from 'react';
import { socket } from '../lib/socket.js';

// Top-of-page pulse banner that shows when PulseBoard pushes a radius alert.
export default function BroadcastListener() {
  const [active, setActive] = useState(null);

  useEffect(() => {
    const handler = (b) => {
      setActive(b);
      // auto-dismiss after 12s unless the user keeps it
      setTimeout(() => setActive((cur) => (cur?.id === b.id ? null : cur)), 12000);
    };
    socket.on('broadcast:alert', handler);
    return () => socket.off('broadcast:alert', handler);
  }, []);

  if (!active) return null;
  return (
    <div className="broadcast-banner" onClick={() => setActive(null)} role="alert">
      � {active.message} <span style={{ opacity: 0.7, fontWeight: 400, marginLeft: 8 }}>
        (within {active.radius_m}m)
      </span>
    </div>
  );
}
