import { useState } from 'react';
import { useParams } from 'react-router-dom';
import EmergencyView from './EmergencyView.jsx';
import TrackingView from './TrackingView.jsx';

export default function AlertNow() {
  const { trackingId } = useParams();
  const [submittedId, setSubmittedId] = useState(trackingId || null);

  if (submittedId) {
    return (
      <>
        <h1 className="page-title">Track your report</h1>
        <p className="page-sub">Live status updates from dispatch will appear here.</p>
        <TrackingView trackingId={submittedId} onReset={() => setSubmittedId(null)} />
      </>
    );
  }

  return (
    <>
      <h1 className="page-title">AlertNow</h1>
      <p className="page-sub">Report an incident on campus. You can submit anonymously.</p>
      <EmergencyView onSubmitted={(id) => setSubmittedId(id)} />
    </>
  );
}
