# Crunchrr Admin Panel — System Design

Status: implemented (v1) · reviewed 2026-11-14 · owner: solo builder, zero human QA

## 1. Purpose & constraints

The admin panel is the single control plane for a print-on-demand streetwear
shop: catalog, orders, multi-vendor fulfillment, multi-country money, promos,
and webhook audit. Constraints that shaped it:

- **Solo builder, zero human QA.** Every admin surface must be
  malformation-proof (zod at every boundary) and auth-gated (fail closed).
- **Vendor-agnostic fulfillment.** 11 POD partners across India (Tamil Nadu
  first) and US/UK; adding a partner must be one file + one registry row.
- **Multi-country money.** Catalog prices in base USD; per-zone FX, fees,
  thresholds, tax. No per-country price lists to maintain.
- **No gateway account yet.** Demo payments must exercise the exact
  production code path, so the panel is QA'd against real behavior.

## 2. Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│ Browser                                                              │
│  /admin (Next.js client components)                                  │
│   - chrome.tsx: Clerk <Provider>, useSession gate, useAdminApi ctx   │
│   - admin-client.ts: fetch wrapper — FRESH token per request         │
│     (Clerk JWT rotates ~60s; a cached token 401s mid-session)        │
└──────────────┬───────────────────────────────────────────────────────┘
               │ HTTPS, Authorization: Bearer <clerk jwt>
┌──────────────▼───────────────────────────────────────────────────────┐
│ Fastify API (apps/api)                                               │
│  routes/admin.ts (20 endpoints) ── requireAdmin() on EVERY route     │
│      │  verifyClerkToken → ADMIN_CLERK_USER_IDS allowlist            │
│      │  (+ ADMIN_DEV_BYPASS, dev-only) → 401/403 fail closed         │
│      ▼                                                               │
│  services/                                                           │
│   orders.ts      zone-aware checkout, confirmPaymentAndDispatch,     │
│                  dispatchSplit (idempotent, event-logged)            │
│   partners/      registry → Qikink, Printrove (live) +               │
│                  GenericPodAdapter ×9 (simulated) + IN_HOUSE (manual)│
│                  creds: DB row FIRST, env fallback, masked at API    │
│   zones.ts       FX conversion, fee/threshold/tax per zone           │
│   promos.ts      DB-driven percent-off codes                         │
│   webhook-store  persist-first ingestion, event-id dedupe            │
│      │                                                               │
│      ▼  Drizzle ORM                                                  │
│  Neon Postgres: products · product_variants · orders · order_lines   │
│   · order_splits · order_events · partner_credentials ·              │
│   shipping_zones · promos · payment_webhooks                         │
└──────────────┬───────────────────────────────────────────────────────┘
               │ outbound: partner push APIs (15s timeout, abort)
               │ inbound:  Razorpay (HMAC-SHA256) / Cashfree webhooks
└──────────────────────────────────────────────────────────────────────┘
```

## 3. Core data flows

### 3.1 Payment → fulfillment (the money path)

```
webhook (or demo-confirm)
  → ingestWebhook: persist raw payload FIRST (provider, event_id unique)
  → signature verify (fail → INVALID_SIGNATURE, 401; stored row immutable)
  → confirmPaymentAndDispatch (idempotent: only from PENDING_PAYMENT)
      → order PAYMENT_CONFIRMED + event
      → split order_lines by variant.partner_id → order_splits rows
      → per split: dispatchSplit
            adapter.dispatch(order, lines, emitEvent)   [15s timeout]
            accepted  → split ACCEPTED_BY_PARTNER + partnerOrderId + event
            thrown    → split REJECTED_BY_PARTNER + PARTNER_DISPATCH_FAILED
                        ⚠ webhook still returns 200 (provider retries are
                        chaos; retry is a deliberate human/ops action)
  → admin Fulfillment queue: dispatch / re-dispatch / mark shipped (+tracking)
    / delivered — every transition appends order_events (audit trail)
```

Key property: **partner outage can never fail payment confirmation** — the
webhook path is decoupled from partner availability. The cost is that retries
are manual (see Gap G3).

### 3.2 Admin auth

```
per request: Clerk JWT → verifyClerkToken → userId
  401 UNAUTHENTICATED if no valid token (never leak whether user exists)
  403 FORBIDDEN      if userId ∉ ADMIN_CLERK_USER_IDS (and not dev bypass)
  → handler executes with zod-validated body
```

The web client resolves the token **per request** (not per session) because
Clerk JWTs rotate ~60s; chrome.tsx gates rendering on `isLoaded` so the first
fetch never fires with a dead token.

### 3.3 Money model (multi-country)

```
catalog price          base USD minor units (variant.price_minor)
zone row               currency, fxFromUsd, shippingFeeMinor, priorityFeeMinor,
                       freeThresholdMinor, taxBps   ← ALL in zone currency
checkout (per line)    zoneMinor = round(usdMinor/100 × fxFromUsd × 100)
totals                 promo (zone) → shipping (threshold) → tax (bps)
order lines store      BOTH price_minor (base) and converted context —
                       partner cost stays in base USD for margin math
```

Because every zone amount is derived at request time from one source of truth,
FX updates never rewrite historical orders (grand totals are persisted on the
order row at purchase).

## 4. Design decisions & trade-offs (ADR-lite)

| # | Decision | Alternative rejected | Why |
|---|----------|----------------------|-----|
| D1 | **USD minor-unit base price**, FX per zone at checkout | per-zone price tables | one catalog to maintain; FX is ops data, not product data. Cost: admin must reason in USD (revenue KPI aggregates per-currency). |
| D2 | **Partner creds in DB** (admin-editable), env as fallback | env-only creds | partners page can rotate creds without redeploy; secrets never echoed (masked `ID`/`Secret` hints). Cost: secret-at-rest = Neon storage (TLS + access control mitigate). |
| D3 | **Synchronous dispatch inside webhook path**, failure → REJECTED + audit event, manual retry | job queue/outbox worker | zero infra beyond Postgres; simplest correct v1; partner push is <15s. Cost: no auto-retry/backoff (G3). |
| D4 | **Persist-first webhooks**; processing errors still return 200 | 4xx/5xx on processing failure | providers aggressively retry non-2xx → duplicate processing storms; raw payload + event-id unique index gives full replay. Attacker replays cannot overwrite the stored original (`onConflictDoNothing`). |
| D5 | **Flat Clerk-id allowlist** for admin auth | RBAC roles | solo builder today; allowlist is a 1-line env change. Cost: no least-privilege split (G1). |
| D6 | **`order_events` append-only trail** per order | status-only columns | every state change (payment, split, dispatch, admin status change) is explainable to support and customers; also feeds the order-detail timeline. |
| D7 | **Zod at every API boundary** (admin + public) | TS-only types | solo QA + strangers on the internet: malformed bodies are rejected before business logic; admin UI shares the same schemas from `@crunchrr/shared`. |
| D8 | **GenericPodAdapter** for the 9 roster partners | per-platform adapters up front | the dispatch pipeline depends only on the `PartnerAdapter` interface; simulated acceptance keeps the pipeline real (splits, IDs, events) while live integrations land one at a time. |
| D9 | **10 admin pages = one shared fetcher** (`useAdminApi`) + tiny UI kit | per-page fetch logic | consistent 401/403 handling, consistent formatting (`formatMoney` zone-aware), consistent loading/error states. |

## 5. Threat model (admin surface)

| Threat | Control | Status |
|---|---|---|
| Random internet hit on `/api/admin/*` | Clerk JWT verify on every route, 401 fail-closed | ✅ |
| Stolen low-priv shopper account | user-id allowlist on top of JWT | ✅ (flat — G1) |
| Malformed/garbage admin input | zod parse before any write; numeric min/max; enums | ✅ |
| Secret exfiltration via API | credentials masked (`not set`), never echoed, no GET of secrets | ✅ |
| Webhook forgery | raw-byte HMAC (Razorpay) / SDK signature (Cashfree) before processing | ✅ |
| Webhook replay rewriting history | event-id unique + `onConflictDoNothing` | ✅ |
| Dev bypass leaking to prod | `ADMIN_DEV_BYPASS` gated on `NODE_ENV !== production` | ✅ |
| Enumeration / timing | generic 401 message; admin 403 identical shape to public errors | ✅ |
| Partner creds at rest in DB | Neon TLS + account isolation; rotation via admin UI | ⚠️ acceptable solo-stage risk |
| Admin brute-force / abuse rate | none (Clerk handles auth rate; API has no admin rate limit) | ❌ G5 |

## 6. Failure modes

| Failure | Behavior today | Recovery |
|---|---|---|
| Partner API down/timeout | 15s abort → split REJECTED_BY_PARTNER + `PARTNER_DISPATCH_FAILED` event; order stays PAID | Fulfillment queue → Dispatch (idempotent) |
| Bad/missing partner creds | simulation path (unconfigured) or adapter auth error → same REJECTED path | partners page → EDIT CREDS → TEST ping → re-dispatch |
| Webhook arrives before order commit | confirm only matches PENDING_PAYMENT; mismatch is logged + row kept for replay | webhooks page inspection; reprocess via demo/manual path |
| Duplicate webhook | event-id dedupe → `DUPLICATE` no-op | none needed |
| Clerk token rotation mid-session | per-request token resolution; `isLoaded` gate | none needed |
| DB unreachable | health endpoint reports; admin fetches error-note per page | Neon status/retry |
| Seed run on live data | seed TRUNCATEs catalog + order-linked tables | ⚠️ never run seed against prod after launch (README warns; fresh setups only) |

### 6.1 Operator ergonomics

| Surface | Behavior | Why |
|---|---|---|
| Command palette (`⌘K` / `Ctrl+K`) | Local page jump (instant) + debounced server search across orders (number/email), products (name/slug/SKU) and customers (name/email); ↑↓/↵/Esc; deep-links into detail pages (`?q=` on list pages) | one keyboard path for every ops task; no menu hunting |
| Alerts bell | 30s poll of `GET /api/admin/metrics` → webhook failures (24h), retry-exhausted splits, stuck splits (>10m), stock-outs, low stock; coral badge counts urgent items only | catches the failure modes in §6 without opening dashboards |
| Analytics range | `?days=7` / `30` / `90` (default 30, invalid clamps to 30); every table + trend series re-scoped server-side | comparisons stay apples-to-apples; no client-side slicing |

## 7. Gap analysis → roadmap

| # | Gap | Risk today | Fix (priority) |
|---|-----|------------|----------------|
| G1 | **No RBAC** — one flat allowlist; every admin can edit creds & zones | low (solo) | role column on admin users (OWNER/OPS/SUPPORT), `requireAdmin(role)` overload — P2 |
| G2 | **No admin action audit log** — order fulfillment events are logged; product/zone/promo/credential edits are not | medium | `admin_actions` table (who, what, before/after hash) written in every admin write route — **P1** |
| G3 | **No automatic dispatch retry** — failed splits need a human | medium | outbox table + retry worker (attempts, backoff, nextRunAt); queue page already exists as the manual fallback — **P1** |
| G4 | ~~No live updates~~ | ✅ **closed** | Overview + metrics poll 20s; Live Ops 15s |
| G5 | ~~No API rate limiting~~ | ✅ **closed** | `@fastify/rate-limit` global 300/min; admin 120/min, partner 60/min, checkout 20/min, demo 10/min; webhooks exempt (HMAC+dedupe) |
| G6 | ~~No metrics/observability~~ | ✅ **closed** | `GET /api/admin/metrics` (admin-gated): order/webhook/split status, stale+exhausted splits, inventory, worker counters, uptime, DB ping; Overview health strip |
| G7 | ~~No backup/DR runbook~~ | ✅ **closed** | `docs/runbook.md`: go-live checklist, timed restore drill, incident playbooks |
| G8 | **No partner portal** — vendors can't see their splits | none (internal ops) | scoped `/partner` role + split-filtered API (G1 prerequisite) — P3 |
| G9 | ~~FX/fee data is hand-set~~ | ✅ **closed** | `services/fx.ts`: market pull (open.er-api.com) every `FX_REFRESH_HOURS` (default 12), manual preview/apply on Countries, ±25% per-currency drift guard, audited |
| G10 | Seed truncates order-linked tables if run on live DB | one bad command from data loss | split `seed:catalog` vs `seed:fresh` scripts — **P1** (cheapest fix, highest footgun) |

## 8. Scaling path (what breaks first)

| Load | First bottleneck | Mitigation |
|---|---|---|
| ~100 orders/day | none | current design comfortable |
| ~10k orders/day | synchronous dispatch (webhook latency budget) | G3 outbox worker; batch partner pushes |
| ~10k orders/day | overview aggregates scan orders/events | materialized view or 5-min cache on `/overview`; indexes on `order_events.order_id, created_at` |
| multiple admins | audit + RBAC gaps (G1/G2) | required before hiring |
| partner SLAs | manual retry blind spots | G3 + G6 metrics alert on REJECTED rate |

## 9. Invariants worth preserving

1. **Money is computed server-side only** — the bag preview mirrors the API
   math but never substitutes for it.
2. **Every state transition writes an event row** — no silent updates.
3. **Partner availability never blocks payment confirmation.**
4. **Fail closed on auth; reject, don't coerce, malformed input.**
5. **Secrets are written, never read back.**
