// Site-wide background pattern — a fixed-position, full-viewport layer of
// faint Bhubaneswar street-line texture that sits BEHIND every page
// (Landing, AlertNow, RespondOps, PulseBoard).
//
// Why a dedicated component (and not inline in any one page)?
//   - Mounting it once at the App root means it can never be "lost" when
//     a page gets redesigned — no individual route can accidentally drop
//     the pattern by reworking its own hero/section markup.
//   - Fixed-position + z-index:0 keeps it pinned to the viewport so the
//     pattern doesn't repeat awkwardly per-section; it reads as a single
//     continuous backdrop regardless of how the page scrolls.
//   - Pointer-events:none so it never intercepts clicks on the page
//     underneath (orbs, text, buttons, the interactive Leaflet maps in
//     RespondOps / PulseBoard).
//
// Visual intent (matches Citizen's faint background detail texture):
//   - very low opacity (~10%) so it reads as background, not as a map
//   - grayscale + soft mask so the edges of the viewport fade into the
//     bg color, keeping focus on the foreground content
//   - the asset is a pre-rendered static PNG of Bhubaneswar's street
//     network extracted from OSM mapnik tiles at zoom 13 — no live
//     tile-server calls, no Leaflet dependency, no network on first paint

const BG_IMAGE_URL = '/assets/bhubaneswar-streets.png';

export default function BackgroundPattern() {
  return (
    <div
      className="bg-pattern"
      aria-hidden="true"
      style={{ backgroundImage: `url(${BG_IMAGE_URL})` }}
    />
  );
}
