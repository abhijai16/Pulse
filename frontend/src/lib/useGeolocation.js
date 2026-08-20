import { useState, useEffect } from 'react';

// Shared hook for "where am I?". Returns:
//   { coords: {lat,lng} | null, status: 'idle'|'locating'|'ready'|'denied'|'unavailable', error: string|null }
// `fallback` is used as `coords` if the browser denies / lacks geolocation.
export function useGeolocation({ fallback = null, timeout = 6000 } = {}) {
  const [coords, setCoords]   = useState(fallback);
  const [status, setStatus]   = useState('idle'); // idle while we decide
  const [error, setError]     = useState(null);

  useEffect(() => {
    if (!navigator.geolocation) {
      setStatus('unavailable');
      setError('Geolocation not supported by this browser');
      return;
    }
    setStatus('locating');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setStatus('ready');
      },
      (err) => {
        // err.code 1 = PERMISSION_DENIED, 2 = POSITION_UNAVAILABLE, 3 = TIMEOUT
        setStatus(err.code === 1 ? 'denied' : 'unavailable');
        setError(err.message || 'Location unavailable');
        // keep fallback coords (do not clear)
      },
      { enableHighAccuracy: true, timeout, maximumAge: 60000 }
    );
  }, []); // run once on mount

  return { coords, status, error };
}
