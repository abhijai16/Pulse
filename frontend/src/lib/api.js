// Shared HTTP client. Every module hits the same Express API.
const BASE = import.meta.env.VITE_API_BASE || '';

async function request(path, opts = {}) {
  const res = await fetch(`${BASE}/api${path}`, {
    headers: opts.body instanceof FormData ? {} : { 'Content-Type': 'application/json' },
    ...opts,
  });
  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`;
    try { msg = (await res.json()).error || msg; } catch {}
    throw new Error(msg);
  }
  return res.headers.get('content-type')?.includes('json') ? res.json() : res.text();
}

export const api = {
  // reporting
  submitReport: (formData) =>
    fetch(`${BASE}/api/reports`, { method: 'POST', body: formData }).then(handleJson),
  getReport: (trackingId) => request(`/reports/${trackingId}`),
  recentReports: () => request(`/reports`),

  // dispatch
  listIncidents: (status = 'active') => request(`/incidents?status=${status}`),
  listResponders: () => request(`/responders`),
  assignResponder: (payload) => request('/dispatches', { method: 'POST', body: JSON.stringify(payload) }),
  updateStatus: (id, status) => request(`/incidents/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  // FEATURE 1: AI Triage — dispatcher override
  overrideSeverity: (id, severity) =>
    request(`/incidents/${id}/severity`, { method: 'PATCH', body: JSON.stringify({ severity }) }),
  consolePayload: () => request('/console'),

  // analytics
  heatmap: () => request('/analytics/heatmap'),
  metrics: () => request('/analytics/metrics'),
  repeated: () => request('/analytics/repeated'),
  createBroadcast: (payload) => request('/broadcasts', { method: 'POST', body: JSON.stringify(payload) }),
  listBroadcasts: () => request('/broadcasts'),
  // FEATURE 2: Geofence
  activeGeofences: (lat, lng) => request(`/geofences/active?lat=${lat}&lng=${lng}`),
  csvUrl: () => `${BASE}/api/exports/report.csv`,
  pdfUrl: () => `${BASE}/api/exports/report.pdf`,

  // misc
  health: () => request('/health'),
};

async function handleJson(res) {
  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`;
    try { msg = (await res.json()).error || msg; } catch {}
    throw new Error(msg);
  }
  return res.json();
}
