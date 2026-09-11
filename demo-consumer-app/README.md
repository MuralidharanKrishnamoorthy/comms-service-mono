# Demo Consumer App — Acme Storefront

A pretend storefront that consumes Notifyr. It owns **no** notification code:
no provider SDK, no email HTML, no retry loop, no delivery tracking. It holds
one API key and makes one HTTP call.

This is what onboarding a real app looks like.

## The flow

```
add to cart  →  checkout  →  pay  →  invoice emailed
                (order created,   (gateway charges,    (INVOICE_PAID
                 pending_payment)  order → paid,        through Notifyr)
                                   invoice issued)
```

Checkout sends nothing — an order nobody has paid for is not news. The invoice
goes out only once the payment has settled and the order has been written.

## Setup

```bash
cp .env.example .env
npm install
npm run dev            # or: npm run dev:all  from the repo root
```

Then open http://localhost:4321. Needs MongoDB running locally.

### Getting the API key

1. Open the Notifyr dashboard and pick the project — this app expects
   **Acme Storefront**, which owns the `INVOICE_PAID` template
2. **API Keys → Create key**
3. Copy the value — it is shown **once**, at creation
4. Paste it into `.env` as `COMMS_API_KEY`, then restart

`.env` is git-ignored. Never commit a real key. If one leaks, revoke it in the
dashboard — the next request using it gets a 401.

## Its own database

The store keeps its data in its **own** MongoDB database (`acme_storefront`),
not in Notifyr's. A real consuming app owns its data and knows nothing about
the communication service's schema; sharing one database would quietly erase
the boundary this demo exists to show.

| Collection | Holds |
|---|---|
| `products` | The catalogue. Seeded on first boot. |
| `orders` | Lines, totals, status, invoice number, and the outcome of the invoice email |
| `payments` | One row per attempt — successes *and* failures |
| `counters` | Atomic sequences behind order and invoice numbers |

## Paying

The gateway in `payments.ts` is simulated: it takes 700ms, hands back a
reference, and declines any **card number starting `4000`**. UPI and net
banking always approve. Nothing real is charged.

| Outcome | What happens |
|---|---|
| Approved | payment row, order → `paid`, invoice number issued, `INVOICE_PAID` sent |
| Declined | payment row with the reason, order → `payment_failed`, **no email** |

## Layout

```
src/
  notifyr.ts   The only file that talks to Notifyr. One function: sendNotification()
  db.ts        Connection, indexes, catalogue seed, atomic sequences
  store.ts     Orders, payments, and the mapping from an order to template variables
  payments.ts  The simulated gateway
  page.ts      The storefront UI, served as one document
  index.ts     Routes
```

## Endpoints

| | |
|---|---|
| `GET /api/products` | Catalogue |
| `GET /api/orders` | Recent orders (no longer shown in the UI) |
| `GET /api/orders/:orderNo` | One order |
| `POST /api/checkout` | Creates an order in `pending_payment` |
| `POST /api/orders/:orderNo/pay` | Charges, then invoices |

```bash
curl -X POST http://localhost:4321/api/checkout \
  -H 'Content-Type: application/json' \
  -d '{"full_name":"Arjun R.","email":"you@example.com",
       "lines":[{"sku":"ACM-MSE-01","qty":2}]}'
```

## Things worth knowing

- **Prices come from the catalogue, never the request.** A client that posts
  its own prices is a client that decides what it pays. Tax is server-side too.
- **One payment, one invoice.** `markPaid` is a single `findOneAndUpdate`
  matching `status: 'pending_payment'`, and it issues the invoice number in the
  same write. Two racing callbacks: one matches, one gets nothing. Paying twice
  returns `409`.
- **The invoice is sent after the payment is committed**, never inside it.
  Mailing a receipt for money the store might not have is worse than mailing late.
- **A failed email does not fail the payment.** The outcome is recorded on the
  order (`notification.status`) and the request still succeeds. Telling a
  customer their payment failed because an SMTP hop failed would be a lie.
- **No retry lives here.** A `502` from Notifyr means the send is already
  recorded and queued for another attempt. Retrying would double-send.
- **Email is real, SMS and push are stubs** on the Notifyr side. A successful
  SMS returns a `stub_sms_…` id — the pipeline is complete, the provider is not
  wired yet.

## This is a demo, not a production service

The boundaries and the state transitions are written the way they should be.
The surrounding infrastructure is not there, deliberately:

- **No authentication.** Both endpoints are open, and `recipient` comes from
  the request body. A real app takes it from the authenticated user's record —
  otherwise it is an open relay for sending mail to strangers.
- **No rate limiting**, no request ids, no structured logging, no health check,
  no graceful shutdown.
- **Card numbers reach the server.** Real integrations tokenize in the browser
  (Stripe Elements, Razorpay Checkout) and never let the PAN near their backend.
- **Money is stored as a float.** Production uses integer minor units or
  `Decimal128`.
- **`recordPayment` and `markPaid` are two separate writes.** A crash between
  them leaves a payment with no paid order; a real system needs a transaction
  or a reconciliation job.
- **A send that never reaches Notifyr is never retried** — it is marked
  `failed` on the order and left there. Production needs an outbox and a sweeper.
- **No tests.**
