// AI Triage / Auto-Priority Scoring
// Weighted keyword match against the description text. Returns
//   { severity, confidence (0..1), reasons: [matched terms] }
// This is intentionally a small, explainable rules engine — perfect for a
// hackathon pitch ("explainable AI triage"). Production would swap in a
// distilled transformer behind the same interface.

const RULES = [
  // { weight, severity, terms[] } — weight is summed per match; highest
  // matching severity wins, confidence = matched-weight / max possible.
  { weight: 12, severity: 'critical', terms: ['unconscious', 'not breathing', 'no pulse', 'gun', 'weapon', 'knife', 'stabbing', 'explosion'] },
  { weight: 9,  severity: 'critical', terms: ['severe bleeding', 'bleeding heavily', 'gas leak', 'electrocution'] },
  { weight: 7,  severity: 'high',     terms: ['fire', 'smoke', 'flames', 'faint', 'asthma', 'attack', 'snatching', 'stalking', 'threat', 'threatening', 'broken leg', 'chest pain'] },
  { weight: 5,  severity: 'high',     terms: ['injury', 'bleeding', 'harassment', 'suspicious', 'following me'] },
  { weight: 3,  severity: 'medium',   terms: ['pain', 'sprain', 'cut', 'vomit', 'broken light', 'dark area', 'unsafe'] },
  { weight: 2,  severity: 'medium',   terms: ['water leakage', 'leak', 'parking', 'gate'] },
  { weight: 1,  severity: 'low',      terms: ['broken bench', 'flickering', 'minor', 'small crack'] },
];

// Category contributes a base weight — this is the same logic as the
// existing classifySeverity() but the output is structured so the UI can
// surface reasons + confidence.
const CATEGORY_BASE = {
  fire:        'high',
  medical:     'medium',
  harassment:  'medium',
  unsafe_area: 'low',
  infra:       'low',
};

const SEVERITY_RANK = { low: 1, medium: 2, high: 3, critical: 4 };
const RANK_TO_SEV   = { 1: 'low', 2: 'medium', 3: 'high', 4: 'critical' };

export function triage(category, description = '') {
  const text = String(description).toLowerCase();
  const reasons = [];
  let weight = 0;
  let bestSeverity = CATEGORY_BASE[category] || 'low';

  for (const rule of RULES) {
    for (const term of rule.terms) {
      if (text.includes(term)) {
        reasons.push(term);
        weight += rule.weight;
        if (SEVERITY_RANK[rule.severity] > SEVERITY_RANK[bestSeverity]) {
          bestSeverity = rule.severity;
        }
      }
    }
  }

  // category-based floor: medical is never low unless explicitly de-escalated
  if (category === 'medical' && bestSeverity === 'low') bestSeverity = 'medium';

  // confidence: matched weight / (theoretical max if every rule in the
  // winning severity bucket fired). Capped at 1.0.
  const winningBucket = RULES.filter((r) => r.severity === bestSeverity);
  const bucketMax = winningBucket.reduce((s, r) => s + r.weight * r.terms.length, 0);
  let confidence = bucketMax ? Math.min(1, weight / bucketMax) : 0.5;
  if (reasons.length === 0) confidence = 0.3; // no signal → low confidence

  // Boost confidence a bit — single matched critical-term shouldn't stay at 0.2.
  if (SEVERITY_RANK[bestSeverity] >= 3 && reasons.length > 0) {
    confidence = Math.max(confidence, 0.7);
  }

  // clamp rank to at least the category floor
  if (SEVERITY_RANK[bestSeverity] < SEVERITY_RANK[CATEGORY_BASE[category] || 'low']) {
    bestSeverity = CATEGORY_BASE[category] || 'low';
  }

  return {
    severity: bestSeverity,
    confidence: Number(confidence.toFixed(2)),
    reasons: Array.from(new Set(reasons)), // dedupe
    category,
  };
}
