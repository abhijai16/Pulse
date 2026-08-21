# Pulse — Smart Campus Emergency Response

Hackathon prototype: three products (AlertNow, RespondOps, PulseBoard) sharing one
Node/Express + Postgres backend with real-time Socket.io updates.

## What each piece does

**AlertNow** (`/report`, `/track/:id`) — anyone submits an anonymous incident
report and tracks its status with a tracking ID.

**RespondOps** (`/ops`) — dispatcher console: live map, AI-suggested severity,
override + assign responders, accept civilian pledges.

**PulseBoard** (`/admin`) — admin: heatmap, response-time KPIs, broadcast
alerts (radius or time-bound geo-zone), CSV/PDF export.

`/login` and `/profile` cover auth (signup + OTP, session cookie).

## Tech stack

**Backend** (Node.js, ESM): Express, PostgreSQL (`pg`), Socket.io,
nodemailer (OTP), multer (uploads), pdfkit (exports), crypto-js (at-rest
encryption). AI triage is an in-process weighted-keyword scorer.

**Frontend** (React, JSX, no TS): Vite, React Router, Leaflet + react-leaflet
(maps), Mapbox GL (optional premium tiles), Recharts (KPIs), Socket.io
client.

## Quick start

Needs **Node 18+** and **PostgreSQL 14+**.

```bash
# Postgres one-time
psql -U postgres -c "CREATE USER pulse WITH PASSWORD 'pulse';"
psql -U postgres -c "CREATE DATABASE pulse OWNER pulse;"

# Backend
cd backend
cp .env.example .env          # set DATABASE_URL, ENCRYPTION_KEY, ALLOWED_ORIGIN
npm install
npm run migrate
npm run seed
npm run dev                   # http://localhost:4000

# Frontend (new terminal)
cd frontend
cp .env.example .env          # VITE_MAPBOX_TOKEN optional
npm install
npm run dev                   # http://localhost:5173
```

Then open `http://localhost:5173` and pick a product from the landing page.

## Layout

```
backend/src/
  server.js           Express + Socket.io bootstrap
  events.js           in-process event bus
  db/                 schema.sql, pool, migrate, seed
  realtime/socket.js  single Socket.io hub
  modules/{auth,reporting,dispatch,analytics,community,profile}/
frontend/src/
  App.jsx             router + auth provider
  pages/              Landing, Auth
  modules/{alertnow,respondops,pulseboard,profile}/
```

## API

All under `/api`. Reporting is open; everything else needs a session cookie.

- `POST /api/reports`, `GET /api/reports/:trackingId` — submit + track
- `GET /api/incidents`, `PATCH /api/incidents/:id/status|severity` — dispatch
- `POST /api/dispatches` — assign responder
- `POST/GET /api/community/incidents/:id[/pledge]` — civilian pledges
- `GET /api/analytics/{heatmap,metrics}`, `POST /api/broadcasts`,
  `GET /api/geofences/active` — analytics + alerts
- `GET /api/exports/report.{csv,pdf}` — audit exports
- `POST /api/auth/{signup,verify-otp,login,logout,resend-otp}`,
  `GET /api/auth/me` — auth
- `GET /api/profile/me` — own profile

Socket.io channels: `incident:new`, `incident:status`, `incident:severity`,
`broadcast:alert`, `volunteer:joined`.

## Ship one module standalone

Copy the module folder, the schema tables it touches, and its routes. No
cross-imports to untangle.
