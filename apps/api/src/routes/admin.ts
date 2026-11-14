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
import { snapshotCounters } from "../lib/metrics.js";
import { getDb } from "../db/client.js";
import {
  adminActions,
  adminUsers,
  orderEvents,
  orderLines,
  orderSplits,
  orders,
  partnerCredentials,
  paymentWebhooks,
  productImages,
  productVariants,
  products,
  socialPosts,
  adsCampaigns,
} from "../db/schema.js";
import { env } from "../config/env.js";
import { logAdminAction, requireAdmin } from "../lib/admin-auth.js";
import { AppError, ConflictError, NotFoundError, ValidationError } from "../lib/errors.js";
import { dispatchSplitById, serializeOrder } from "../services/orders.js";
import { listZones, upsertZone, setZoneActive } from "../services/zones.js";
import { refreshFxRates } from "../services/fx.js";
import { listPromos, upsertPromo } from "../services/promos.js";
import { getPartnerAdapter } from "../services/partners/registry.js";
import { maskSecret, resolvePartnerConfig } from "../services/partners/config.js";

/** Social Studio platforms — adapters simulated until OAuth apps land. */
const SOCIAL_PLATFORMS = ["INSTAGRAM", "TIKTOK", "X", "FACEBOOK", "PINTEREST", "YOUTUBE"] as const;
const PARTNER_REGIONS = ["IN", "US", "UK", "EU", "GLOBAL"] as const;

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
    const admin = await requireAdmin(req, ["OWNER", "OPS"]);
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
      detail: { from: order.status, to: body.status, note: body.note ?? null, by: admin.name },
    });
    await logAdminAction(admin, "ORDER_STATUS", order.orderNumber, { from: order.status, to: body.status });

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
    const admin = await requireAdmin(req, ["OWNER", "OPS"]);
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
    await logAdminAction(admin, "PRODUCT_UPDATE", id, updates);
    return { ok: true };
  });

  app.patch("/api/admin/variants/:id", async (req) => {
    const admin = await requireAdmin(req, ["OWNER", "OPS"]);
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
    await logAdminAction(admin, "VARIANT_UPDATE", updated[0].sku, updates);
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
          region: row?.region ?? null,
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
    const admin = await requireAdmin(req, ["OWNER"]);
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
        region: z.enum(PARTNER_REGIONS).optional(),
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
      region: body.region ?? existing?.region ?? "GLOBAL",
      updatedAt: new Date(),
    };

    await db
      .insert(partnerCredentials)
      .values({ partnerId: id as PartnerId, ...values })
      .onConflictDoUpdate({
        target: partnerCredentials.partnerId,
        set: values,
      });

    await logAdminAction(admin, "PARTNER_UPDATE", id, {
      region: values.region,
      active: values.active,
      credsChanged: body.clientSecret !== undefined || body.clientId !== undefined,
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
    const admin = await requireAdmin(req, ["OWNER", "OPS"]);
    const { id } = req.params as { id: string };
    const db = getDb(env().DATABASE_URL);
    const [split] = await db.select().from(orderSplits).where(eq(orderSplits.id, id)).limit(1);
    if (!split) throw new NotFoundError("Split", id);

    // dispatchSplit is module-private; reuse it through the public path.
    const { dispatchSplitById } = await import("../services/orders.js");
    await dispatchSplitById(id);
    await logAdminAction(admin, "SPLIT_DISPATCH", `${split.orderId}/${split.partnerId}`, {});
    return { ok: true };
  });

  app.patch("/api/admin/splits/:id/status", async (req) => {
    const admin = await requireAdmin(req, ["OWNER", "OPS"]);
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
      detail: { splitId: id, partnerId: split.partnerId, trackingCode: body.trackingCode ?? null, by: admin.name },
    });
    await logAdminAction(admin, "SPLIT_STATUS", `${split.orderId}/${split.partnerId}`, { to: body.status });

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
    const admin = await requireAdmin(req, ["OWNER", "OPS"]);
    const { countryCode } = req.params as { countryCode: string };
    const body = zoneUpsertSchema.parse({ ...(req.body as object), countryCode: countryCode.toUpperCase() });
    const zone = await upsertZone(body);
    await logAdminAction(admin, "ZONE_UPSERT", body.countryCode, { currency: body.currency, fx: body.fxFromUsd });
    return { zone };
  });

  app.patch("/api/admin/zones/:countryCode", async (req) => {
    const admin = await requireAdmin(req, ["OWNER", "OPS"]);
    const { countryCode } = req.params as { countryCode: string };
    const body = z.object({ active: z.boolean() }).parse(req.body);
    await setZoneActive(countryCode, body.active);
    await logAdminAction(admin, "ZONE_ACTIVE", countryCode, { active: body.active });
    return { ok: true };
  });

  /**
   * FX refresh — preview (apply=false, default) or apply live market rates.
   * Drift-guarded per currency; every applied change is audited by the
   * fx service itself (one ZONE_FX_REFRESH row with old/new pairs).
   */
  app.post("/api/admin/zones/refresh-fx", async (req) => {
    const admin = await requireAdmin(req, ["OWNER", "OPS"]);
    const body = z.object({ apply: z.boolean().default(false) }).parse(req.body ?? {});
    return refreshFxRates({
      apply: body.apply,
      actor: { clerkUserId: admin.userId, actorName: admin.name },
    });
  });

  /* ---------------------------------------------------------------- */
  /* Promos                                                            */
  /* ---------------------------------------------------------------- */

  app.get("/api/admin/promos", async (req) => {
    await requireAdmin(req);
    return { promos: await listPromos() };
  });

  app.put("/api/admin/promos/:code", async (req) => {
    const admin = await requireAdmin(req, ["OWNER", "OPS"]);
    const { code } = req.params as { code: string };
    const raw = req.body as Record<string, unknown> | undefined;
    const body = promoUpsertSchema.parse({
      ...(raw ?? {}),
      code: (raw?.code as string) ?? code,
    });
    const promo = await upsertPromo(body);
    await logAdminAction(admin, "PROMO_UPSERT", body.code, { percentOff: body.percentOff });
    return { promo };
  });

  /* ---------------------------------------------------------------- */
  /* v2 — Analytics                                                    */
  /* ---------------------------------------------------------------- */
  app.get("/api/admin/analytics", async (req) => {
    await requireAdmin(req);
    const db = getDb(env().DATABASE_URL);
    const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 3600 * 1000);
    const requested = Number((req.query as { days?: string }).days ?? 30);
    const days = [7, 30, 90].includes(requested) ? requested : 30;
    const rangeStart = daysAgo(days);

    // Bestsellers — units sold across paid orders (revenue fx-normalized to USD).
    const bestsellerRows = await db
      .select({
        sku: orderLines.sku,
        name: orderLines.name,
        colorway: orderLines.colorway,
        units: sql<number>`coalesce(sum(${orderLines.quantity}), 0)::int`,
        revenueMinor: sql<number>`coalesce(sum(${orderLines.quantity} * ${orderLines.priceMinor}), 0)::int`,
        currency: orders.currency,
      })
      .from(orderLines)
      .innerJoin(orders, eq(orderLines.orderId, orders.id))
      .where(and(inArray(orders.status, PAID_STATUSES), gte(orders.createdAt, rangeStart)))
      .groupBy(orderLines.sku, orderLines.name, orderLines.colorway, orders.currency);

    const zonesForFx = await listZones({ activeOnly: true });
    const fxByCurrency0 = new Map<string, number>();
    for (const zone of zonesForFx) {
      if (!fxByCurrency0.has(zone.currency)) fxByCurrency0.set(zone.currency, zone.fxFromUsd);
    }
    const fxOf = (currency: string): number => fxByCurrency0.get(currency) ?? 1;

    const bestsellerMap = new Map<string, { sku: string; name: string; colorway: string; units: number; revenueUsd: number }>();
    for (const r of bestsellerRows) {
      const key = r.sku;
      const cur = bestsellerMap.get(key) ?? { sku: r.sku, name: r.name, colorway: r.colorway, units: 0, revenueUsd: 0 };
      cur.units += r.units;
      cur.revenueUsd += r.revenueMinor / fxOf(r.currency);
      bestsellerMap.set(key, cur);
    }
    const bestsellers = [...bestsellerMap.values()]
      .sort((a, b) => b.units - a.units)
      .slice(0, 8)
      .map((b) => ({ ...b, revenueMinor: Math.round(b.revenueUsd) }));

    // Vendor scorecards — split outcomes + accept/deliver latency.
    const scorecardRows = await db
      .select({
        partnerId: orderSplits.partnerId,
        total: sql<number>`count(*)::int`,
        open: sql<number>`(count(*) filter (where ${orderSplits.status} in ('PENDING','SENT_TO_PARTNER','ACCEPTED_BY_PARTNER')))::int`,
        delivered: sql<number>`(count(*) filter (where ${orderSplits.status} = 'DELIVERED'))::int`,
        rejected: sql<number>`(count(*) filter (where ${orderSplits.status} = 'REJECTED_BY_PARTNER'))::int`,
      })
      .from(orderSplits)
      .innerJoin(orders, eq(orderSplits.orderId, orders.id))
      .where(gte(orders.createdAt, rangeStart))
      .groupBy(orderSplits.partnerId);

    const acceptRows = await db
      .select({
        partnerId: sql<string>`${orderEvents.detail} ->> 'partnerId'`,
        avgMins: sql<number>`coalesce(avg(extract(epoch from (${orderEvents.createdAt} - ${orders.createdAt})) / 60), 0)::int`,
        samples: sql<number>`count(*)::int`,
      })
      .from(orderEvents)
      .innerJoin(orders, eq(orderEvents.orderId, orders.id))
      .where(eq(orderEvents.kind, "PARTNER_ACCEPTED"))
      .groupBy(sql`${orderEvents.detail} ->> 'partnerId'`);

    // Margin per SKU — fx-normalized retail vs base-USD partner cost.
    const marginRows = await db
      .select({
        sku: orderLines.sku,
        name: orderLines.name,
        colorway: orderLines.colorway,
        units: sql<number>`coalesce(sum(${orderLines.quantity}), 0)::int`,
        revenueMinor: sql<number>`coalesce(sum(${orderLines.quantity} * ${orderLines.priceMinor}), 0)::int`,
        costMinor: sql<number>`coalesce(sum(${orderLines.quantity} * ${orderLines.costMinor}), 0)::int`,
        currency: orders.currency,
      })
      .from(orderLines)
      .innerJoin(orders, eq(orderLines.orderId, orders.id))
      .where(and(inArray(orders.status, PAID_STATUSES), gte(orders.createdAt, rangeStart)))
      .groupBy(orderLines.sku, orderLines.name, orderLines.colorway, orders.currency);

    const marginMap = new Map<string, { sku: string; name: string; colorway: string; units: number; revenueUsd: number; costMinor: number }>();
    for (const r of marginRows) {
      const key = r.sku;
      const cur = marginMap.get(key) ?? { sku: r.sku, name: r.name, colorway: r.colorway, units: 0, revenueUsd: 0, costMinor: 0 };
      cur.units += r.units;
      cur.revenueUsd += r.revenueMinor / fxOf(r.currency);
      cur.costMinor += r.costMinor;
      marginMap.set(key, cur);
    }
    const margins = [...marginMap.values()]
      .map((m) => ({
        sku: m.sku,
        name: m.name,
        colorway: m.colorway,
        units: m.units,
        revenueMinor: Math.round(m.revenueUsd),
        costMinor: m.costMinor,
      }))
      .sort((a, b) => (b.revenueMinor - b.costMinor) - (a.revenueMinor - a.costMinor))
      .slice(0, 10);

    // Revenue by destination country (paid orders).
    const byCountry = await db
      .select({
        country: orders.shipCountry,
        currency: orders.currency,
        minor: sql<number>`coalesce(sum(${orders.grandTotalMinor}), 0)::int`,
        count: sql<number>`count(*)::int`,
      })
      .from(orders)
      .where(and(inArray(orders.status, PAID_STATUSES), gte(orders.createdAt, rangeStart)))
      .groupBy(orders.shipCountry, orders.currency)
      .orderBy(desc(sql`sum(${orders.grandTotalMinor})`));

    // USD-equivalent daily series for the selected range (same fx trick as overview).
    const seriesRows = await db
      .select({
        day: sql<string>`to_char(date_trunc('day', ${orders.createdAt}), 'YYYY-MM-DD')`,
        currency: orders.currency,
        minor: sql<number>`coalesce(sum(${orders.grandTotalMinor}), 0)::int`,
        count: sql<number>`count(*)::int`,
      })
      .from(orders)
      .where(and(inArray(orders.status, PAID_STATUSES), gte(orders.createdAt, rangeStart)))
      .groupBy(sql`date_trunc('day', ${orders.createdAt})`, orders.currency)
      .orderBy(sql`date_trunc('day', ${orders.createdAt})`);
    const zones = await listZones({ activeOnly: true });
    const fxByCurrency = new Map<string, number>();
    for (const zone of zones) {
      if (!fxByCurrency.has(zone.currency)) fxByCurrency.set(zone.currency, zone.fxFromUsd);
    }
    const seriesByDay = new Map<string, { minorUsd: number; orders: number }>();
    for (let i = days - 1; i >= 0; i--) {
      seriesByDay.set(daysAgo(i).toISOString().slice(0, 10), { minorUsd: 0, orders: 0 });
    }
    for (const row of seriesRows) {
      const bucket = seriesByDay.get(row.day);
      if (!bucket) continue;
      const fx = fxByCurrency.get(row.currency) ?? 1;
      bucket.minorUsd += Math.round(row.minor / (fx || 1));
      bucket.orders += row.count;
    }
    const series = [...seriesByDay.entries()].map(([date, v]) => ({ date, ...v }));
    const totalUsd = series.reduce((s, d) => s + d.minorUsd, 0);
    const totalOrders = series.reduce((s, d) => s + d.orders, 0);
    const aovUsd = totalOrders > 0 ? Math.round(totalUsd / totalOrders) : 0;

    return {
      bestsellers,
      vendors: scorecardRows.map((s) => ({
        ...s,
        avgAcceptMins: acceptRows.find((a) => a.partnerId === s.partnerId)?.avgMins ?? null,
      })),
      margins,
      byCountry,
      series,
      days,
      aovUsd,
      revenueUsd: totalUsd,
    };
  });

  /* ---------------------------------------------------------------- */
  /* v2 — Live activity feed (orders + webhooks + admin actions)        */
  /* ---------------------------------------------------------------- */
  app.get("/api/admin/activity", async (req) => {
    await requireAdmin(req);
    const db = getDb(env().DATABASE_URL);

    const evRows = await db
      .select({
        ts: orderEvents.createdAt,
        kind: orderEvents.kind,
        detail: orderEvents.detail,
        orderNumber: orders.orderNumber,
        orderId: orderEvents.orderId,
      })
      .from(orderEvents)
      .innerJoin(orders, eq(orderEvents.orderId, orders.id))
      .orderBy(desc(orderEvents.createdAt))
      .limit(40);

    const hookRows = await db
      .select({
        ts: paymentWebhooks.receivedAt,
        provider: paymentWebhooks.provider,
        eventType: paymentWebhooks.eventType,
        outcome: paymentWebhooks.outcome,
      })
      .from(paymentWebhooks)
      .orderBy(desc(paymentWebhooks.receivedAt))
      .limit(20);

    const actionRows = await db
      .select()
      .from(adminActions)
      .orderBy(desc(adminActions.createdAt))
      .limit(20);

    type Feed = { ts: string; source: string; kind: string; label: string; href: string | null };
    const feed: Feed[] = [];
    for (const r of evRows) {
      feed.push({
        ts: r.ts.toISOString(),
        source: "ORDER",
        kind: r.kind,
        label: `${r.orderNumber} — ${r.kind.replace(/_/g, " ").toLowerCase()}`,
        href: `/admin/orders/${r.orderId}`,
      });
    }
    for (const r of hookRows) {
      const outcome = r.outcome ?? "UNKNOWN";
      feed.push({
        ts: r.ts.toISOString(),
        source: "WEBHOOK",
        kind: outcome,
        label: `${r.provider} ${r.eventType ?? "event"} — ${outcome.replace(/_/g, " ").toLowerCase()}`,
        href: "/admin/webhooks",
      });
    }
    for (const r of actionRows) {
      feed.push({
        ts: r.createdAt.toISOString(),
        source: "ADMIN",
        kind: r.action,
        label: `${r.actorName} — ${r.action.toLowerCase()} ${r.target}`,
        href: null,
      });
    }
    feed.sort((a, b) => b.ts.localeCompare(a.ts));
    return { feed: feed.slice(0, 60) };
  });

  /* ---------------------------------------------------------------- */
  /* v2 — Team & audit                                                 */
  /* ---------------------------------------------------------------- */
  app.get("/api/admin/team", async (req) => {
    await requireAdmin(req);
    const db = getDb(env().DATABASE_URL);
    const admins = await db.select().from(adminUsers).orderBy(adminUsers.createdAt);
    const audit = await db
      .select()
      .from(adminActions)
      .orderBy(desc(adminActions.createdAt))
      .limit(50);
    return { admins, audit };
  });

  app.patch("/api/admin/team/:id", async (req) => {
    const admin = await requireAdmin(req, ["OWNER"]);
    const { id } = req.params as { id: string };
    const body = z
      .object({
        role: z.enum(["OWNER", "OPS", "SUPPORT", "PARTNER"]).optional(),
        name: z.string().min(1).max(80).optional(),
        active: z.boolean().optional(),
        partnerId: z.enum(PARTNER_IDS).optional(),
      })
      .parse(req.body);
    const db = getDb(env().DATABASE_URL);
    const updates = Object.fromEntries(Object.entries(body).filter(([, v]) => v !== undefined));
    const updated = await db
      .update(adminUsers)
      .set(updates)
      .where(eq(adminUsers.id, id))
      .returning({ id: adminUsers.id, role: adminUsers.role });
    if (!updated[0]) throw new NotFoundError("Admin", id);
    await logAdminAction(admin, "TEAM_UPDATE", id, updates);
    return { ok: true };
  });

  /** Vendor portal onboarding: bind a Clerk user to a partner identity. */
  app.post("/api/admin/team/partner-login", async (req) => {
    const admin = await requireAdmin(req, ["OWNER"]);
    const body = z
      .object({
        clerkUserId: z.string().min(6).max(64),
        name: z.string().min(1).max(80),
        email: z.string().email().max(120),
        partnerId: z.enum(PARTNER_IDS),
      })
      .parse(req.body);
    const db = getDb(env().DATABASE_URL);
    const [row] = await db
      .insert(adminUsers)
      .values({
        clerkUserId: body.clerkUserId,
        name: body.name,
        email: body.email,
        role: "PARTNER",
        partnerId: body.partnerId,
      })
      .onConflictDoUpdate({
        target: adminUsers.clerkUserId,
        set: { name: body.name, email: body.email, role: "PARTNER", partnerId: body.partnerId, active: true },
      })
      .returning();
    await logAdminAction(admin, "PARTNER_LOGIN_CREATE", body.partnerId, {
      clerkUserId: body.clerkUserId,
      email: body.email,
    });
    return { ok: true, member: row };
  });

  /* ---------------------------------------------------------------- */
  /* v2 — Full vendor control: product creation + bulk tools           */
  /* ---------------------------------------------------------------- */
  const productCreateBody = z.object({
    name: z.string().min(2).max(120),
    tagline: z.string().max(200).optional(),
    description: z.string().max(4000).optional(),
    category: z.enum(["HOODIES", "TEES", "BOTTOMS", "OUTERWEAR", "HEADWEAR", "ARTIFACTS"]),
    collection: z.string().max(60).optional(),
    gsmLabel: z.string().max(50).optional(),
    fabricLabel: z.string().max(100).optional(),
    badgeText: z.string().max(40).optional(),
    colorway: z.string().min(1).max(80),
    colorHex: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    priceMinor: z.number().int().min(100).max(1_000_000),
    comparePriceMinor: z.number().int().min(0).max(1_000_000).nullable().optional(),
    partnerId: z.enum(PARTNER_IDS),
    partnerCostMinor: z.number().int().min(0).max(1_000_000),
    stock: z.number().int().min(0).max(100_000),
    sizes: z.array(z.enum(["XS", "S", "M", "L", "XL", "XXL", "ONE_SIZE"])).min(1).max(7),
    imageUrls: z.array(z.string().url()).max(6).optional(),
  });

  const slugify = (s: string): string =>
    s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 60) || "piece";

  app.post("/api/admin/products", async (req) => {
    const admin = await requireAdmin(req, ["OWNER", "OPS"]);
    const body = productCreateBody.parse(req.body);
    const db = getDb(env().DATABASE_URL);

    // Unique slug with fallback suffix.
    let slug = slugify(body.name);
    const clash = await db.select({ id: products.id }).from(products).where(eq(products.slug, slug)).limit(1);
    if (clash.length > 0) slug = `${slug}-${Date.now().toString(36).slice(-4)}`;

    const [product] = await db
      .insert(products)
      .values({
        slug,
        name: body.name,
        tagline: body.tagline ?? "",
        description: body.description ?? "",
        category: body.category,
        gsmLabel: body.gsmLabel ?? "",
        fabricLabel: body.fabricLabel ?? "",
        badge: body.badgeText ? { text: body.badgeText, tone: "coral" as const } : null,
        specs: { fit: "", material: "", shipping: "", sustainability: "" },
      })
      .returning();
    if (!product) throw new AppError(500, "CREATE_FAILED", "Product insert failed.");

    if (body.imageUrls?.length) {
      await db.insert(productImages).values(
        body.imageUrls.map((url, i) => ({ productId: product.id, url, sortOrder: i })),
      );
    }

    const colorCode = body.colorway.replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase() || "VNT";
    const variants = body.sizes.map((size) => ({
      productId: product.id,
      sku: `CR-${slug.replace(/-/g, "").slice(0, 10).toUpperCase()}-${colorCode}-${size}`.slice(0, 60),
      size,
      colorway: body.colorway,
      colorHex: body.colorHex,
      stock: body.stock,
      partnerId: body.partnerId,
      partnerCostMinor: body.partnerCostMinor,
      priceMinor: body.priceMinor,
      comparePriceMinor: body.comparePriceMinor ?? null,
    }));
    // SKU collisions get a deterministic suffix retry.
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await db.insert(productVariants).values(variants);
        break;
      } catch (err) {
        if (attempt === 2) throw err;
        for (const v of variants) {
          v.sku = `${v.sku.slice(0, 52)}-${Math.random().toString(36).slice(2, 4).toUpperCase()}`;
        }
      }
    }

    await logAdminAction(admin, "PRODUCT_CREATE", product.slug, {
      category: body.category,
      priceMinor: body.priceMinor,
      partnerId: body.partnerId,
      sizes: body.sizes,
    });
    return { ok: true, productId: product.id, slug: product.slug };
  });

  /** Bulk discount: sets compare-price across SKUs (percent 0 clears). */
  app.post("/api/admin/products/bulk-discount", async (req) => {
    const admin = await requireAdmin(req, ["OWNER", "OPS"]);
    const body = z
      .object({
        percent: z.number().int().min(0).max(90),
        skus: z.array(z.string().min(1).max(60)).max(500).optional(),
        productId: z.string().uuid().optional(),
      })
      .parse(req.body);
    if (!body.skus?.length && !body.productId) {
      throw new ValidationError("Provide skus[] or productId to discount.");
    }
    const db = getDb(env().DATABASE_URL);
    const scope = body.skus?.length
      ? inArray(productVariants.sku, body.skus)
      : eq(productVariants.productId, body.productId as string);
    const comparePriceMinor =
      body.percent > 0
        ? sql`round(${productVariants.priceMinor} * ${(1 + body.percent / 100).toFixed(4)}::numeric)::int`
        : null;
    const updated = await db
      .update(productVariants)
      .set({ comparePriceMinor })
      .where(scope)
      .returning({ sku: productVariants.sku });
    await logAdminAction(admin, "BULK_DISCOUNT", body.productId ?? `${updated.length} SKUs`, {
      percent: body.percent,
      count: updated.length,
    });
    return { ok: true, updated: updated.length, skus: updated.map((v) => v.sku) };
  });

  /** Bulk variant edits: price / stock / vendor across a SKU list. */
  app.patch("/api/admin/variants/bulk", async (req) => {
    const admin = await requireAdmin(req, ["OWNER", "OPS"]);
    const body = z
      .object({
        skus: z.array(z.string().min(1).max(60)).min(1).max(500),
        priceMinor: z.number().int().min(100).max(1_000_000).optional(),
        stock: z.number().int().min(0).max(100_000).optional(),
        partnerId: z.enum(PARTNER_IDS).optional(),
        active: z.boolean().optional(),
      })
      .parse(req.body);
    const updates = Object.fromEntries(
      Object.entries({
        priceMinor: body.priceMinor,
        stock: body.stock,
        partnerId: body.partnerId,
        active: body.active,
      }).filter(([, v]) => v !== undefined),
    );
    if (Object.keys(updates).length === 0) {
      throw new ValidationError("Nothing to update.");
    }
    const db = getDb(env().DATABASE_URL);
    const updated = await db
      .update(productVariants)
      .set(updates)
      .where(inArray(productVariants.sku, body.skus))
      .returning({ sku: productVariants.sku });
    await logAdminAction(admin, "VARIANT_BULK", `${updated.length} SKUs`, updates);
    return { ok: true, updated: updated.length };
  });

  /* ---------------------------------------------------------------- */
  /* v2 — CSV exports                                                  */
  /* ---------------------------------------------------------------- */
  const csv = (rows: Array<Record<string, unknown>>): string => {
    const first = rows[0];
    if (!first) return "";
    const headers = Object.keys(first);
    const esc = (v: unknown): string => {
      const s = v === null || v === undefined ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    return [
      headers.join(","),
      ...rows.map((r) => headers.map((h) => esc(r[h])).join(",")),
    ].join("\n");
  };

  app.get("/api/admin/export/orders.csv", async (_req, reply) => {
    await requireAdmin(_req);
    const db = getDb(env().DATABASE_URL);
    const rows = await db
      .select({
        order_number: orders.orderNumber,
        created_at: orders.createdAt,
        status: orders.status,
        customer: orders.customerName,
        email: orders.email,
        phone: orders.phone,
        country: orders.shipCountry,
        city: orders.shipCity,
        delivery: orders.deliveryMethod,
        currency: orders.currency,
        subtotal_minor: orders.itemsSubtotalMinor,
        discount_minor: orders.discountMinor,
        shipping_minor: orders.shippingMinor,
        tax_minor: orders.taxMinor,
        grand_minor: orders.grandTotalMinor,
        payment_ref: orders.paymentRef,
      })
      .from(orders)
      .orderBy(desc(orders.createdAt))
      .limit(5000);
    reply.type("text/csv").send(csv(rows.map((r) => ({ ...r, created_at: r.created_at.toISOString() }))));
  });

  app.get("/api/admin/export/products.csv", async (_req, reply) => {
    await requireAdmin(_req);
    const db = getDb(env().DATABASE_URL);
    const rows = await db
      .select({
        sku: productVariants.sku,
        product: products.name,
        category: products.category,
        size: productVariants.size,
        colorway: productVariants.colorway,
        color_hex: productVariants.colorHex,
        partner: productVariants.partnerId,
        partner_cost_minor: productVariants.partnerCostMinor,
        price_minor: productVariants.priceMinor,
        compare_price_minor: productVariants.comparePriceMinor,
        stock: productVariants.stock,
        active: productVariants.active,
      })
      .from(productVariants)
      .innerJoin(products, eq(productVariants.productId, products.id))
      .orderBy(productVariants.sku)
      .limit(10000);
    reply.type("text/csv").send(csv(rows));
  });

  /* ---------------------------------------------------------------- */
  /* v2 — Refunds (demo-path refund; real gateway refund is go-live)   */
  /* ---------------------------------------------------------------- */
  app.post("/api/admin/orders/:id/refund", async (req) => {
    const admin = await requireAdmin(req, ["OWNER", "OPS"]);
    const { id } = req.params as { id: string };
    const body = z
      .object({ reason: z.string().min(3).max(300) })
      .parse(req.body);
    const db = getDb(env().DATABASE_URL);

    const order = await db.query.orders.findFirst({ where: eq(orders.id, id) });
    if (!order) throw new NotFoundError("Order", id);
    if (!PAID_STATUSES.includes(order.status as OrderStatus)) {
      throw new ConflictError(
        `Order ${order.orderNumber} is ${order.status}; only paid orders can be refunded.`,
      );
    }

    // Idempotent refund.
    const updated = await db
      .update(orders)
      .set({ status: "REFUNDED", updatedAt: new Date() })
      .where(and(eq(orders.id, id), inArray(orders.status, PAID_STATUSES)))
      .returning();
    if (!updated[0]) return { ok: true, alreadyRefunded: true };

    // Restock every line (full-quantity refund v1).
    const lines = await db.select().from(orderLines).where(eq(orderLines.orderId, id));
    for (const line of lines) {
      await db
        .update(productVariants)
        .set({ stock: sql`${productVariants.stock} + ${line.quantity}` })
        .where(eq(productVariants.id, line.variantId));
    }
    // Cancel any open splits so the fulfillment queue empties.
    await db
      .update(orderSplits)
      .set({ status: "CANCELLED" })
      .where(and(
        eq(orderSplits.orderId, id),
        inArray(orderSplits.status, ["PENDING", "SENT_TO_PARTNER", "ACCEPTED_BY_PARTNER", "REJECTED_BY_PARTNER"]),
      ));

    await db.insert(orderEvents).values({
      orderId: id,
      kind: "ORDER_REFUNDED",
      detail: { reason: body.reason, by: admin.name, refundRef: "demo-refund" },
    });
    await logAdminAction(admin, "ORDER_REFUND", order.orderNumber, { reason: body.reason });
    return { ok: true, status: "REFUNDED", restockedLines: lines.length };
  });

  /* ---------------------------------------------------------------- */
  /* v2 — Smart Ops: bulk retry of failed dispatches                   */
  /* ---------------------------------------------------------------- */
  app.post("/api/admin/ops/retry-failed", async (req) => {
    const admin = await requireAdmin(req, ["OWNER", "OPS"]);
    const db = getDb(env().DATABASE_URL);
    const rejected = await db
      .select()
      .from(orderSplits)
      .where(eq(orderSplits.status, "REJECTED_BY_PARTNER"));
    let retried = 0;
    for (const split of rejected) {
      if (split.partnerId === "IN_HOUSE") continue;
      await dispatchSplitById(split.id).catch(() => undefined);
      retried++;
    }
    await logAdminAction(admin, "OPS_RETRY_FAILED", `${retried} splits`, {});
    return { ok: true, retried };
  });

  /* ---------------------------------------------------------------- */
  /* v2 — Social Studio (simulated adapters until OAuth apps land)     */
  /* ---------------------------------------------------------------- */
  app.get("/api/admin/social", async (req) => {
    await requireAdmin(req);
    const db = getDb(env().DATABASE_URL);
    const posts = await db
      .select()
      .from(socialPosts)
      .orderBy(desc(socialPosts.createdAt))
      .limit(100);
    return { posts, platforms: SOCIAL_PLATFORMS };
  });

  app.post("/api/admin/social", async (req) => {
    const admin = await requireAdmin(req, ["OWNER", "OPS"]);
    const body = z
      .object({
        platform: z.enum(SOCIAL_PLATFORMS),
        content: z.string().min(1).max(2200),
        productSlug: z.string().max(140).nullable().optional(),
        imageUrl: z.string().url().nullable().optional(),
        scheduledAt: z.string().datetime().nullable().optional(),
      })
      .parse(req.body);
    const db = getDb(env().DATABASE_URL);
    const [post] = await db
      .insert(socialPosts)
      .values({
        platform: body.platform,
        content: body.content,
        productSlug: body.productSlug ?? null,
        imageUrl: body.imageUrl ?? null,
        scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : null,
        status: body.scheduledAt ? "SCHEDULED" : "DRAFT",
      })
      .returning();
    await logAdminAction(admin, "SOCIAL_COMPOSE", `${body.platform} post`, {
      scheduled: Boolean(body.scheduledAt),
    });
    return { ok: true, post };
  });

  app.post("/api/admin/social/:id/publish", async (req) => {
    const admin = await requireAdmin(req, ["OWNER", "OPS"]);
    const { id } = req.params as { id: string };
    const db = getDb(env().DATABASE_URL);
    const [post] = await db.select().from(socialPosts).where(eq(socialPosts.id, id)).limit(1);
    if (!post) throw new NotFoundError("Post", id);
    if (post.status === "PUBLISHED") return { ok: true, alreadyPublished: true };

    // Simulated adapters — real posting requires per-platform OAuth apps;
    // the swap-in point is exactly this block (one per platform).
    const postRef = `${post.platform.slice(0, 2)}-SIM-${Date.now().toString(36)}`;
    const [updated] = await db
      .update(socialPosts)
      .set({ status: "PUBLISHED", postedAt: new Date(), postRef })
      .where(eq(socialPosts.id, id))
      .returning();
    await logAdminAction(admin, "SOCIAL_PUBLISH", `${post.platform} post`, { postRef });
    return {
      ok: true,
      post: updated,
      simulated: true,
      note: `${post.platform} adapter is simulated until the OAuth app is connected — post recorded with ref ${postRef}.`,
    };
  });

  app.delete("/api/admin/social/:id", async (req) => {
    const admin = await requireAdmin(req, ["OWNER", "OPS"]);
    const { id } = req.params as { id: string };
    const db = getDb(env().DATABASE_URL);
    const [post] = await db.select().from(socialPosts).where(eq(socialPosts.id, id)).limit(1);
    if (!post) throw new NotFoundError("Post", id);
    if (post.status === "PUBLISHED") {
      throw new ConflictError("Published posts are kept for the audit trail — create a follow-up post instead.");
    }
    await db.delete(socialPosts).where(eq(socialPosts.id, id));
    await logAdminAction(admin, "SOCIAL_DELETE", `${post.platform} post`, {});
    return { ok: true };
  });

  /* ---------------------------------------------------------------- */
  /* v3 — Ads manager, inventory, customers                            */
  /* ---------------------------------------------------------------- */

  /** Ads — campaign briefs (spend simulated until the ad account is connected). */
  app.get("/api/admin/ads", async (req) => {
    await requireAdmin(req);
    const db = getDb(env().DATABASE_URL);
    const rows = await db.select().from(adsCampaigns).orderBy(desc(adsCampaigns.createdAt)).limit(100);
    return { campaigns: rows, platforms: SOCIAL_PLATFORMS };
  });

  app.post("/api/admin/ads", async (req) => {
    const admin = await requireAdmin(req, ["OWNER", "OPS"]);
    const body = z
      .object({
        name: z.string().min(2).max(120),
        platform: z.enum(SOCIAL_PLATFORMS),
        objective: z.enum(["TRAFFIC", "SALES", "AWARENESS"]).default("TRAFFIC"),
        dailyBudgetUsd: z.number().min(0).max(10_000),
        productSlug: z.string().max(120).optional(),
        startAt: z.string().datetime().optional(),
        endAt: z.string().datetime().optional(),
      })
      .parse(req.body);
    const db = getDb(env().DATABASE_URL);
    const [campaign] = await db
      .insert(adsCampaigns)
      .values({
        name: body.name.trim(),
        platform: body.platform,
        objective: body.objective,
        dailyBudgetMinor: Math.round(body.dailyBudgetUsd * 100),
        productSlug: body.productSlug ?? null,
        startAt: body.startAt ? new Date(body.startAt) : null,
        endAt: body.endAt ? new Date(body.endAt) : null,
      })
      .returning();
    await logAdminAction(admin, "ADS_CREATE", `${body.platform} · ${body.name}`, { dailyBudgetUsd: body.dailyBudgetUsd });
    return { ok: true, campaign };
  });

  app.patch("/api/admin/ads/:id", async (req) => {
    const admin = await requireAdmin(req, ["OWNER", "OPS"]);
    const { id } = req.params as { id: string };
    const body = z
      .object({
        status: z.enum(["DRAFT", "ACTIVE", "PAUSED", "COMPLETED"]).optional(),
        dailyBudgetUsd: z.number().min(0).max(10_000).optional(),
      })
      .parse(req.body);
    const db = getDb(env().DATABASE_URL);
    const updates: Record<string, unknown> = {};
    if (body.status) updates.status = body.status;
    if (body.dailyBudgetUsd !== undefined) updates.dailyBudgetMinor = Math.round(body.dailyBudgetUsd * 100);
    const [campaign] = await db.update(adsCampaigns).set(updates).where(eq(adsCampaigns.id, id)).returning();
    if (!campaign) throw new NotFoundError("Campaign", id);
    await logAdminAction(admin, "ADS_UPDATE", `${campaign.platform} · ${campaign.name}`, updates);
    return { ok: true, campaign };
  });

  /** Inventory — every SKU with stock, price, vendor. */
  app.get("/api/admin/variants", async (req) => {
    await requireAdmin(req);
    const db = getDb(env().DATABASE_URL);
    const q = (req.query as { q?: string; lowStock?: string }).q;
    const lowStock = (req.query as { lowStock?: string }).lowStock === "true";
    const threshold = Number((req.query as { threshold?: string }).threshold ?? 5);

    const rows = await db
      .select({
        id: productVariants.id,
        sku: productVariants.sku,
        productName: products.name,
        colorway: productVariants.colorway,
        size: productVariants.size,
        stock: productVariants.stock,
        priceMinor: productVariants.priceMinor,
        partnerId: productVariants.partnerId,
        active: productVariants.active,
      })
      .from(productVariants)
      .innerJoin(products, eq(productVariants.productId, products.id))
      .orderBy(productVariants.sku)
      .limit(600);

    let out = rows;
    if (q && q.trim()) {
      const needle = q.trim().toLowerCase();
      out = out.filter(
        (r) => r.sku.toLowerCase().includes(needle) || r.productName.toLowerCase().includes(needle) || r.colorway.toLowerCase().includes(needle),
      );
    }
    if (lowStock) out = out.filter((r) => r.stock <= threshold);
    const totalStock = rows.reduce((sum, r) => sum + r.stock, 0);
    const lowCount = rows.filter((r) => r.stock <= 5).length;
    const outOfStock = rows.filter((r) => r.stock === 0).length;
    return { variants: out, stats: { skus: rows.length, totalStock, lowCount, outOfStock } };
  });

  /** Customers — grouped by email, LTV fx-normalized to USD minor. */
  app.get("/api/admin/customers", async (req) => {
    await requireAdmin(req);
    const db = getDb(env().DATABASE_URL);
    const rows = await db
      .select({
        email: orders.email,
        name: sql<string>`min(${orders.customerName})`,
        orders: sql<number>`count(*)::int`,
        grandMinor: sql<number>`sum(${orders.grandTotalMinor})::int`,
        currency: sql<string>`min(${orders.currency})`,
        country: sql<string>`min(${orders.shipCountry})`,
        firstAt: sql<string>`min(${orders.createdAt})`,
        lastAt: sql<string>`max(${orders.createdAt})`,
      })
      .from(orders)
      .groupBy(orders.email)
      .orderBy(desc(sql`count(*)`))
      .limit(200);

    const zones = await listZones({ activeOnly: true });
    const fx = new Map<string, number>();
    for (const zone of zones) if (!fx.has(zone.currency)) fx.set(zone.currency, zone.fxFromUsd);

    const customers = rows.map((r) => ({
      email: r.email,
      name: r.name,
      orders: r.orders,
      grandMinor: r.grandMinor,
      currency: r.currency,
      country: r.country,
      firstAt: r.firstAt,
      lastAt: r.lastAt,
      ltvUsd: Math.round(r.grandMinor / (fx.get(r.currency) ?? 1)),
    }));
    return { customers };
  });

  /* ---------------------------------------------------------------- */
  /* v3 — Observability: one gated snapshot of the whole control plane  */
  /* ---------------------------------------------------------------- */
  app.get("/api/admin/metrics", async (req) => {
    await requireAdmin(req);
    const db = getDb(env().DATABASE_URL);
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [
      orderStatus,
      orders24h,
      revenue24h,
      webhookOutcomes,
      lastWebhook,
      splitStatus,
      stalePending,
      retryExhausted,
      stockCounts,
    ] = await Promise.all([
      db
        .select({ status: orders.status, count: sql<number>`count(*)::int` })
        .from(orders)
        .groupBy(orders.status)
        .orderBy(desc(sql`count(*)`)),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(orders)
        .where(gte(orders.createdAt, since)),
      db
        .select({
          currency: orders.currency,
          minor: sql<number>`sum(${orders.grandTotalMinor})::int`,
          count: sql<number>`count(*)::int`,
        })
        .from(orders)
        .where(and(gte(orders.createdAt, since), sql`${orders.paidAt} is not null`))
        .groupBy(orders.currency),
      db
        .select({ outcome: paymentWebhooks.outcome, count: sql<number>`count(*)::int` })
        .from(paymentWebhooks)
        .where(gte(paymentWebhooks.receivedAt, since))
        .groupBy(paymentWebhooks.outcome),
      db.select({ last: sql<string | null>`max(${paymentWebhooks.receivedAt})` }).from(paymentWebhooks),
      db
        .select({ status: orderSplits.status, count: sql<number>`count(*)::int` })
        .from(orderSplits)
        .groupBy(orderSplits.status),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(orderSplits)
        .innerJoin(orders, eq(orderSplits.orderId, orders.id))
        .where(and(eq(orderSplits.status, "PENDING"), sql`${orders.createdAt} < now() - interval '10 minutes'`)),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(orderSplits)
        .where(
          and(
            eq(orderSplits.status, "REJECTED_BY_PARTNER"),
            sql`coalesce((${orderSplits.partnerRef}->>'attempts')::int, 0) >= 5`,
          ),
        ),
      db
        .select({
          low: sql<number>`count(*) filter (where ${productVariants.stock} <= 5)::int`,
          out: sql<number>`count(*) filter (where ${productVariants.stock} = 0)::int`,
          skus: sql<number>`count(*)::int`,
        })
        .from(productVariants),
    ]);

    let dbOk = true;
    try {
      await db.execute(sql`select 1`);
    } catch {
      dbOk = false;
    }

    return {
      generatedAt: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      memoryMb: {
        rss: Math.round(process.memoryUsage().rss / 1024 / 1024),
        heap: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      },
      dbOk,
      orders: {
        byStatus: orderStatus,
        last24h: orders24h[0]?.count ?? 0,
        revenue24h,
      },
      webhooks: {
        outcomes24h: webhookOutcomes,
        lastReceivedAt: lastWebhook[0]?.last ?? null,
      },
      splits: {
        byStatus: splitStatus,
        stalePending: stalePending[0]?.count ?? 0,
        retryExhausted: retryExhausted[0]?.count ?? 0,
      },
      inventory: stockCounts[0] ?? { skus: 0, low: 0, out: 0 },
      workers: snapshotCounters(),
    };
  });
}
