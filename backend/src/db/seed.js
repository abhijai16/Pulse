import 'dotenv/config';
import { pool } from './pool.js';
import { v4 as uuid } from 'uuid';

// Demo campus is anchored at IIT Bombay-style coordinates (just for the demo).
// 18 incidents spread across realistic campus locations.
const LOCATIONS = [
  { label: 'Main Gate',                    lat: 19.1334, lng: 72.9133 },
  { label: 'Library Block',                lat: 19.1340, lng: 72.9140 },
  { label: 'Hostel 5',                     lat: 19.1325, lng: 72.9150 },
  { label: 'Sports Complex',               lat: 19.1360, lng: 72.9125 },
  { label: 'CSE Department',               lat: 19.1338, lng: 72.9155 },
  { label: 'Cafeteria',                    lat: 19.1345, lng: 72.9135 },
  { label: 'Parking Lot North',            lat: 19.1350, lng: 72.9170 },
  { label: 'Lecture Hall Complex',         lat: 19.1342, lng: 72.9160 },
  { label: 'Girls Hostel',                 lat: 19.1320, lng: 72.9148 },
  { label: 'Workshop / Lab Block',         lat: 19.1355, lng: 72.9158 },
  { label: 'Auditorium',                   lat: 19.1332, lng: 72.9162 },
  { label: 'Medical Center',               lat: 19.1348, lng: 72.9145 },
  { label: 'Bicycle Stand near Lake',      lat: 19.1365, lng: 72.9132 },
  { label: 'Admin Building',               lat: 19.1336, lng: 72.9138 },
];

const INCIDENTS = [
  // category, severity, description, status, daysAgo, anon
  ['medical',       'high',     'Student fainted near canteen, possible dehydration', 'resolved', 1,  false],
  ['fire',          'critical', 'Small electrical fire in CSE lab, smoke detected',  'resolved', 3,  false],
  ['harassment',    'high',     'Verbal harassment reported near girls hostel gate',  'resolved', 2,  true ],
  ['unsafe_area',   'medium',   'Broken streetlight on path between hostel 5 and gym', 'dispatched', 0, false],
  ['infra',         'low',      'Water leakage from ceiling in library 2nd floor',     'resolved', 5,  false],
  ['medical',       'medium',   'Minor injury during football match at sports complex','resolved', 2,  false],
  ['unsafe_area',   'high',     'Suspicious person loitering near parking lot at night','resolved', 1,  false],
  ['fire',          'medium',   'Smoke smell reported near workshop, possible short circuit','resolved', 4,  false],
  ['harassment',    'high',     'Stalking incident reported by student',               'dispatched', 0, true ],
  ['infra',         'low',      'Broken bench outside auditorium',                     'new',        0,  false],
  ['medical',       'high',     'Asthma attack in lecture hall, ambulance requested',  'on_scene',   0,  false],
  ['unsafe_area',   'medium',   'Dark stretch near lake, students feel unsafe at night','resolved', 6,  false],
  ['harassment',    'medium',   'Inappropriate comments by outsider near cafeteria',   'resolved', 4,  true ],
  ['fire',          'high',     'Fire alarm triggered in hostel 5, evacuation underway','resolved', 7,  false],
  ['infra',         'medium',   'Lift not working in admin building, person stuck',    'resolved', 3,  false],
  ['medical',       'low',      'Minor cut at workshop, first aid provided',           'resolved', 8,  false],
  ['unsafe_area',   'high',     'Two-wheeler chain snatching attempt reported',        'new',        0,  false],
  ['harassment',    'critical', 'Threatening messages received, reporter fears for safety','dispatched', 0, true ],
];

const RESPONDERS = [
  ['Ravi Kumar',     'security',    'available', '+91-90000-00001'],
  ['Priya Sharma',   'medical',     'available', '+91-90000-00002'],
  ['Anil Verma',     'fire',        'available', '+91-90000-00003'],
  ['Sneha Patel',    'security',    'busy',      '+91-90000-00004'],
  ['Mohammed Khan',  'maintenance', 'available', '+91-90000-00005'],
  ['Deepa Iyer',     'medical',     'available', '+91-90000-00006'],
  ['Sanjay Rao',     'security',    'off',       '+91-90000-00007'],
  ['Asha Reddy',     'maintenance', 'available', '+91-90000-00008'],
];

async function run() {
  console.log('[seed] resetting demo data');
  await pool.query('TRUNCATE dispatches, broadcasts, incidents, responders RESTART IDENTITY CASCADE');

  console.log('[seed] inserting responders');
  for (const r of RESPONDERS) {
    await pool.query(
      'INSERT INTO responders (name, role, status, phone) VALUES ($1,$2,$3,$4)',
      r
    );
  }

  console.log('[seed] inserting incidents');
  let loc = 0;
  for (const [category, severity, description, status, daysAgo, anon] of INCIDENTS) {
    const trackingId = `PULSE-${uuid().slice(0, 8).toUpperCase()}`;
    const place = LOCATIONS[loc % LOCATIONS.length];
    loc++;
    // tiny jitter so points don't stack perfectly
    const lat = place.lat + (Math.random() - 0.5) * 0.0008;
    const lng = place.lng + (Math.random() - 0.5) * 0.0008;
    const createdAt = new Date(Date.now() - daysAgo * 24 * 3600 * 1000);
    const resolvedAt = status === 'resolved' ? new Date(createdAt.getTime() + (10 + Math.random() * 50) * 60 * 1000) : null;

    await pool.query(
      `INSERT INTO incidents
       (tracking_id, category, description, lat, lng, location_label, severity, is_anonymous, status, created_at, updated_at, resolved_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10,$11)`,
      [trackingId, category, description, lat, lng, place.label, severity, anon, status, createdAt, resolvedAt]
    );
  }

  console.log('[seed] done — %d incidents, %d responders', INCIDENTS.length, RESPONDERS.length);
  await pool.end();
}

run().catch((err) => {
  console.error('[seed] failed', err);
  process.exit(1);
});
