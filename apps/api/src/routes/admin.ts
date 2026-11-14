/**
 * Admin routes — the control plane for the storefront.
 *
 * Every route is gated by requireAdmin (Clerk token + allowlist / dev bypass).
 * Surfaces: overview KPIs, orders, catalog, partners (multi-vendor),
 * fulfillment splits, payment webhook audit, shipping zones (multi-country)
 * and promo codes.
 */
import type { FastifyInstance } from "fastify";
import { and, desc, eq, gte, ilike, inArray, or, sql } from "drizzle-orm";
import { z } from "zod";
import {
  adminOrderRowSchema,
  adminOverviewSchema,
  adminPartnerSchema,
  adminSplitRowSchema,
  adminWebhookRowSchema,
  orderResponseSchema,
  promoUpsertSchema,
  zoneUpsertSchema,
  PARTNER_IDS,
  type Currency,
  type OrderStatus,
  type PartnerId,
} from "@crunchrr/shared";
import { getDb } from "../db/client.js";
import {
  orderEvents,
  orderLines,
  orderSplits,
  orders,
  partnerCredentials,
  paymentWebhooks,
  productImages,
  productVariants,
  products,
} from "../db/schema.js";
import { env } from "../config/env.js";
import { requireAdmin } from "../lib/admin-auth.js";
import { AppError, NotFoundError, ValidationError } from "../lib/errors.js";
import { serializeOrder } from "../services/orders.js";
import { listZones, upsertZone, setZoneActive } from "../services/zones.js";
import { listPromos, upsertPromo } from "../services/promos.js";
import { getPartnerAdapter } from "../services/partners/registry.js";
import { maskSecret, resolvePartnerConfig } from "../services/partners/config.js";

/** Order statuses that represent realized revenue. */
const PAID_STATUSES: OrderStatus[] = [
  "PAYMENT_CONFIRMED",
  "PARTNER_DISPATCHED",
  "SHIPPED",
  "DELIVERED",
];

const OPEN_SPLIT_STATUSES = ["PENDING", "SENT_TO_PARTNER", "ACCEPTED_BY_PARTNER"] as const;

export async function adminRoutes(app: FastifyInstance): Promise<void> {
  /* ---------------------------------------------------------------- */
  /* Overview                                                          */
  /* ---------------------------------------------------------------- */

  app.get("/api/admin/overview", async (req) => {
    await requireAdmin(req);
    const db = getDb(env().DATABASE_URL);
    const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000);
    const weekAgoSql = weekAgo.toISOString();
    const dayAgo = new Date(Date.now() - 24 * 3600 * 1000);
    const dayAgoSql = dayAgo.toISOString();

    const [totalsRow] = await db
      .select({
        total: sql<number>`count(*)::int`,
        last7d: sql<number>`(count(*) filter (where ${orders.createdAt} >= ${weekAgoSql}))::int`,
        pendingPayment: sql<number>`(count(*) filter (where ${orders.status} = 'PENDING_PAYMENT'))::int`,
      })
      .from(orders);

    const [splitRow] = await db
      .select({
        queue: sql<number>`(count(*) filter (where ${orderSplits.status} in ('PENDING','SENT_TO_PARTNER','ACCEPTED_BY_PARTNER')))::int`,
        rejected: sql<number>`(count(*) filter (where ${orderSplits.status} = 'REJECTED_BY_PARTNER'))::int`,
      })
      .from(orderSplits);

    const revenueRows = await db
      .select({
        currency: orders.currency,
        minor: sql<number>`coalesce(sum(${orders.grandTotalMinor}), 0)::int`,
        count: sql<number>`count(*)::int`,
      })
      .from(orders)
      .where(inArray(orders.status, PAID_STATUSES))
      .groupBy(orders.currency);

    const seriesRows = await db
      .select({
        day: sql<string>`to_char(date_trunc('day', ${orders.createdAt}), 'YYYY-MM-DD')`,
        currency: orders.currency,
        minor: sql<number>`coalesce(sum(${orders.grandTotalMinor}), 0)::int`,
        count: sql<number>`count(*)::int`,
      })
      .from(orders)
      .where(gte(orders.createdAt, weekAgo))
      .groupBy(sql`date_trunc('day', ${orders.createdAt})`, orders.currency)
      .orderBy(sql`date_trunc('day', ${orders.createdAt})`);

    // Currency → USD fx (first active zone with that currency wins).
    const zones = await listZones({ activeOnly: true });
    const fxByCurrency = new Map<string, number>();
    for (const zone of zones) {
      if (!fxByCurrency.has(zone.currency)) fxByCurrency.set(zone.currency, zone.fxFromUsd);
    }

    const seriesByDay = new Map<string, { minorUsd: number; orders: number }>();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 24 * 3600 * 1000).toISOString().slice(0, 10);
      seriesByDay.set(d, { minorUsd: 0, orders: 0 });
    }
    for (const row of seriesRows) {
      const bucket = seriesByDay.get(row.day);
      if (!bucket) continue;
      const fx = fxByCurrency.get(row.currency) ?? 1;
      bucket.minorUsd += Math.round(row.minor / (fx || 1));
      bucket.orders += row.count;
    }

    const lowStock = await db
      .select({
        sku: productVariants.sku,
        name: products.name,
        colorway: productVariants.colorway,
        size: productVariants.size,
        stock: productVariants.stock,
        partnerId: productVariants.partnerId,
      })
      .from(productVariants)
      .innerJoin(products, eq(productVariants.productId, products.id))
      .where(and(eq(productVariants.active, true), sql`${productVariants.stock} <= 4`))
      .orderBy(productVariants.stock)
      .limit(8);

    const [webhookRow] = await db
      .select({
        failures: sql<number>`(count(*) filter (where ${paymentWebhooks.outcome} in ('INVALID_SIGNATURE','ERROR')))::int`,
      })
      .from(paymentWebhooks)
      .where(gte(paymentWebhooks.receivedAt, dayAgo));

    const parsed = adminOverviewSchema.safeParse({
      orders: {
        total: totalsRow?.total ?? 0,
        last7d: totalsRow?.last7d ?? 0,
        pendingPayment: totalsRow?.pendingPayment ?? 0,
        fulfilmentQueue: splitRow?.queue ?? 0,
        partnerRejected: splitRow?.rejected ?? 0,
      },
      revenue: revenueRows.map((r) => ({ currency: r.currency, minor: r.minor, orders: r.count })),
      series7d: [...seriesByDay.entries()].map(([date, v]) => ({ date, ...v })),
      lowStock,
      webhookFailures24h: webhookRow?.failures ?? 0,
    });
    if (!parsed.success) {
      req.log.error({ issues: parsed.error.issues }, "admin overview serialization mismatch");
      throw new AppError(500, "SERIALIZATION", "Could not serialize overview.");
    }
    return parsed.data;
  });

  /* ---------------------------------------------------------------- */
  /* Orders                                                            */
  /* ---------------------------------------------------------------- */

  app.get("/api/admin/orders", async (req) => {
    await requireAdmin(req);
    const q = z
      .object({
        status: z.string().optional(),
        q: z.string().max(120).optional(),
        limit: z.coerce.number().int().min(1).max(50).default(25),
        offset: z.coerce.number().int().min(0).default(0),
      })
      .parse(req.query ?? {});

    const db = getDb(env().DATABASE_URL);
    const filters = [];
    if (q.status && q.status !== "ALL") filters.push(eq(orders.status, q.status as OrderStatus));
    if (q.q) {
      const like = `%${q.q}%`;
      filters.push(or(ilike(orders.orderNumber, like), ilike(orders.email, like)));
    }

    const rows = await db
      .select()
      .from(orders)
      .where(filters.length ? and(...filters) : undefined)
      .orderBy(desc(orders.createdAt))
      .limit(q.limit)
      .offset(q.offset);

    const ids = rows.map((r) => r.id);
    const splits = ids.length
      ? await db
          .select({ orderId: orderSplits.orderId, partnerId: orderSplits.partnerId })
          .from(orderSplits)
          .where(inArray(orderSplits.orderId, ids))
      : [];
    const counts = ids.length
      ? await db
          .select({ orderId: orderLines.orderId, qty: sql<number>`coalesce(sum(${orderLines.quantity}),0)::int` })
          .from(orderLines)
          .where(inArray(orderLines.orderId, ids))
          .groupBy(orderLines.orderId)
      : [];

    const partnerMap = new Map<string, string[]>();
    for (const s of splits) {
      partnerMap.set(s.orderId, [...(partnerMap.get(s.orderId) ?? []), s.partnerId]);
    }
    const countMap = new Map(counts.map((c) => [c.orderId, c.qty]));

    return {
      orders: rows.map((r) =>
        adminOrderRowSchema.parse({
          id: r.id,
          orderNumber: r.orderNumber,
          email: r.email,
          status: r.status,
          currency: r.currency,
          grandTotalMinor: r.grandTotalMinor,
          itemCount: countMap.get(r.id) ?? 0,
          partnerIds: partnerMap.get(r.id) ?? [],
          createdAt: r.createdAt.toISOString(),
        }),
      ),
    };
  });

  app.get("/api/admin/orders/:id", async (req, reply) => {
    await requireAdmin(req);
    const { id } = req.params as { id: string };
    const data = await serializeOrder(id);
    const db = getDb(env().DATABASE_URL);
    const events = await db
      .select()
      .from(orderEvents)
      .where(eq(orderEvents.orderId, id))
      .orderBy(orderEvents.createdAt);
    const [row] = await db
      .select({
        customerName: orders.customerName,
        phone: orders.phone,
        shipLine1: orders.shipLine1,
        shipLine2: orders.shipLine2,
        shipCity: orders.shipCity,
        shipState: orders.shipState,
        shipPostalCode: orders.shipPostalCode,
        shipCountry: orders.shipCountry,
        deliveryMethod: orders.deliveryMethod,
      })
      .from(orders)
      .where(eq(orders.id, id))
      .limit(1);
    const parsed = orderResponseSchema.safeParse(data);
    if (!parsed.success) {
      req.log.error({ issues: parsed.error.issues }, "admin order serialization mismatch");
      throw new NotFoundError("Order", id);
    }
    return reply.send({
      order: parsed.data,
      customer: row,
      events: events.map((e) => ({
        kind: e.kind,
        detail: e.detail,
        createdAt: e.createdAt.toISOString(),
      })),
    });
  });

  app.patch("/api/admin/orders/:id/status", async (req) => {
    await requireAdmin(req);
    const { id } = req.params as { id: string };
    const body = z
      .object({
        status: z.enum([
          "PENDING_PAYMENT",
          "PAYMENT_CONFIRMED",
          "PARTNER_DISPATCHED",
          "SHIPPED",
          "DELIVERED",
          "CANCELLED",
          "REFUNDED",
          "FAILED",
        ]),
        note: z.string().max(280).optional(),
      })
      .parse(req.body);

    const db = getDb(env().DATABASE_URL);
    const [order] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
    if (!order) throw new NotFoundError("Order", id);

    await db
      .update(orders)
      .set({ status: body.status, updatedAt: new Date() })
      .where(eq(orders.id, id));

    // Cancelling / refunding also closes any open partner splits.
    if (body.status === "CANCELLED" || body.status === "REFUNDED") {
      await db
        .update(orderSplits)
        .set({ status: "CANCELLED" })
        .where(and(eq(orderSplits.orderId, id), inArray(orderSplits.status, [...OPEN_SPLIT_STATUSES])));
    }

    await db.insert(orderEvents).values({
      orderId: id,
      kind: `ADMIN_STATUS_${body.status}`,
      detail: { from: order.status, to: body.status, note: body.note ?? null, by: "admin" },
    });

    return { ok: true, status: body.status };
  });

  /* ---------------------------------------------------------------- */
  /* Catalog                                                           */
  /* ---------------------------------------------------------------- */

  app.get("/api/admin/products", async (req) => {
    await requireAdmin(req);
    const q = z.object({ q: z.string().max(120).optional() }).parse(req.query ?? {});
    const db = getDb(env().DATABASE_URL);

    const rows = await db
      .select()
      .from(products)
      .where(q.q ? ilike(products.name, `%${q.q}%`) : undefined)
      .orderBy(desc(products.featured), products.name)
      .limit(50);

    const variants = rows.length
      ? await db
          .select()
          .from(productVariants)
          .where(inArray(productVariants.productId, rows.map((r) => r.id)))
      : [];
    const images = rows.length
      ? await db
          .select()
          .from(productImages)
          .where(inArray(productImages.productId, rows.map((r) => r.id)))
      : [];

    return {
      products: rows.map((p) => {
        const vs = variants.filter((v) => v.productId === p.id);
        const imgs = images
          .filter((i) => i.productId === p.id)
          .sort((a, b) => a.position - b.position);
        return {
          id: p.id,
          slug: p.slug,
          name: p.name,
          category: p.category,
          collection: p.collection,
          active: p.active,
          featured: p.featured,
          image: imgs[0]?.url ?? null,
          variantCount: vs.length,
          totalStock: vs.reduce((s, v) => s + v.stock, 0),
          priceMinMinor: vs.length ? Math.min(...vs.map((v) => v.priceMinor)) : 0,
          priceMaxMinor: vs.length ? Math.max(...vs.map((v) => v.priceMinor)) : 0,
          partners: [...new Set(vs.map((v) => v.partnerId))],
        };
      }),
    };
  });

  app.get("/api/admin/products/:id", async (req) => {
    await requireAdmin(req);
    const { id } = req.params as { id: string };
    const db = getDb(env().DATABASE_URL);
    const [p] = await db.select().from(products).where(eq(products.id, id)).limit(1);
    if (!p) throw new NotFoundError("Product", id);
    const vs = await db
      .select()
      .from(productVariants)
      .where(eq(productVariants.productId, id))
      .orderBy(productVariants.colorway, productVariants.size);
    const imgs = await db
      .select()
      .from(productImages)
      .where(eq(productImages.productId, id))
      .orderBy(productImages.position);
    const badgeText = (p.badge as { text?: string } | null)?.text ?? null;
    return {
      product: {
        id: p.id,
        slug: p.slug,
        name: p.name,
        category: p.category,
        collection: p.collection,
        active: p.active,
        featured: p.featured,
        image: imgs[0]?.url ?? null,
        variantCount: vs.length,
        totalStock: vs.reduce((s, v) => s + v.stock, 0),
        priceMinMinor: vs.length ? Math.min(...vs.map((v) => v.priceMinor)) : 0,
        priceMaxMinor: vs.length ? Math.max(...vs.map((v) => v.priceMinor)) : 0,
        partners: [...new Set(vs.map((v) => v.partnerId))],
        tagline: p.tagline,
        description: p.description,
        gsmLabel: p.gsmLabel,
        fabricLabel: p.fabricLabel,
        badgeText,
      },
      variants: vs.map((v) => ({
        id: v.id,
        sku: v.sku,
        size: v.size,
        colorway: v.colorway,
        colorHex: v.colorHex,
        stock: v.stock,
        partnerId: v.partnerId,
        partnerCostMinor: v.partnerCostMinor,
        priceMinor: v.priceMinor,
        comparePriceMinor: v.comparePriceMinor,
        active: v.active,
      })),
      images: imgs.map((i) => ({ id: i.id, url: i.url, alt: i.alt, position: i.position })),
    };
  });

  app.patch("/api/admin/products/:id", async (req) => {
    await requireAdmin(req);
    const { id } = req.params as { id: string };
    const body = z
      .object({
        name: z.string().min(1).max(160).optional(),
        tagline: z.string().max(240).optional(),
        description: z.string().max(4000).optional(),
        category: z.string().max(40).optional(),
        collection: z.string().max(80).optional(),
        gsmLabel: z.string().max(40).optional(),
        fabricLabel: z.string().max(120).optional(),
        badgeText: z.string().max(40).nullable().optional(),
        active: z.boolean().optional(),
        featured: z.boolean().optional(),
      })
      .parse(req.body);

    const db = getDb(env().DATABASE_URL);
    const [existing] = await db.select().from(products).where(eq(products.id, id)).limit(1);
    if (!existing) throw new NotFoundError("Product", id);

    const updates: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(body)) {
      if (v === undefined) continue;
      if (k === "badgeText") {
        updates.badge = v === null ? null : { text: v as string, tone: "coral" };
      } else {
        updates[k] = v;
      }
    }
    if (Object.keys(updates).length === 0) return { ok: true };

    await db.update(products).set(updates).where(eq(products.id, id));
    return { ok: true };
  });

  app.patch("/api/admin/variants/:id", async (req) => {
    await requireAdmin(req);
    const { id } = req.params as { id: string };
    const body = z
      .object({
        priceMinor: z.number().int().min(0).max(100_000_000).optional(),
        comparePriceMinor: z.number().int().min(0).max(100_000_000).nullable().optional(),
        stock: z.number().int().min(0).max(100_000).optional(),
        partnerCostMinor: z.number().int().min(0).max(100_000_000).optional(),
        partnerId: z.enum(PARTNER_IDS).optional(),
        active: z.boolean().optional(),
      })
      .parse(req.body);

    const db = getDb(env().DATABASE_URL);
    const updates = Object.fromEntries(Object.entries(body).filter(([, v]) => v !== undefined));
    if (Object.keys(updates).length === 0) return { ok: true };

    const updated = await db
      .update(productVariants)
      .set(updates)
      .where(eq(productVariants.id, id))
      .returning({ id: productVariants.id, sku: productVariants.sku });
    if (!updated[0]) throw new NotFoundError("Variant", id);
    return { ok: true, variant: updated[0] };
  });

  /* ---------------------------------------------------------------- */
  /* Partners (multi-vendor)                                           */
  /* ---------------------------------------------------------------- */

  app.get("/api/admin/partners", async (req) => {
    await requireAdmin(req);
    const db = getDb(env().DATABASE_URL);
    const rows = await db.select().from(partnerCredentials);
    const partnerIds = PARTNER_IDS;

    const out = [];
    for (const pid of partnerIds) {
      const cfg = await resolvePartnerConfig(pid);
      const row = rows.find((r) => r.partnerId === pid);
      const [splitStats] = await db
        .select({
          total: sql<number>`count(*)::int`,
          open: sql<number>`count(*) filter (where ${orderSplits.status} in ('PENDING','SENT_TO_PARTNER','ACCEPTED_BY_PARTNER'))::int`,
          rejected: sql<number>`count(*) filter (where ${orderSplits.status} = 'REJECTED_BY_PARTNER')::int`,
          shipped: sql<number>`count(*) filter (where ${orderSplits.status} in ('SHIPPED','DELIVERED'))::int`,
        })
        .from(orderSplits)
        .where(eq(orderSplits.partnerId, pid));

      out.push(
        adminPartnerSchema.parse({
          partnerId: pid,
          configured: cfg.configured,
          active: row?.active ?? cfg.active,
          apiBaseUrl: row?.apiBaseUrl ?? cfg.apiBaseUrl,
          authHint: row?.authHint ?? null,
          clientId: cfg.clientId ? maskSecret(cfg.clientId) : null,
          hasSecret: Boolean(cfg.clientSecret),
          stats: {
            total: splitStats?.total ?? 0,
            open: splitStats?.open ?? 0,
            rejected: splitStats?.rejected ?? 0,
            shipped: splitStats?.shipped ?? 0,
          },
        }),
      );
    }
    return { partners: out };
  });

  app.put("/api/admin/partners/:id", async (req) => {
    await requireAdmin(req);
    const { id } = req.params as { id: string };
    if (!(PARTNER_IDS as readonly string[]).includes(id)) {
      throw new ValidationError(`Unknown partner '${id}'`);
    }
    const body = z
      .object({
        apiBaseUrl: z.string().url().optional(),
        clientId: z.string().max(200).optional(),
        clientSecret: z.string().max(400).optional(),
        active: z.boolean().optional(),
      })
      .parse(req.body);

    const db = getDb(env().DATABASE_URL);
    const [existing] = await db
      .select()
      .from(partnerCredentials)
      .where(eq(partnerCredentials.partnerId, id as PartnerId))
      .limit(1);

    const values = {
      apiBaseUrl: body.apiBaseUrl ?? existing?.apiBaseUrl ?? "",
      authHint: existing?.authHint ?? (body.clientId ? `${body.clientId.slice(0, 3)}•••` : null),
      clientId: body.clientId ?? existing?.clientId ?? null,
      // Empty string means "clear" — otherwise keep the stored secret.
      clientSecret: body.clientSecret === undefined ? (existing?.clientSecret ?? null) : body.clientSecret || null,
      active: body.active ?? existing?.active ?? true,
      updatedAt: new Date(),
    };

    await db
      .insert(partnerCredentials)
      .values({ partnerId: id as PartnerId, ...values })
      .onConflictDoUpdate({
        target: partnerCredentials.partnerId,
        set: values,
      });

    return { ok: true };
  });

  app.post("/api/admin/partners/:id/test", async (req) => {
    await requireAdmin(req);
    const { id } = req.params as { id: string };
    const adapter = getPartnerAdapter(id);
    if (!adapter) {
      return { ok: true, message: "IN_HOUSE is manual fulfillment — nothing to test." };
    }
    return adapter.ping();
  });

  /* ---------------------------------------------------------------- */
  /* Fulfillment splits                                                */
  /* ---------------------------------------------------------------- */

  app.get("/api/admin/splits", async (req) => {
    await requireAdmin(req);
    const q = z
      .object({
        status: z.string().optional(),
        limit: z.coerce.number().int().min(1).max(50).default(25),
      })
      .parse(req.query ?? {});
    const db = getDb(env().DATABASE_URL);

    const filters = [];
    if (q.status && q.status !== "ALL") {
      filters.push(eq(orderSplits.status, q.status as (typeof orderSplits.$inferSelect)["status"]));
    }

    const rows = await db
      .select({
        split: orderSplits,
        orderNumber: orders.orderNumber,
        orderCreatedAt: orders.createdAt,
      })
      .from(orderSplits)
      .innerJoin(orders, eq(orderSplits.orderId, orders.id))
      .where(filters.length ? and(...filters) : undefined)
      .orderBy(desc(orders.createdAt))
      .limit(q.limit);

    const ids = rows.map((r) => r.split.id);
    const lines = ids.length
      ? await db
          .select()
          .from(orderLines)
          .where(inArray(orderLines.splitId, ids))
      : [];

    return {
      splits: rows.map((r) => {
        const ls = lines.filter((l) => l.splitId === r.split.id);
        return adminSplitRowSchema.parse({
          id: r.split.id,
          orderNumber: r.orderNumber,
          orderId: r.split.orderId,
          partnerId: r.split.partnerId,
          status: r.split.status,
          partnerOrderId: r.split.partnerOrderId,
          itemCount: ls.reduce((s, l) => s + l.quantity, 0) || 1,
          previewLine: ls[0] ? `${ls[0].quantity}× ${ls[0].name}` : "—",
          createdAt: r.orderCreatedAt.toISOString(),
        });
      }),
    };
  });

  app.post("/api/admin/splits/:id/dispatch", async (req) => {
    await requireAdmin(req);
    const { id } = req.params as { id: string };
    const db = getDb(env().DATABASE_URL);
    const [split] = await db.select().from(orderSplits).where(eq(orderSplits.id, id)).limit(1);
    if (!split) throw new NotFoundError("Split", id);

    // dispatchSplit is module-private; reuse it through the public path.
    const { dispatchSplitById } = await import("../services/orders.js");
    await dispatchSplitById(id);
    return { ok: true };
  });

  app.patch("/api/admin/splits/:id/status", async (req) => {
    await requireAdmin(req);
    const { id } = req.params as { id: string };
    const body = z
      .object({
        status: z.enum([
          "PENDING",
          "SENT_TO_PARTNER",
          "ACCEPTED_BY_PARTNER",
          "REJECTED_BY_PARTNER",
          "SHIPPED",
          "DELIVERED",
          "CANCELLED",
        ]),
        trackingCode: z.string().max(100).optional(),
        trackingUrl: z.string().url().optional(),
      })
      .parse(req.body);

    const db = getDb(env().DATABASE_URL);
    const [split] = await db.select().from(orderSplits).where(eq(orderSplits.id, id)).limit(1);
    if (!split) throw new NotFoundError("Split", id);

    await db
      .update(orderSplits)
      .set({
        status: body.status,
        ...(body.trackingCode ? { trackingCode: body.trackingCode } : {}),
        ...(body.trackingUrl ? { trackingUrl: body.trackingUrl } : {}),
        ...(body.status === "SHIPPED" ? { shippedAt: new Date() } : {}),
      })
      .where(eq(orderSplits.id, id));

    // Keep the order status in step for the customer-facing timeline.
    if (body.status === "SHIPPED") {
      await db
        .update(orders)
        .set({ status: "SHIPPED", updatedAt: new Date() })
        .where(and(eq(orders.id, split.orderId), inArray(orders.status, ["PAYMENT_CONFIRMED", "PARTNER_DISPATCHED"])));
    }
    if (body.status === "DELIVERED") {
      await db.update(orders).set({ status: "DELIVERED", updatedAt: new Date() }).where(eq(orders.id, split.orderId));
    }

    await db.insert(orderEvents).values({
      orderId: split.orderId,
      kind: `ADMIN_SPLIT_${body.status}`,
      detail: { splitId: id, partnerId: split.partnerId, trackingCode: body.trackingCode ?? null },
    });

    return { ok: true };
  });

  /* ---------------------------------------------------------------- */
  /* Webhook audit                                                     */
  /* ---------------------------------------------------------------- */

  app.get("/api/admin/webhooks", async (req) => {
    await requireAdmin(req);
    const q = z
      .object({
        outcome: z.string().max(24).optional(),
        limit: z.coerce.number().int().min(1).max(50).default(25),
      })
      .parse(req.query ?? {});
    const db = getDb(env().DATABASE_URL);

    const rows = await db
      .select()
      .from(paymentWebhooks)
      .where(q.outcome && q.outcome !== "ALL" ? eq(paymentWebhooks.outcome, q.outcome) : undefined)
      .orderBy(desc(paymentWebhooks.receivedAt))
      .limit(q.limit);

    return {
      webhooks: rows.map((w) =>
        adminWebhookRowSchema.parse({
          id: w.id,
          provider: w.provider,
          event: w.eventType,
          outcome: w.outcome ?? "UNKNOWN",
          createdAt: w.receivedAt.toISOString(),
        }),
      ),
      rows: rows.map((w) => ({
        id: w.id,
        payload: w.payloadJson,
        errorText: w.errorText,
        signatureOk: w.signatureOk,
        processed: w.processed,
      })),
    };
  });

  /* ---------------------------------------------------------------- */
  /* Shipping zones (multi-country)                                    */
  /* ---------------------------------------------------------------- */

  app.get("/api/admin/zones", async (req) => {
    await requireAdmin(req);
    return { zones: await listZones() };
  });

  app.put("/api/admin/zones/:countryCode", async (req) => {
    await requireAdmin(req);
    const { countryCode } = req.params as { countryCode: string };
    const body = zoneUpsertSchema.parse({ ...(req.body as object), countryCode: countryCode.toUpperCase() });
    return { zone: await upsertZone(body) };
  });

  app.patch("/api/admin/zones/:countryCode", async (req) => {
    await requireAdmin(req);
    const { countryCode } = req.params as { countryCode: string };
    const body = z.object({ active: z.boolean() }).parse(req.body);
    await setZoneActive(countryCode, body.active);
    return { ok: true };
  });

  /* ---------------------------------------------------------------- */
  /* Promos                                                            */
  /* ---------------------------------------------------------------- */

  app.get("/api/admin/promos", async (req) => {
    await requireAdmin(req);
    return { promos: await listPromos() };
  });

  app.put("/api/admin/promos/:code", async (req) => {
    await requireAdmin(req);
    const { code } = req.params as { code: string };
    const raw = req.body as Record<string, unknown> | undefined;
    const body = promoUpsertSchema.parse({
      ...(raw ?? {}),
      code: (raw?.code as string) ?? code,
    });
    return { promo: await upsertPromo(body) };
  });
}
