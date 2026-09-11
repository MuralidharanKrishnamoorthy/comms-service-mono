# Demo Consumer App — Acme Storefront

A pretend storefront that consumes Notifyr. It owns **no** notification code:
no provider SDK, no email HTML, no retry loop, no delivery tracking. It holds
one API key and makes one HTTP call.

This is what onboarding a real app looks like.

## What it does

| Action in the UI | Template fired | Channel |
|---|---|---|
| Place order & notify | `ORDER_CONFIRMED` | email |
| Ship → email | `ORDER_SHIPPED` | email |
| Ship → SMS | `ORDER_SHIPPED` | sms |

After every action the page shows three panes side by side:

1. **App's order** — the storefront's own nested record
2. **Sent to Notifyr** — the exact request body, flat primitives only
3. **Notifyr replied** — status code and response

That middle step is the one every consuming app has to do for itself: reduce
your rich internal shape down to the flat variables the template declares.

## Setup

```bash
cp .env.example .env
npm install
npm run dev
```

Then open http://localhost:4321.

### Getting the API key

1. Open the Notifyr dashboard and pick the project (this app expects
   **Acme Storefront**, which owns the `ORDER_CONFIRMED` and `ORDER_SHIPPED`
   templates)
2. **API Keys → Create key**
3. Copy the value — it is shown **once**, at creation
4. Paste it into `.env` as `COMMS_API_KEY`
5. Restart this app

`.env` is git-ignored. Never commit a real key. If one leaks, revoke it in the
dashboard — the next request using it gets a 401.

## Environment

| Variable | Meaning |
|---|---|
| `PORT` | Where this storefront listens (default 4321) |
| `COMMS_BASE_URL` | Where Notifyr's API is |
| `COMMS_API_KEY` | The project's key. Sent as `Authorization: Bearer …` |
| `STORE_NAME` | Cosmetic — passed as the `store_name` template variable |
| `PUBLIC_URL` | Used to build `order_url` in outgoing notifications |

## Layout

```
src/
  notifyr.ts   The only file that talks to Notifyr. One function: sendNotification()
  store.ts     Catalogue, orders, and the mapping from an order to template variables
  page.ts      The storefront UI, served as one document
  index.ts     Routes: /api/checkout, /api/orders/:id/ship
```

## Things worth knowing

- **The order stands even if the notification fails.** A storefront that rolled
  back a paid order because an email bounced would be worse than one that mails
  late. Notifyr records the send before it tries, and retries on its own.
- **No retry lives here.** A `502` from Notifyr means the send is already logged
  and queued for another attempt. Retrying from this side would double-send.
- **The same template serves two channels with different variable lists.** SMS
  wants three fields, email wants six; the app supplies exactly what each
  declares, or gets back a `422` naming what's missing.
- **Email is real, SMS and push are stubs.** A successful SMS returns a
  `stub_sms_…` id — the pipeline is complete, the provider is not wired yet.

## Testing without the browser

```bash
curl -X POST http://localhost:4321/api/checkout \
  -H 'Content-Type: application/json' \
  -d '{"full_name":"Arjun R.","email":"you@example.com",
       "lines":[{"sku":"ACM-MSE-01","qty":2}]}'
```
