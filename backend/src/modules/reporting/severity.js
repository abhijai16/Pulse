// Auto-classify severity from category + keywords. Pulled into its own file so
// both reporting (alert creation) and analytics (audit) can use the same rule.

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

  // medical is always at least medium
  if (category === 'medical' && sev === 'low') sev = 'medium';

  return sev;
}
