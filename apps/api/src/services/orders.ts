/**
 * Order service — checkout pipeline.
 *
 * Flow (single transaction where possible):
 *   1. Resolve + validate cart lines from DB (authoritative prices).
 *   2. Compute totals server-side.
 *   3. Create gateway order (Razorpay/Cashfree) when configured.
 *   4. Persist order + lines as PENDING_PAYMENT.
 *
 * Payment confirmation (webhook) triggers partner splitting & dispatch.
 */
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "../db/client.js";
import {
  orderEvents,
  orderLines,
  orderSplits,
  orders,
  partnerCredentials,
  productVariants,
  products,
  type OrderRow,
  type PartnerIdType,
} from "../db/schema.js";
import { computeZoneTotals, convertUsdMinorToZone, formatMinor, type Totals, type ZoneMoney } from "../lib/money.js";
import { getActivePromo, bumpPromoUsage } from "./promos.js";
import { resolveActiveZone } from "./zones.js";
import { sweepScheduledPosts } from "./social.js";
import { AppError, ConflictError, NotFoundError, ValidationError } from "../lib/errors.js";
import { createRazorpayOrder, isRazorpayConfigured } from "./payments/razorpay.js";
import { createCashfreeOrder, isCashfreeConfigured } from "./payments/cashfree.js";
import { env, isDemoPayments } from "../config/env.js";
import { inc } from "../lib/metrics.js";
import type { CheckoutRequest, Currency } from "@crunchrr/shared";

export type CheckoutResult = {
  order: OrderRow;
  totals: Totals;
  payment: {
    provider: "RAZORPAY" | "CASHFREE";
    gatewayOrderId: string;
    amountMinor: number;
    currency: Currency;
    publicKeyId?: string;
    demoMode: boolean;
  };
};

/** Generate a human-friendly order number: CR-24XXXX-#### */
function generateOrderNumber(): string {
  const t = Date.now().toString(36).toUpperCase().slice(-6);
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `CR-${t}-${rand}`;
}

export async function createCheckout(input: CheckoutRequest): Promise<CheckoutResult> {
  const db = getDb(env().DATABASE_URL);

  /* ---- 1. Resolve lines from DB (authoritative source of truth) ---- */
  const skus = input.lines.map((l) => l.variantSku);
  const variantRows = await db
    .select({
      variant: productVariants,
      product: {
        id: products.id,
        name: products.name,
        slug: products.slug,
        active: products.active,
      },
    })
    .from(productVariants)
    .innerJoin(products, eq(productVariants.productId, products.id))
    .where(inArray(productVariants.sku, skus));

  const bySku = new Map(variantRows.map((r) => [r.variant.sku, r]));

  const resolvedLines: Array<{
    variantId: string;
    name: string;
    sku: string;
    size: (typeof productVariants.$inferSelect)["size"];
    colorway: string;
    quantity: number;
    priceMinor: number;
    costMinor: number;
    partnerId: PartnerIdType;
  }> = [];

  for (const line of input.lines) {
    const row = bySku.get(line.variantSku);
    if (!row) {
      throw new NotFoundError("Product variant", line.variantSku);
    }
    if (!row.product.active || !row.variant.active) {
      throw new ConflictError(`SKU ${line.variantSku} is no longer available`);
    }
    if (row.variant.stock < line.quantity) {
      throw new ConflictError(
        `Only ${row.variant.stock} left of ${row.variant.sku} — requested ${line.quantity}`,
      );
    }
    resolvedLines.push({
      variantId: row.variant.id,
      name: row.product.name,
      sku: row.variant.sku,
      size: row.variant.size,
      colorway: row.variant.colorway,
      quantity: line.quantity,
      priceMinor: row.variant.priceMinor,
      costMinor: row.variant.partnerCostMinor,
      partnerId: row.variant.partnerId,
    });
  }

  /* ---- 2. Totals from server prices, in the destination zone currency ---- */
  const zone = await resolveActiveZone(input.shippingAddress.country);
  // Per-line conversion first so the persisted lines and the subtotal agree.
  const itemsSubtotalMinor = resolvedLines.reduce(
    (sum, l) => sum + convertUsdMinorToZone(l.priceMinor, zone) * l.quantity,
    0,
  );
  const promo = await getActivePromo(input.promoCode ?? "");
  if (input.promoCode && !promo) {
    throw new ValidationError(`Promo code '${input.promoCode}' is not valid`);
  }
  const totals = computeZoneTotals({
    zone,
    itemsSubtotalMinor,
    deliveryMethod: input.deliveryMethod,
    percentOff: promo?.percentOff ?? null,
  });

  /* ---- 3. Gateway order (when configured) ---- */
  const demoMode =
    isDemoPayments(env()) ||
    (totals.currency === "INR" ? !isCashfreeConfigured() : !isRazorpayConfigured());

  const orderNumber = generateOrderNumber();

  let provider: "RAZORPAY" | "CASHFREE";
  let gatewayOrderId: string;
  let publicKeyId: string | undefined;

  if (demoMode) {
    provider = "RAZORPAY";
    gatewayOrderId = `demo_${orderNumber}`;
  } else if (totals.currency === "INR" && isCashfreeConfigured()) {
    provider = "CASHFREE";
    const cf = await createCashfreeOrder({
      orderNumber,
      amountMinor: totals.grandTotalMinor,
      currency: totals.currency,
      customer: {
        name: input.customer.name,
        email: input.customer.email,
        phone: input.customer.phone,
      },
    });
    gatewayOrderId = cf.order_id;
  } else if (isRazorpayConfigured()) {
    provider = "RAZORPAY";
    const rzp = await createRazorpayOrder({
      amountMinor: totals.grandTotalMinor,
      currency: totals.currency,
      receipt: orderNumber,
      notes: { orderNumber },
    });
    gatewayOrderId = rzp.id;
    publicKeyId = env().RAZORPAY_KEY_ID;
  } else {
    // Fallback to demo rather than failing checkout for a storefront visit.
    provider = "RAZORPAY";
    gatewayOrderId = `demo_${orderNumber}`;
  }

  /* ---- 4. Persist order + lines ---- */
  const [order] = await db
    .insert(orders)
    .values({
      orderNumber,
      status: "PENDING_PAYMENT",
      email: input.customer.email,
      phone: input.customer.phone,
      customerName: input.customer.name,
      shipLine1: input.shippingAddress.line1,
      shipLine2: input.shippingAddress.line2 ?? null,
      shipCity: input.shippingAddress.city,
      shipState: input.shippingAddress.state,
      shipPostalCode: input.shippingAddress.postalCode,
      shipCountry: input.shippingAddress.country,
      deliveryMethod: input.deliveryMethod,
      currency: totals.currency,
      itemsSubtotalMinor: totals.itemsSubtotalMinor,
      discountMinor: totals.discountMinor,
      shippingMinor: totals.shippingMinor,
      taxMinor: totals.taxMinor,
      grandTotalMinor: totals.grandTotalMinor,
      promoCode: input.promoCode ?? null,
      paymentProvider: provider,
      paymentGatewayRef: gatewayOrderId,
    })
    .returning();

  if (!order) {
    throw new AppError(500, "ORDER_CREATE_FAILED", "Order row insert failed");
  }

  if (input.promoCode && promo) {
    await bumpPromoUsage(input.promoCode);
  }

  await db.insert(orderLines).values(
    resolvedLines.map((l) => ({
      orderId: order.id,
      variantId: l.variantId,
      name: l.name,
      sku: l.sku,
      size: l.size,
      colorway: l.colorway,
      quantity: l.quantity,
      priceMinor: convertUsdMinorToZone(l.priceMinor, zone),
      costMinor: l.costMinor,
      partnerId: l.partnerId,
    })),
  );

  await db.insert(orderEvents).values({
    orderId: order.id,
    kind: "CREATED",
    detail: {
      provider,
      gatewayOrderId,
      demoMode,
      promoApplied: promo ? promo.label : null,
    },
  });

  return {
    order,
    totals,
    payment: {
      provider,
      gatewayOrderId,
      amountMinor: totals.grandTotalMinor,
      currency: totals.currency,
      publicKeyId: demoMode ? undefined : publicKeyId,
      demoMode,
    },
  };
}

/* ------------------------------------------------------------------ */
/* Payment confirmation → partner splitting                            */
/* ------------------------------------------------------------------ */

/**
 * Idempotently confirm payment for an order, then split lines per partner
 * and dispatch each split to its partner API.
 * Returns the updated order.
 */
export async function confirmPaymentAndDispatch(args: {
  orderId: string;
  paymentRef: string;
  provider: "RAZORPAY" | "CASHFREE";
  amountMinor?: number;
}): Promise<OrderRow> {
  const db = getDb(env().DATABASE_URL);

  const order = await db.query.orders.findFirst({ where: eq(orders.id, args.orderId) });
  if (!order) throw new NotFoundError("Order", args.orderId);

  // Idempotency: payment already processed.
  if (order.status !== "PENDING_PAYMENT") {
    if (order.status === "PAYMENT_CONFIRMED" || order.paidAt) {
      // Already confirmed — safe no-op (webhook replays are common).
      return order;
    }
    if (order.status === "FAILED" || order.status === "CANCELLED") {
      throw new ConflictError(`Order ${order.orderNumber} is ${order.status}; cannot confirm payment`);
    }
  }

  // Amount tamper check when the gateway supplies the captured amount.
  if (
    typeof args.amountMinor === "number" &&
    args.amountMinor > 0 &&
    args.amountMinor !== order.grandTotalMinor
  ) {
    await db.insert(orderEvents).values({
      orderId: order.id,
      kind: "PAYMENT_AMOUNT_MISMATCH",
      detail: { expected: order.grandTotalMinor, received: args.amountMinor },
    });
    await db.update(orders).set({ status: "FAILED", updatedAt: new Date() }).where(eq(orders.id, order.id));
    throw new ConflictError(
      `Payment amount mismatch for ${order.orderNumber}: expected ${formatMinor(order.grandTotalMinor, order.currency as Currency)}, received ${formatMinor(args.amountMinor, order.currency as Currency)}`,
    );
  }

  // Mark paid (idempotent conditional update).
  const updated = await db
    .update(orders)
    .set({
      status: "PAYMENT_CONFIRMED",
      paymentRef: args.paymentRef,
      paidAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(orders.id, order.id), eq(orders.status, "PENDING_PAYMENT")))
    .returning();

  const paidOrder = updated[0] ?? order;
  if (updated.length > 0) {
    await db.insert(orderEvents).values({
      orderId: order.id,
      kind: "PAYMENT_CONFIRMED",
      detail: { provider: args.provider, paymentRef: args.paymentRef },
    });

    // Reserve stock exactly once (this block only runs on the first confirm —
    // webhook replays short-circuit above). Clamped at zero so a race can
    // never push stock negative.
    const paidLines = await db.select().from(orderLines).where(eq(orderLines.orderId, order.id));
    for (const line of paidLines) {
      await db
        .update(productVariants)
        .set({ stock: sql`greatest(${productVariants.stock} - ${line.quantity}, 0)` })
        .where(eq(productVariants.sku, line.sku));
    }
  }

  /* ---- Auto-routing: hand IN_HOUSE lines to the best regional partner ---- */
  await autoRouteLines(order);

  /* ---- Split lines per partner ---- */
  const lines = await db.select().from(orderLines).where(eq(orderLines.orderId, order.id));

  const byPartner = new Map<PartnerIdType, typeof lines>();
  for (const line of lines) {
    const bucket = byPartner.get(line.partnerId) ?? [];
    bucket.push(line);
    byPartner.set(line.partnerId, bucket);
  }

  for (const [partnerId, partnerLines] of byPartner) {
    // Skip already-created splits (webhook replay safety).
    const existingSplit = await db.query.orderSplits.findFirst({
      where: and(eq(orderSplits.orderId, order.id), eq(orderSplits.partnerId, partnerId)),
    });
    if (existingSplit) continue;

    const [split] = await db
      .insert(orderSplits)
      .values({
        orderId: order.id,
        partnerId,
        status: "PENDING",
      })
      .returning();
    if (!split) continue;

    for (const line of partnerLines) {
      await db.update(orderLines).set({ splitId: split.id }).where(eq(orderLines.id, line.id));
    }

    await db.insert(orderEvents).values({
      orderId: order.id,
      kind: "SPLIT_CREATED",
      detail: { partnerId, lines: partnerLines.map((l) => l.sku) },
    });

    /* ---- Dispatch to partner (non-blocking failure isolation) ---- */
    await dispatchSplit(split.id, partnerId);
  }

  const finalOrder = await db.query.orders.findFirst({ where: eq(orders.id, order.id) });
  if (!finalOrder) throw new NotFoundError("Order", args.orderId);
  return finalOrder;
}

/** Admin re-dispatch entry point (fulfillment queue retry). */
export async function dispatchSplitById(splitId: string): Promise<void> {
  const db = getDb(env().DATABASE_URL);
  const [split] = await db.select().from(orderSplits).where(eq(orderSplits.id, splitId)).limit(1);
  if (!split) throw new NotFoundError("Split", splitId);
  await dispatchSplit(splitId, split.partnerId);
}

async function dispatchSplit(splitId: string, partnerId: PartnerIdType): Promise<void> {
  const db = getDb(env().DATABASE_URL);

  // Dynamic import avoids a hard circular dependency at module init.
  const { getPartnerAdapter } = await import("./partners/registry.js");
  const adapter = getPartnerAdapter(partnerId);

  const split = await db.query.orderSplits.findFirst({
    where: eq(orderSplits.id, splitId),
  });
  const order = await db.query.orders.findFirst({
    where: eq(orders.id, split?.orderId ?? ""),
  });
  const lines = await db
    .select()
    .from(orderLines)
    .where(and(eq(orderLines.orderId, split?.orderId ?? ""), eq(orderLines.splitId, splitId)));

  if (!split || !order) return;

  if (!adapter) {
    await db
      .update(orderSplits)
      .set({ status: "REJECTED_BY_PARTNER", partnerRef: { reason: "no adapter" } })
      .where(eq(orderSplits.id, splitId));
    await db.insert(orderEvents).values({
      orderId: order.id,
      kind: "PARTNER_DISPATCH_FAILED",
      detail: { partnerId, reason: "No adapter registered" },
    });
    return;
  }

  try {
    const result = await adapter.dispatch({
      order,
      lines,
      emitEvent: (kind, detail) => {
        void db
          .insert(orderEvents)
          .values({ orderId: order.id, kind, detail: detail ?? null })
          .catch(() => undefined);
      },
    });

    await db
      .update(orderSplits)
      .set({
        status: result.status,
        partnerOrderId: result.partnerOrderId,
        partnerRef: result.partnerRef,
      })
      .where(eq(orderSplits.id, splitId));

    await db.insert(orderEvents).values({
      orderId: order.id,
      kind: result.status === "ACCEPTED_BY_PARTNER" ? "PARTNER_ACCEPTED" : "PARTNER_REJECTED",
      detail: { partnerId, partnerOrderId: result.partnerOrderId, message: result.message },
    });
  } catch (err) {
    // Partner outage must never fail the payment webhook (return 200, retry later).
    // Preserve the retry-attempts counter the ops worker keeps in partnerRef.
    await db
      .update(orderSplits)
      .set({
        status: "REJECTED_BY_PARTNER",
        partnerRef: { ...((split.partnerRef as Record<string, unknown>) ?? {}), error: String(err) },
      })
      .where(eq(orderSplits.id, splitId));
    await db.insert(orderEvents).values({
      orderId: order.id,
      kind: "PARTNER_DISPATCH_FAILED",
      detail: { partnerId, error: err instanceof Error ? err.message : String(err) },
    });
  }
}

/* ------------------------------------------------------------------ */
/* Smart Ops — auto-routing + retry worker                              */
/* ------------------------------------------------------------------ */

/** Country → routing region bucket. */
export function regionForCountry(countryCode: string): "IN" | "US" | "UK" | "EU" | "GLOBAL" {
  if (countryCode === "IN") return "IN";
  if (["US", "CA", "AU", "SG", "MX", "BR", "NZ"].includes(countryCode)) return "US";
  if (countryCode === "GB") return "UK";
  if (["DE", "FR", "NL", "IT", "ES", "IE"].includes(countryCode)) return "EU";
  return "GLOBAL";
}

/** Preferred partner order per region — live adapters first. */
const REGION_PREFERENCE: Record<string, PartnerIdType[]> = {
  IN: ["PRINTROVE", "QIKINK", "INKMONK", "BLINKSTORE"],
  US: ["PRINTFUL", "GOOTEN", "PRINTIFY", "GELATO"],
  UK: ["INKTHREADABLE", "CONTRADO", "GELATO"],
  EU: ["GELATO", "INKTHREADABLE", "CONTRADO"],
  GLOBAL: ["GELATO", "PRINTFUL", "QIKINK"],
};

/**
 * Auto-routing engine: lines still on IN_HOUSE (no vendor assigned) are
 * handed to the first ACTIVE partner matching the destination's region.
 * Explicit vendor assignments (Qikink/Printrove/…) are never overridden.
 */
async function autoRouteLines(order: OrderRow): Promise<void> {
  const db = getDb(env().DATABASE_URL);
  const lines = await db.select().from(orderLines).where(eq(orderLines.orderId, order.id));
  const unrouted = lines.filter((l) => l.partnerId === "IN_HOUSE");
  if (unrouted.length === 0) return;

  const region = regionForCountry(order.shipCountry);
  const preference = REGION_PREFERENCE[region] ?? REGION_PREFERENCE.GLOBAL ?? [];
  const activePartners = await db
    .select({ partnerId: partnerCredentials.partnerId })
    .from(partnerCredentials)
    .where(eq(partnerCredentials.active, true));
  const active = new Set(activePartners.map((p) => p.partnerId));
  const target = preference.find((p) => active.has(p)) ?? "IN_HOUSE";

  if (target === "IN_HOUSE") return; // no active regional partner — keep manual

  for (const line of unrouted) {
    await db.update(orderLines).set({ partnerId: target }).where(eq(orderLines.id, line.id));
  }
  await db.insert(orderEvents).values({
    orderId: order.id,
    kind: "AUTO_ROUTED",
    detail: {
      from: "IN_HOUSE",
      to: target,
      region,
      country: order.shipCountry,
      lines: unrouted.map((l) => l.sku),
    },
  });
}

/**
 * Retry worker — sweeps REJECTED_BY_PARTNER splits and re-dispatches them
 * with capped attempts (5). One process owns the loop; a module flag keeps
 * double-starts harmless.
 */
let retryWorkerStarted = false;
const MAX_DISPATCH_ATTEMPTS = 5;
const RETRY_INTERVAL_MS = 60_000;

export function startDispatchRetryWorker(): void {
  if (retryWorkerStarted) return;
  retryWorkerStarted = true;

  const sweep = async (): Promise<void> => {
    inc("worker.retry.sweeps");
    try {
      const db = getDb(env().DATABASE_URL);
      const rejected = await db
        .select()
        .from(orderSplits)
        .where(eq(orderSplits.status, "REJECTED_BY_PARTNER"));

      for (const split of rejected) {
        if (split.partnerId === "IN_HOUSE") continue; // manual — human retries
        const ref = (split.partnerRef ?? {}) as { attempts?: number };
        const attempts = ref.attempts ?? 0;
        if (attempts >= MAX_DISPATCH_ATTEMPTS) continue;

        const next = attempts + 1;
        await db
          .update(orderSplits)
          .set({ partnerRef: { ...ref, attempts: next }, status: "PENDING" })
          .where(eq(orderSplits.id, split.id));
        await db.insert(orderEvents).values({
          orderId: split.orderId,
          kind: "AUTO_RETRY",
          detail: { partnerId: split.partnerId, attempt: next, max: MAX_DISPATCH_ATTEMPTS },
        }).catch(() => undefined);
        inc("worker.retry.redispatched");
        await dispatchSplitById(split.id).catch(() => undefined);
      }
    } catch {
      // Sweep failures are logged by the DB layer; never crash the loop.
    }

    // Social Studio — publish scheduled posts whose time has come.
    await sweepScheduledPosts();
  };

  void sweep();
  setInterval(() => void sweep(), RETRY_INTERVAL_MS).unref();
}

/** Mark a whole order as failed (payment failure webhooks). */export async function failOrder(args: {
  orderId: string;
  reason: string;
}): Promise<OrderRow | null> {
  const db = getDb(env().DATABASE_URL);
  const updated = await db
    .update(orders)
    .set({ status: "FAILED", updatedAt: new Date() })
    .where(and(eq(orders.id, args.orderId), eq(orders.status, "PENDING_PAYMENT")))
    .returning();
  if (updated[0]) {
    await db.insert(orderEvents).values({
      orderId: args.orderId,
      kind: "PAYMENT_FAILED",
      detail: { reason: args.reason },
    });
  }
  return updated[0] ?? null;
}

/** Serialize an order row (+ splits) for API responses. */
export async function serializeOrder(orderId: string) {
  const db = getDb(env().DATABASE_URL);
  const order = await db.query.orders.findFirst({ where: eq(orders.id, orderId) });
  if (!order) throw new NotFoundError("Order", orderId);
  const splits = await db.query.orderSplits.findMany({
    where: eq(orderSplits.orderId, orderId),
  });
  const lines = await db.select().from(orderLines).where(eq(orderLines.orderId, orderId));
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    userId: order.userId,
    email: order.email,
    totals: {
      currency: order.currency as Currency,
      itemsSubtotalMinor: order.itemsSubtotalMinor,
      discountMinor: order.discountMinor,
      shippingMinor: order.shippingMinor,
      taxMinor: order.taxMinor,
      grandTotalMinor: order.grandTotalMinor,
    },
    paymentProvider: order.paymentProvider,
    paymentRef: order.paymentRef,
    splits: splits.map((s) => ({
      id: s.id,
      partnerId: s.partnerId,
      partnerOrderId: s.partnerOrderId,
      status: s.status,
      lines: lines
        .filter((l) => l.splitId === s.id)
        .map((l) => ({
          sku: l.sku,
          name: l.name,
          quantity: l.quantity,
          partnerCostMinor: l.costMinor,
        })),
    })),
    createdAt: order.createdAt.toISOString(),
  };
}

/** Order lookup by the human-readable order number (order tracking screen). */
export async function serializeOrderByNumber(orderNumber: string) {
  const db = getDb(env().DATABASE_URL);
  const order = await db.query.orders.findFirst({
    where: eq(orders.orderNumber, orderNumber.toUpperCase()),
  });
  if (!order) throw new NotFoundError("Order", orderNumber);
  return serializeOrder(order.id);
}

/** Compact per-order summaries for the signed-in account feed. */
export async function listOrderSummariesByUser(userId: string) {
  const db = getDb(env().DATABASE_URL);
  const rows = await db.query.orders.findMany({
    where: eq(orders.userId, userId),
    orderBy: [desc(orders.createdAt)],
    limit: 50,
    with: {
      lines: true,
    },
  });
  return rows.map((order) => {
    const previewLine = order.lines[0]
      ? `${order.lines[0].quantity}× ${order.lines[0].name}`
      : "—";
    return {
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      grandTotalMinor: order.grandTotalMinor,
      currency: order.currency as Currency,
      itemCount: order.lines.reduce((sum, l) => sum + l.quantity, 0),
      previewLine,
      createdAt: order.createdAt.toISOString(),
    };
  });
}

/** Health probe for the DB connection. */
export async function pingDb(): Promise<boolean> {
  try {
    const db = getDb(env().DATABASE_URL);
    await db.execute(sql`SELECT 1`);
    return true;
  } catch {
    return false;
  }
}
