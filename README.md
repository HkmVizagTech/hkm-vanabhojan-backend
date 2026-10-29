# Vanabhojanam backend

Express 5 + MongoDB (Mongoose) API for registration, Razorpay payments, WhatsApp (Gupshup), QR attendance and
certificates (Cloudflare R2).

```bash
cp .env.example .env     # fill in the values
npm install
npm run dev              # node --watch
npm test                 # jest + supertest + in-memory MongoDB
npm run create-admin -- "Name" admin@example.com 'a-strong-password'
```

## Layout

```
src/
  server.js        boot, graceful shutdown        app.js     middleware + routes
  config/          env (validated with zod), db, razorpay, constants (fees, roles, statuses)
  models/          Candidate, User, College
  validators/      zod schemas for every request body/param
  middlewares/     auth (JWT + roles), validate, errorHandler, rateLimit, upload
  routes/ -> controllers/ (thin) -> services/ (all business rules)
    payment.service     create order (server-side price), verify, markPaid (atomic, idempotent), reconcile, refund
    webhook.service     Razorpay events
    attendance.service  QR lookup, gate scan (atomic), reports
    certificate.service PDF render, R2 upload, WhatsApp delivery
    whatsapp.service    template notifications (never throw)
    storage.service     Cloudflare R2 (S3 API): ID cards (signed URLs) + certificates
  jobs/            paymentReconciler (cron safety net for missed webhooks)
tests/             auth, payments + webhook, attendance, colleges
```

## Yearly editions

Each Vanabhojanam is an **Event** (date, venue, student fee, fee for others, age range, registration open/closed).
Exactly one is *current*: the public site reads it from `GET /events/current`, new registrations are attached to it
and charged its fees. Admin pages filter by event, `GET /events/analytics` compares years (registered, attended,
revenue, returning people) and `GET /events/followup` lists people from one edition who have not registered for another.

## Security notes

* The fee is decided on the server from the candidate type; the amount sent by the browser is ignored.
* Payment confirmation is idempotent: checkout callback, webhook and cron can race and only one sends the WhatsApp.
* The first account created becomes admin; after that only an admin can create accounts. `GET /admin/users` is admin-only.
* JWT secret comes from the environment, tokens expire (`JWT_EXPIRES_IN`), login and public endpoints are rate limited.
* Student ID cards are served through 1-hour signed URLs (keep that bucket private).
* Never commit `.env`. Rotate any credential that has been pasted into chat or committed in the past.

## Razorpay webhook

Dashboard > Webhooks > URL `https://<host>/users/webhook`, secret = `RAZORPAY_WEBHOOK_SECRET`, events
`payment.captured`, `payment.failed`, `refund.processed`, `refund.failed`.
