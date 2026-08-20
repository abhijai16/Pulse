import { MapContainer, TileLayer } from 'react-leaflet';

// Static, non-interactive Bhubaneswar map rendered as a hero background.
// Disables every interaction; CSS grayscale + low opacity keeps it reading
// as texture, not as a real map. Tile data is the same OSM source the live
// dashboard uses, so the "real places" feeling is preserved.
//
// Centered on the seeded incident cluster (Bhubaneswar) at zoom 14 so we
// get a clean street-grid texture across the hero.

const BHUBANESWAR_CENTER = [20.2961, 85.8245];

export default function HeroMapBackground() {
  return (
    <div className="hero-map-bg" aria-hidden="true">
      <MapContainer
        center={BHUBANESWAR_CENTER}
        zoom={14}
        // Make Leaflet calculate size correctly even though the container is
        // position:absolute under the hero text.
        style={{ height: '100%', width: '100%' }}
        zoomControl={false}
        scrollWheelZoom={false}
        doubleClickZoom={false}
        dragging={false}
        keyboard={false}
        touchZoom={false}
        boxZoom={false}
        whenCreated={(map) => setTimeout(() => map.invalidateSize(), 100)}
      >
        <TileLayer
          attribution=""
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
      </MapContainer>
    </div>
  );
}