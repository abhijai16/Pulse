// Pure-CSS + inline-SVG "map texture" rendered behind the hero copy.
//
// This used to be a real Leaflet MapContainer loading OSM tiles. That was
// overkill for what is fundamentally a decorative backdrop — it pulled in
// ~150KB of JS plus a live tile-server roundtrip on first paint, neither
// of which the hero needs. The new version is:
//   - zero JS (no Leaflet, no tile requests)
//   - a stylized SVG street grid that reads as "map-like texture"
//   - sized via SVG viewBox so it scales crisply at any viewport
//   - centered on India (matches the rest of the page) and not pinned to
//     any one campus — see [HERO_CENTER] comment.

const HERO_CENTER = [22.593, 78.9629]; // geographic centroid of India

export default function HeroMapBackground() {
  return (
    <div className="hero-map-bg" aria-hidden="true">
      <svg
        className="hero-map-svg"
        viewBox="0 0 1200 600"
        preserveAspectRatio="xMidYMid slice"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Subtle base fill so the texture sits on the bg color, not on white */}
        <rect x="0" y="0" width="1200" height="600" fill="#161616" />

        {/* Major "highways" — three thick crossing diagonals + one horizontal
            and one vertical trunk, mirroring the kind of arterial grid you
            see at country-zoom on OSM. */}
        <g stroke="#2a2a2e" strokeWidth="2.2" fill="none" opacity="0.55">
          <line x1="0"   y1="120" x2="1200" y2="180" />
          <line x1="0"   y1="380" x2="1200" y2="320" />
          <line x1="0"   y1="500" x2="1200" y2="520" />
        </g>
        <g stroke="#222226" strokeWidth="1.4" fill="none" opacity="0.5">
          <line x1="240"  y1="0" x2="280"  y2="600" />
          <line x1="640"  y1="0" x2="600"  y2="600" />
          <line x1="940"  y1="0" x2="980"  y2="600" />
          <line x1="0"    y1="60"  x2="1200" y2="80" />
          <line x1="0"    y1="280" x2="1200" y2="260" />
          <line x1="0"    y1="460" x2="1200" y2="440" />
        </g>

        {/* Finer street grid — short line segments at varied angles. Random
            but seeded via deterministic-ish math (no Math.random in render)
            so server/client output matches. */}
        <g stroke="#1f1f23" strokeWidth="0.9" strokeLinecap="round" opacity="0.7">
          {STREET_SEGMENTS.map(([x1, y1, x2, y2], i) => (
            <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} />
          ))}
        </g>

        {/* A handful of "blocks" — small rounded rects scattered to suggest
            urban density without trying to be cartographically accurate. */}
        <g fill="#1a1a1a" opacity="0.85">
          {BLOCKS.map(([x, y, w, h], i) => (
            <rect key={i} x={x} y={y} width={w} height={h} rx="2" />
          ))}
        </g>

        {/* A few "water-ish" curves — gentle sinuous strokes that read as
            rivers/coastline at low zoom. */}
        <g stroke="#1d2733" strokeWidth="3" fill="none" opacity="0.55" strokeLinecap="round">
          <path d="M -20 200 Q 200 240 380 200 T 780 220 T 1220 200" />
          <path d="M -20 420 Q 240 460 460 420 T 860 440 T 1220 420" />
        </g>
      </svg>
    </div>
  );
}

// Deterministic pseudo-random segments. Same every render, so SSR + client
// match and there's no hydration mismatch. Values are hand-tuned to look
// like a city/region street grid at country-zoom.
const STREETS = [
  // horizontal segments
  [40, 30, 220, 38], [260, 50, 410, 42], [460, 60, 600, 70],
  [40, 110, 200, 118], [240, 130, 380, 122], [420, 140, 580, 130],
  [60, 200, 240, 196], [300, 210, 480, 214], [520, 220, 700, 210],
  [80, 340, 260, 336], [300, 350, 460, 358], [500, 360, 680, 354],
  [40, 480, 220, 476], [260, 490, 420, 482], [460, 500, 620, 508],
  // vertical segments
  [80, 20, 88, 200], [200, 60, 208, 240], [340, 30, 348, 220],
  [460, 80, 468, 280], [580, 40, 588, 260], [700, 60, 708, 240],
  [820, 30, 828, 220], [940, 80, 948, 280], [1060, 50, 1068, 240],
  [120, 260, 128, 460], [260, 280, 268, 480], [400, 260, 408, 460],
  [540, 280, 548, 480], [680, 260, 688, 460], [820, 280, 828, 480],
  [960, 280, 968, 480], [1100, 260, 1108, 460],
];
const STREET_SEGMENTS = STREETS.flatMap(([x1, y1, x2, y2]) => [
  [x1, y1, x2, y2],
]);

// Small "block" rects scattered across the canvas. Coordinates chosen to
// look like low-density urban blocks at country-zoom.
const BLOCKS = [
  [60, 60, 24, 16], [120, 90, 18, 14], [200, 70, 22, 18],
  [340, 100, 20, 14], [420, 80, 26, 18], [540, 60, 18, 14],
  [640, 110, 22, 16], [760, 90, 20, 14], [880, 70, 24, 18],
  [1000, 100, 18, 14], [1080, 80, 22, 16],
  [80, 200, 20, 14], [180, 220, 24, 16], [300, 200, 18, 14],
  [420, 230, 22, 18], [560, 210, 20, 14], [680, 230, 26, 16],
  [820, 220, 18, 14], [940, 200, 24, 16], [1080, 220, 20, 14],
  [60, 340, 22, 16], [180, 360, 18, 14], [300, 340, 24, 18],
  [440, 360, 20, 14], [580, 340, 26, 16], [700, 360, 18, 14],
  [840, 340, 22, 16], [960, 360, 24, 14], [1080, 340, 20, 18],
  [80, 460, 20, 14], [220, 480, 24, 16], [360, 460, 18, 14],
  [500, 480, 22, 18], [640, 460, 26, 14], [780, 480, 18, 16],
  [920, 460, 24, 14], [1060, 480, 20, 16],
];
