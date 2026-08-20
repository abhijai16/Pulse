# Smart Campus Emergency Response

A hackathon prototype for Smart India Hackathon — three independently shippable products sharing a single backend and database.

## The three modules

| Module | Route | One-line business case |
| --- | --- | --- |
| **AlertNow** (Citizen Reporting) | `/report` | Universities and large hospitals buy it to give students/patients a safe, anonymous channel for sensitive incidents — drives up real reporting rates where stigma is high. |
| **RespondOps** (Responder Dispatch) | `/ops` | Security and facility management firms buy it as a low-cost dispatch console for guards, EMTs, and maintenance crews — replaces radio + spreadsheet workflows. |
| **PulseBoard** (Analytics & Broadcast) | `/admin` | Campus safety officers and insurance underwriters buy it for incident trend analysis, audit exports, and one-tap mass notifications during active threats. |

Each module lives in its own folder under `backend/src/modules/` and `frontend/src/modules/`. They share `backend/src/db/schema.sql` and the Express API, but the module folders have zero cross-imports — any one can be lifted into a standalone product.

## Quick start

```bash
# 1. Backend
cd backend
cp .env.example .env       # fill in DATABASE_URL, ENCRYPTION_KEY, ALLOWED_ORIGIN
npm install
npm run migrate            # creates schema
npm run seed               # loads 18 demo incidents across campus
npm run dev                # http://localhost:4000

# 2. Frontend (new terminal)
cd frontend
cp .env.example .env       # set VITE_MAPBOX_TOKEN if you want real tiles
npm install
npm run dev                # http://localhost:5173
```

Open `/` for the launcher, then enter any of `/report`, `/ops`, or `/admin`.

## Architecture

```
pulse/
├── backend/
│   └── src/
│       ├── server.js                 # Express + Socket.io bootstrap
│       ├── db/{schema.sql, pool.js, migrate.js, seed.js}
│       ├── realtime/socket.js        # single Socket.io hub, namespaced by module
│       ├── modules/
│       │   ├── reporting/            # AlertNow  — incidents, evidence, encryption
│       │   ├── dispatch/             # RespondOps — responders, assignments, status
│       │   └── analytics/            # PulseBoard — clustering, metrics, broadcasts
│       └── routes/                   # one router per module, mounted at /api/*
└── frontend/
    └── src/
        ├── App.jsx                   # client-side router, /report /ops /admin
        ├── lib/{api.js, socket.js}
        └── modules/
            ├── alertnow/             # citizen form + tracking page
            ├── respondops/           # live map + dispatch console
            └── pulseboard/           # heatmap + analytics + broadcast tool
```

## API surface (shared, but module-scoped)

- `POST   /api/reports`              — submit incident (AlertNow)
- `GET    /api/reports/:trackingId`  — status for reporter (AlertNow + dispatch sync)
- `GET    /api/incidents`            — active incidents for map (RespondOps)
- `PATCH  /api/incidents/:id/status` — status update → fans out to reporter socket (RespondOps)
- `PATCH  /api/incidents/:id/severity` — **Feature 1** — dispatcher overrides AI-suggested severity
- `POST   /api/dispatches`           — assign responder (RespondOps)
- `GET    /api/analytics/heatmap`    — clustered points (PulseBoard)
- `GET    /api/analytics/metrics`    — avg response time, top categories (PulseBoard)
- `POST   /api/broadcasts`           — radius push + **Feature 2** geofence (PulseBoard)
- `GET    /api/geofences/active`     — **Feature 2** — active zones containing `?lat=&lng=`
- `GET    /api/exports/report.csv|pdf` — admin export (PulseBoard)

## Features

### 🤖 AI-powered triage (Feature 1)
Every incident submitted via `POST /api/reports` is scored by a weighted
keyword engine in `backend/src/modules/reporting/triage.js`. The score
returns `{ severity, confidence, reasons[] }` and is stored alongside the
incident. The RespondOps console surfaces the AI suggestion as a badge
with confidence %, and the dispatcher can **override** it from a dropdown.
Override propagates to every connected console via the new
`incident:severity` Socket.io channel.

### � Geofence alerts (Feature 2)
Every broadcast created in PulseBoard is now also a **geofence** with a
configurable `durationMinutes` (default 30). AlertNow polls
`/api/geofences/active?lat=&lng=` whenever the browser GPS updates, and
also reacts to the existing `broadcast:alert` socket push for instant
coverage. When the user is inside an active zone, a persistent red
banner appears with the alert message, severity, and time remaining
(dismissible per session).

## Real-time channels (Socket.io)

- `incident:new` — fires on new report → RespondOps map, PulseBoard tiles
- `incident:status` — fires on dispatch status change → reporter tracking page
- `broadcast:alert` — fires when PulseBoard pushes radius alert → all connected clients

## Extracting a module

To ship just **AlertNow** as a standalone product:
1. Copy `backend/src/modules/reporting/` and `backend/src/db/schema.sql` (just the `incidents` and `reports` tables).
2. Copy `frontend/src/modules/alertnow/`.
3. Mount `/api/reports` directly. Done — no RespondOps or PulseBoard needed.
