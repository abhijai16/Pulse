import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
// Leaflet CSS MUST be imported here (global) so that map tiles size
// themselves correctly — without it, .leaflet-container has no height
// rules and the map renders as a sliver. We import from the bundled
// package rather than a CDN so it works offline / behind firewalls.
import 'leaflet/dist/leaflet.css';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
