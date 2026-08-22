// Compact embed of SimulateDetection sized to fit the RespondOps sidebar.
// Lets a dispatcher demo the acoustic pipeline without leaving /ops —
// the resulting incident lands on the map above via the existing
// `incident:new` Socket.io listener.

import SimulateDetection from './SimulateDetection.jsx';

export default function AudioSentrySimulator() {
  return (
    <>
      <p style={{ fontSize: 12, color: 'var(--muted)', margin: '0 0 10px 0' }}>
        Demo the acoustic pipeline: pick a keyword and trigger an
        incident that lands on the map above.
      </p>
      <SimulateDetection compact />
    </>
  );
}
