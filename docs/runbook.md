# Crunchrr — Operations Runbook

Solo-operator runbook. Everything here is written to be executed while tired:
exact commands, exact expected output, and what "good" looks like.

---

## 1. Go-live checklist (in order)

| # | Step | Verify |
|---|------|--------|
| 1 | Create **production** Neon project `crunchrr-shop` (separate from dev) | `pnpm --filter @crunchrr/api exec drizzle-kit push` against prod URL applies cleanly |
| 2 | Create **production** Clerk application; set allowed origins to the real domain | Sign-in works on the deployed web app |
| 3 | Set `ADMIN_CLERK_USER_IDS` to the production Clerk user id(s) | Non-listed user gets 403 on `/api/admin/overview` |
| 4 | Set `ADMIN_DEV_BYPASS=false` and `PAYMENTS_DEMO=false` | `/api/orders/demo-confirm` returns 404 |
| 5 | Real Razorpay/Cashfree keys + webhook secrets; register the webhook URL in each dashboard | Send a test webhook → `payment_webhooks` row with `outcome=OK` |
| 6 | `CORS_ORIGINS` = the exact web domain (comma-separated, no wildcard) | Browser preflight from another origin fails |
| 7 | Deploy API (Fly/Render) + web (Vercel); set `NEXT_PUBLIC_API_URL` | `GET /api/health` → `status: ok, db: true` |
| 8 | **Never run `pnpm seed` against production.** Catalog-only path: `SEED_FORCE` is refused when orders exist | `pnpm seed` on prod prints the guard message and exits non-zero |
| 9 | Uptime monitor on `GET /api/health` every 60s; alert on non-200 or `db != true` | Test alert fires |
| 10 | Run the restore drill (§2) once, before launch | Timings recorded below |

## 2. Neon restore drill (do once, then quarterly)

1. Note a timestamp **before** a known order exists (e.g. right before a test checkout).
2. Place a real (test) order → note `orderNumber`.
3. In Neon console → **Branches → Restore branch → from timestamp (step 1)** → creates `restore-drill` branch.
4. Point a local `DATABASE_URL` at the branch. Run:
   `pnpm --filter @crunchrr/api exec tsx -e "import {getDb} from './src/db/client.js'; ..."` or simply:
   `curl localhost:4001/api/admin/orders?q=<orderNumber>` with the API pointed at the branch.
5. Expected: the order is **absent**. That proves PITR works and how long the restore takes.
6. Delete the drill branch. Record: restore created at ___, usable by ___, total time ___.

**Never "test" a restore by overwriting the main branch.**

## 3. Incident playbooks

### Webhook signature failing (`INVALID_SIGNATURE` in `payment_webhooks`)
- Check the secret in the gateway dashboard matches `RAZORPAY_WEBHOOK_SECRET` / `CASHFREE_WEBHOOK_SECRET` in the API env **byte-for-byte** (no trailing newline).
- Replay the event from the gateway dashboard once fixed. Idempotency makes replays safe.
- All raw payloads are stored (`payload_json`) — the original event is never lost.

### Order stuck in `PENDING_PAYMENT` after customer paid
1. Confirm capture in the gateway dashboard.
2. Production: replay the webhook from the gateway. Dev: `POST /api/orders/demo-confirm {orderId}`.
3. If the gateway amount differs from `grandTotalMinor`, the order is **failed deliberately** (`PAYMENT_AMOUNT_MISMATCH`) — investigate price tampering / stale FX before re-charging.

### Partner split `REJECTED_BY_PARTNER`
- The retry worker re-dispatches automatically every 60s, max **5 attempts** (attempts survive retries).
- Exhausted splits are surfaced as **Retry exhausted** on the Overview health strip and Live Ops.
- Fix the cause (partner credentials in Partners page, stock, address), then **Fulfillment → Retry all failed**.
- `IN_HOUSE` splits are never auto-retried — a human fulfils and marks them manually.

### Stale splits (>10 min PENDING) climbing on the health strip
- Partner API is down or slow. The worker keeps retrying; no data loss.
- Check partner status page / credentials; if the outage is long, reassign the split's vendor on **Inventory** or fulfil in-house (Partner = `IN_HOUSE` in the Partners page routing opinions).

### Refund
- **Always** `POST /api/orders/:id/refund` (or the **Refund** button). It restocks lines, cancels open splits, and writes audit events.
- Never flip the status to `REFUNDED` via the generic PATCH — that path exists only for legacy/admin correction and does **not** restock.
- After refund, verify the variant stock rose by the line quantities on **Inventory**.

### Database unreachable
- `GET /api/health` returns non-200 / `db:false`; all write routes fail closed.
- Check Neon status page and the project's compute autosuspend settings. No local action fixes Neon.

### Scheduled social post didn't publish
- The ops worker sweeps scheduled posts every 60s while the API is up. Check `social_posts.status` (`SCHEDULED` → `PUBLISHED`/`FAILED`).
- Publishing is **simulated** until per-platform OAuth apps are connected — `FAILED` means the adapter threw, not the platform.

## 4. Observability reference

- `GET /api/admin/metrics` (admin JWT) — one snapshot: order counts by status, 24h revenue per currency, webhook outcomes 24h, split statuses, stale/exhausted splits, inventory health, in-process worker counters, uptime, memory, DB ping.
- `GET /api/health` — public liveness: `{ status, db, uptimeSeconds, version }`.
- Overview page polls `/api/admin/overview` + `/api/admin/metrics` every **20s**; Live Ops polls every **15s**.
- **Alert on:** `dbOk=false`, `splits.stalePending > 0` for 15+ min, `splits.retryExhausted > 0`, any `INVALID_SIGNATURE`/`ERROR` webhook outcome, `inventory.out > 0` on a bestseller.

## 5. Rate limits (fail-closed defaults)

| Scope | Limit |
|---|---|
| Global default (all routes, per IP) | 300 / min |
| Admin API | 120 / min |
| Partner API | 60 / min |
| Checkout (`POST /api/orders/checkout`) | 20 / min |
| Order lookup | 30 / min |
| Demo-confirm (dev only) | 10 / min |
| Payment webhooks | **exempt** (gateways burst; HMAC + event-id dedupe protect them) |

429 responses are logged. If a legitimate integration (e.g. a status-page prober) trips a limit, raise that route's limit — never disable the global bucket.

## 6. Routine ops

**Daily:** health strip green; stale/exhausted splits zero; webhook outcomes clean; low-stock count trending.
**Weekly:** Analytics → margins + vendor scorecards; Live Ops audit trail skim; Zones FX sanity vs market; Studio queue.
**Monthly:** Neon restore drill record updated; rotate admin allowlist; review `admin_actions` for unfamiliar writes.
