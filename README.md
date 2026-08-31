# Communication Service

Internal, standalone notification service. Every company app (Talntx, ERP, Krediq, and any new project) sends Email, SMS, and Push through this one service instead of building its own provider integrations. Each app gets its own API key, its own templates, and its own delivery log.



## Stack

| Layer | Choice |
|---|---|
| Frontend | Preact + Vite |
| Backend | Node.js + Hono |
| Database | MongoDB (self-hosted on Coolify) |
| Email + SMS | Twilio (SendGrid for email, same account) need to decide later |
| Push | Firebase Cloud Messaging |
| Queue | None — DB-backed retry |


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

