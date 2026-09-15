# Demo Consumer App — Acme Storefront

A pretend storefront that consumes Notifyr. It owns **no** notification code:
no provider SDK, no email HTML, no retry loop, no delivery tracking. It holds
one API key and makes one HTTP call.

## The flow

```
add to cart → checkout → pay → invoice emailed
              (order created,  (gateway charges,   (INVOICE_PAID
               pending_payment) order → paid,       through Notifyr)
                                invoice issued)
```

Checkout sends nothing — an order nobody has paid for is not news.

## Setup

```bash
cp .env.example .env
npm install
npm run dev
```

Needs MongoDB running locally. Then open http://localhost:4321.

Before the first run, create in the Notifyr dashboard:

1. A project, if you don't have one
2. An `INVOICE_PAID` email template in it, declaring these variables:
   `customer_name`, `invoice_no`, `order_no`, `items_summary`, `subtotal`,
   `tax`, `amount_paid`, `payment_ref`, `paid_on`, `store_name`
3. An API key — the value is shown once; paste it into `.env`

To use a template you already have, set `NOTIFYR_TEMPLATE_KEY` instead. The app
sends a wide set of variables (listed in `.env.example`), so any template whose
variables are a subset of those works without a code change.

## Its own database

The store keeps its data in its **own** MongoDB database (`acme_storefront`),
not in Notifyr's.

| Collection | Holds |
|---|---|
| `products` | The catalogue, seeded on first boot |
| `orders` | Lines, totals, status, invoice number, invoice-email outcome |
| `payments` | One row per attempt — successes and failures |
| `counters` | Atomic sequences behind order and invoice numbers |

## Paying

The gateway in `payments.ts` is simulated: 700ms, returns a reference, and
declines any **card number starting `4000`**. UPI and net banking always
approve. Nothing real is charged.

| Outcome | What happens |
|---|---|
| Approved | payment row, order → `paid`, invoice issued, `INVOICE_PAID` sent |
| Declined | payment row with reason, order → `payment_failed`, **no email** |

## Layout

```
src/
  index.ts     Routes and startup
  db.ts        Connection, indexes, catalogue seed, sequences
  store.ts     Orders, payments, order → template variables
  payments.ts  The simulated gateway
  notifyr.ts   The only file that talks to Notifyr
  page.ts      The UI, one document
```

| Endpoint | |
|---|---|
| `GET /api/products` | Catalogue |
| `POST /api/checkout` | Creates an order in `pending_payment` |
| `POST /api/orders/:orderNo/pay` | Charges, then invoices |

## Things worth knowing

- **Prices come from the catalogue, never the request.** Tax is server-side too.
- **One payment, one invoice.** `markPaid` is a single `findOneAndUpdate`
  matching `status: 'pending_payment'` and issues the invoice number in the same
  write, so racing callbacks can't produce two invoices. Paying twice → `409`.
- **The invoice is sent after the payment is committed**, never inside it.
- **A failed email does not fail the payment.** The outcome is recorded on the
  order (`notification.status`) and the request still succeeds.
- **No retry lives here.** A `502` from Notifyr means the send is already
  recorded and queued for another attempt; retrying would double-send.

## This is a demo, not a production service

The boundaries and state transitions are written the way they should be. The
surrounding infrastructure is deliberately absent:

- **No authentication**, and `recipient` comes from the request body. A real app
  takes it from the authenticated user — otherwise it is an open mail relay.
- **No rate limiting**, request ids, structured logging, health check or
  graceful shutdown.
- **Card numbers reach the server.** Real integrations tokenize in the browser.
- **Money is stored as a float.** Production uses integer minor units.
- **`recordPayment` and `markPaid` are two separate writes** — a crash between
  them needs a transaction or a reconciliation job.
- **A send that never reaches Notifyr is never retried.**
- **No tests.**
