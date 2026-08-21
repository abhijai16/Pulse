// auto-classify severity from category + keywords. kept in its own
// file so reporting (create) and analytics (audit) can share it.

const CATEGORY_BASE = {
  fire:       'high',
  medical:    'medium',
  harassment: 'medium',
  unsafe_area:'low',
  infra:      'low',
};

const CRITICAL_KW = ['weapon', 'gun', 'knife', 'unconscious', 'not breathing', 'bleeding heavily', 'stalking'];
const HIGH_KW     = ['fire', 'smoke', 'faint', 'asthma', 'threat', 'attack', 'snatching'];
const LOW_KW      = ['minor', 'small', 'leakage', 'broken light', 'bench'];

export function classifySeverity(category, description = '') {
  const text = description.toLowerCase();
  let sev = CATEGORY_BASE[category] || 'low';

  if (CRITICAL_KW.some((k) => text.includes(k))) sev = 'critical';
  else if (HIGH_KW.some((k) => text.includes(k))) sev = 'high';
  else if (LOW_KW.some((k) => text.includes(k)) && sev !== 'high') sev = 'low';

  // medical never low
  if (category === 'medical' && sev === 'low') sev = 'medium';

  return sev;
}
