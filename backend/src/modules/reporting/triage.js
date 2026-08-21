// AI triage / auto-priority. weighted keyword match against the
// description. returns { severity, confidence, reasons[] }.
// rules engine on purpose — easy to demo, easy to explain, no model
// weights to defend. in prod you'd swap in a small classifier behind
// the same shape.

const RULES = [
  // { weight, severity, terms[] }. weights add up per match, highest
  // severity wins, confidence is matched-weight / max-possible.
  { weight: 12, severity: 'critical', terms: ['unconscious', 'not breathing', 'no pulse', 'gun', 'weapon', 'knife', 'stabbing', 'explosion'] },
  { weight: 9,  severity: 'critical', terms: ['severe bleeding', 'bleeding heavily', 'gas leak', 'electrocution'] },
  { weight: 7,  severity: 'high',     terms: ['fire', 'smoke', 'flames', 'faint', 'asthma', 'attack', 'snatching', 'stalking', 'threat', 'threatening', 'broken leg', 'chest pain'] },
  { weight: 5,  severity: 'high',     terms: ['injury', 'bleeding', 'harassment', 'suspicious', 'following me'] },
  { weight: 3,  severity: 'medium',   terms: ['pain', 'sprain', 'cut', 'vomit', 'broken light', 'dark area', 'unsafe'] },
  { weight: 2,  severity: 'medium',   terms: ['water leakage', 'leak', 'parking', 'gate'] },
  { weight: 1,  severity: 'low',      terms: ['broken bench', 'flickering', 'minor', 'small crack'] },
];

// category gives a baseline floor. same idea as classifySeverity() in
// severity.js, but this one returns reasons + confidence for the UI.
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

  // floor: medical never low unless dispatcher de-escalates
  if (category === 'medical' && bestSeverity === 'low') bestSeverity = 'medium';

  // confidence = matched weight / max weight in the winning bucket.
  // capped at 1.0.
  const winningBucket = RULES.filter((r) => r.severity === bestSeverity);
  const bucketMax = winningBucket.reduce((s, r) => s + r.weight * r.terms.length, 0);
  let confidence = bucketMax ? Math.min(1, weight / bucketMax) : 0.5;
  if (reasons.length === 0) confidence = 0.3; // nothing matched — show low confidence

  // single hit on a critical/high term shouldn't leave confidence at 0.2.
  if (SEVERITY_RANK[bestSeverity] >= 3 && reasons.length > 0) {
    confidence = Math.max(confidence, 0.7);
  }

  // never drop below the category floor
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
