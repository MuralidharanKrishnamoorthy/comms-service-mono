# Communication Service

Internal, standalone notification service. Every company app (Talntx, ERP, Krediq, and any new project) sends Email, SMS, and Push through this one service instead of building its own provider integrations. Each app gets its own API key, its own templates, and its own delivery log.

Full design decisions and flow: see [`COMMUNICATION_SERVICE_FLOW.md`](../COMMUNICATION_SERVICE_FLOW.md).

## Stack

| Layer | Choice |
|---|---|
| Frontend | Preact + Vite |
| Backend | Node.js + Hono |
| Database | MongoDB (self-hosted on Coolify) |
| Email + SMS | Twilio (SendGrid for email, same account) |
| Push | Firebase Cloud Messaging |
| Queue | None — DB-backed retry |
| Dashboard auth | None — internal team only, behind network-level restriction (VPN/internal network) |

## Structure

```
comms-service-mono/
├── frontend/     Admin dashboard — manage projects, API keys, templates, view send logs
├── backend/      API — auth, template rendering, provider routing, delivery tracking
└── package.json  Workspace root
```

## Setup

```bash
npm install
```

Create `backend/.env`:
```
MONGODB_URI=
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
SENDGRID_API_KEY=
FCM_SERVICE_ACCOUNT_JSON=
```

## Run

```bash
npm run dev
```
Starts backend and frontend together (via `concurrently`).

## Core API

```
POST /v1/notifications/send
Authorization: Bearer <project api key>

{
  "template_key": "PARTY_CREATED",
  "channel": "email",
  "recipient": "user@example.com",
  "data": { "party_name": "Launch Bash", "date": "2026-09-10" }
}
```

## Data model (MongoDB collections)

- `projects` — one per consuming app, holds the hashed API key
- `categories` — dashboard grouping, per project
- `templates` — the message blueprint (HTML for email, text for SMS/push), never holds send history
- `message_logs` — one row per actual send, tracks status/retries/provider response

## Notes

- Templates are edited live in the dashboard — no redeploy needed for a wording change.
- No message queue at this scale; retries run off a `next_retry_at` field on `message_logs`.
- Dashboard has no login — reachable only from the internal network/VPN. API key auth is separate and still required for every send request.
