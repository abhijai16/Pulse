// Faint campus silhouette backdrop for light sections (lactivity, llive).
// Renders a clock tower + academic building on the left and trees + a
// lamppost on the right, framed at the edges so the centre stays clear
// for headlines and cards. One colour, low opacity, no interaction —
// it's pure atmosphere.
//
// Why inline SVG (not an asset)?
//   - Zero network cost; no flash of missing art while the file streams.
//   - viewBox scales cleanly to any container size — asset PNGs would
//     pixelate or fight the layout on smaller widths.
//   - Single fill colour means swapping the tint is a one-line CSS
//     override on `.campus-bg` (e.g. lavender in light sections, a
//     muted teal in dark sections if we ever want it).

export default function CampusBackground() {
  return (
    // aria-hidden: purely decorative — exposing this to screen readers
    // would just announce "graphic" with no useful content. pointer-
    // events: none in CSS so it never intercepts clicks on cards/links.
    <div className="campus-bg" aria-hidden="true">
      <svg
        className="campus-bg-svg"
        viewBox="0 0 1200 400"
        preserveAspectRatio="xMidYMid slice"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* ---- LEFT: clock tower + academic building + smaller wing ---- */}
        <g className="campus-bg-left">
          {/* Tall clock tower with a peaked roof + spire on top */}
          <path
            d="M 60 400 L 60 140 L 90 110 L 120 140 L 120 400 Z"
            fill="currentColor"
          />
          {/* Spire */}
          <path d="M 90 110 L 90 60 L 96 60 L 90 40 L 84 60 L 90 60 Z" fill="currentColor" />
          {/* Clock face */}
          <circle cx="90" cy="160" r="10" fill="#f6f7f9" />
          {/* Tower body lines (windows) */}
          <rect x="74" y="200" width="6" height="14" fill="#f6f7f9" />
          <rect x="100" y="200" width="6" height="14" fill="#f6f7f9" />
          <rect x="74" y="240" width="6" height="14" fill="#f6f7f9" />
          <rect x="100" y="240" width="6" height="14" fill="#f6f7f9" />
          <rect x="74" y="280" width="6" height="14" fill="#f6f7f9" />
          <rect x="100" y="280" width="6" height="14" fill="#f6f7f9" />

          {/* Main academic building — wider block with pitched roof */}
          <path
            d="M 140 400 L 140 220 L 220 170 L 300 220 L 300 400 Z"
            fill="currentColor"
          />
          {/* Roof line / cornice stripe */}
          <rect x="140" y="225" width="160" height="4" fill="currentColor" />
          {/* Arched doorway */}
          <path d="M 210 400 L 210 330 Q 220 315 230 330 L 230 400 Z" fill="#f6f7f9" />
          {/* Window grid (4 cols × 3 rows) */}
          {Array.from({ length: 12 }).map((_, i) => {
            const col = i % 4;
            const row = Math.floor(i / 4);
            return (
              <rect
                key={`w-${i}`}
                x={160 + col * 32}
                y={260 + row * 36}
                width="14"
                height="20"
                fill="#f6f7f9"
              />
            );
          })}

          {/* Smaller secondary wing to the left of the main block */}
          <path
            d="M 130 400 L 130 280 L 145 270 L 145 400 Z"
            fill="currentColor"
          />

          {/* Foreground shrub/hedge at base of buildings */}
          <ellipse cx="180" cy="395" rx="120" ry="10" fill="currentColor" />
        </g>

        {/* ---- RIGHT: trees + lamppost ---- */}
        <g className="campus-bg-right">
          {/* Tall conifer (triangle stack) */}
          <path
            d="M 1010 400 L 1010 240 L 980 240 L 1040 200 L 1010 200 L 1010 170 L 988 170 L 1032 140 L 1010 140 L 1010 110 L 992 110 L 1032 80 L 1010 80 Z"
            fill="currentColor"
          />

          {/* Round-crown tree */}
          <rect x="1095" y="290" width="8" height="110" fill="currentColor" />
          <circle cx="1099" cy="270" r="55" fill="currentColor" />

          {/* Second smaller round tree */}
          <rect x="1155" y="320" width="6" height="80" fill="currentColor" />
          <circle cx="1158" cy="305" r="35" fill="currentColor" />

          {/* Lamppost */}
          <rect x="940" y="270" width="3" height="130" fill="currentColor" />
          <path
            d="M 935 270 Q 941 260 947 270 L 945 280 L 937 280 Z"
            fill="currentColor"
          />
          <circle cx="941" cy="262" r="6" fill="currentColor" />

          {/* Foreground shrub line at base of right side */}
          <ellipse cx="1080" cy="395" rx="160" ry="10" fill="currentColor" />
        </g>

        {/* A couple of faint birds in the sky between the silhouettes */}
        <g className="campus-bg-birds" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          <path d="M 560 90 q 6 -8 12 0 q 6 -8 12 0" />
          <path d="M 620 70 q 5 -6 10 0 q 5 -6 10 0" />
        </g>
      </svg>
    </div>
  );
}
