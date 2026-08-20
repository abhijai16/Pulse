import { CATEGORIES, SELF_COLOR } from '../lib/mapIcons.js';

// Floating legend overlay — sits on top of the Leaflet map (inside the same
// positioned container) so it doesn't get clipped. Bottom-left by default.
export default function MapLegend({ items = CATEGORIES, showSelf = true, position = 'bottom-left' }) {
  return (
    <div
      style={{
        position: 'absolute',
        ...(position === 'bottom-left' ? { bottom: 12, left: 12 } : { top: 12, right: 12 }),
        zIndex: 800,
        background: 'rgba(11,18,32,0.85)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        padding: '8px 10px',
        color: 'var(--text)',
        fontSize: 11,
        lineHeight: '18px',
        backdropFilter: 'blur(4px)',
        boxShadow: 'var(--shadow)',
        minWidth: 140,
      }}
    >
      <div style={{ fontWeight: 600, fontSize: 10, textTransform: 'uppercase',
                    color: 'var(--muted)', marginBottom: 4, letterSpacing: 0.5 }}>
        Map legend
      </div>
      {items.map((it) => (
        <div key={it.key} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{
            width: 12, height: 12, borderRadius: '50%',
            background: it.color, border: '2px solid #fff',
            flexShrink: 0,
          }} />
          <span>{it.label}</span>
        </div>
      ))}
      {showSelf && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
          <span style={{
            width: 12, height: 12, borderRadius: '50%',
            background: SELF_COLOR, border: '2px solid #fff',
            flexShrink: 0,
          }} />
          <span>You are here</span>
        </div>
      )}
    </div>
  );
}
