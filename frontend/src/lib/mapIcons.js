// Shared color palette + Leaflet divIcon factories for map markers.
// Kept in one place so RespondOps and PulseBoard stay visually consistent.

import L from 'leaflet';

// Category → color. These are intentionally distinct from each other AND
// from the severity palette used elsewhere in the app.
export const CATEGORY_COLORS = {
  fire:        '#ff7a1a', // orange
  harassment:  '#e63946', // red
  medical:     '#ff3da6', // pink/magenta
  unsafe_area: '#ffd60a', // yellow
  infra:       '#5a8dee', // blue/grey
};

// Distinct "this is me" color for the admin/responder self marker.
export const SELF_COLOR = '#22c55e'; // green

export function categoryColor(category) {
  return CATEGORY_COLORS[category] || '#888';
}

// Builds a small, round, colored marker with a thin white ring — visible at
// a glance, doesn't look like the default red Leaflet pin.
export function makeCategoryIcon(category, { size = 18 } = {}) {
  const color = categoryColor(category);
  const html = `
    <div style="
      width: ${size}px; height: ${size}px;
      background: ${color};
      border: 2px solid #fff;
      border-radius: 50%;
      box-shadow: 0 2px 6px rgba(0,0,0,0.4);
    "></div>`;
  return L.divIcon({
    html,
    className: 'pulse-marker pulse-marker-category',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

// The "admin/responder is here" marker. Same shape as the category markers
// (so it's recognizable as a location dot) but in green with a pulsing ring.
export function makeSelfIcon() {
  const html = `
    <div class="pulse-self-wrap">
      <div class="pulse-self-ring"></div>
      <div class="pulse-self-dot" style="background: ${SELF_COLOR};"></div>
    </div>`;
  return L.divIcon({
    html,
    className: 'pulse-marker pulse-marker-self',
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });
}

export const CATEGORIES = [
  { key: 'fire',        label: 'Fire',         color: CATEGORY_COLORS.fire },
  { key: 'medical',     label: 'Medical',      color: CATEGORY_COLORS.medical },
  { key: 'harassment',  label: 'Harassment',   color: CATEGORY_COLORS.harassment },
  { key: 'unsafe_area', label: 'Unsafe area',  color: CATEGORY_COLORS.unsafe_area },
  { key: 'infra',       label: 'Infrastructure', color: CATEGORY_COLORS.infra },
];
