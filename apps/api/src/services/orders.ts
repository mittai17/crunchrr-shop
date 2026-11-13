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
  productVariants,
  products,
  type OrderRow,
  type PartnerIdType,
} from "../db/schema.js";
import { computeTotals, formatMinor, promoFor, type Totals } from "../lib/money.js";
import { AppError, ConflictError, NotFoundError, ValidationError } from "../lib/errors.js";
import { createRazorpayOrder, isRazorpayConfigured } from "./payments/razorpay.js";
import { createCashfreeOrder, isCashfreeConfigured } from "./payments/cashfree.js";
import { env, isDemoPayments } from "../config/env.js";
import type { CheckoutRequest } from "@crunchrr/shared";

export type CheckoutResult = {
  order: OrderRow;
  totals: Totals;
  payment: {
    provider: "RAZORPAY" | "CASHFREE";
    gatewayOrderId: string;
    amountMinor: number;
    currency: "USD" | "INR";
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

  /* ---- 2. Totals from server prices ---- */
  const currency = input.clientCurrency;
  const itemsSubtotalMinor = resolvedLines.reduce(
    (sum, l) => sum + l.priceMinor * l.quantity,
    0,
  );
  const promo = promoFor(input.promoCode);
  if (input.promoCode && !promo) {
    throw new ValidationError(`Promo code '${input.promoCode}' is not valid`);
  }
  const totals = computeTotals({
    currency,
    itemsSubtotalMinor,
    deliveryMethod: input.deliveryMethod,
    promoCode: input.promoCode,
  });

  /* ---- 3. Gateway order (when configured) ---- */
  const demoMode =
    isDemoPayments(env()) ||
    (currency === "USD" ? !isRazorpayConfigured() : !isCashfreeConfigured());

  const orderNumber = generateOrderNumber();

  let provider: "RAZORPAY" | "CASHFREE";
  let gatewayOrderId: string;
  let publicKeyId: string | undefined;

  if (demoMode) {
    provider = "RAZORPAY";
    gatewayOrderId = `demo_${orderNumber}`;
  } else if (currency === "USD" && isRazorpayConfigured()) {
    provider = "RAZORPAY";
    const rzp = await createRazorpayOrder({
      amountMinor: totals.grandTotalMinor,
      currency,
      receipt: orderNumber,
      notes: { orderNumber },
    });
    gatewayOrderId = rzp.id;
    publicKeyId = env().RAZORPAY_KEY_ID;
  } else if (isCashfreeConfigured()) {
    provider = "CASHFREE";
    const cf = await createCashfreeOrder({
      orderNumber,
      amountMinor: totals.grandTotalMinor,
      currency,
      customer: {
        name: input.customer.name,
        email: input.customer.email,
        phone: input.customer.phone,
      },
    });
    gatewayOrderId = cf.order_id;
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
      currency,
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

  await db.insert(orderLines).values(
    resolvedLines.map((l) => ({
      orderId: order.id,
      variantId: l.variantId,
      name: l.name,
      sku: l.sku,
      size: l.size,
      colorway: l.colorway,
      quantity: l.quantity,
      priceMinor: l.priceMinor,
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
      currency,
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
      `Payment amount mismatch for ${order.orderNumber}: expected ${formatMinor(order.grandTotalMinor, order.currency as "USD" | "INR")}, received ${formatMinor(args.amountMinor, order.currency as "USD" | "INR")}`,
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
  }

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
    await db
      .update(orderSplits)
      .set({ status: "REJECTED_BY_PARTNER", partnerRef: { error: String(err) } })
      .where(eq(orderSplits.id, splitId));
    await db.insert(orderEvents).values({
      orderId: order.id,
      kind: "PARTNER_DISPATCH_FAILED",
      detail: { partnerId, error: err instanceof Error ? err.message : String(err) },
    });
  }
}

/** Mark a whole order as failed (payment failure webhooks). */
export async function failOrder(args: {
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
      currency: order.currency as "USD" | "INR",
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
      currency: order.currency as "USD" | "INR",
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
