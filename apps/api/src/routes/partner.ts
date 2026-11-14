/**
 * Partner portal routes — scoped, self-service fulfillment for POD vendors.
 *
 * Everything is filtered by the logged-in partner's own partnerId: they see
 * their splits (order number, items, destination), can mark them SHIPPED
 * with a tracking code, and mark DELIVERED. They can never see other
 * vendors' data, totals, customer contact details, or admin surfaces.
 */
import type { FastifyInstance } from "fastify";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../db/client.js";
import { orderEvents, orderLines, orderSplits, orders, type PartnerIdType } from "../db/schema.js";
import { env } from "../config/env.js";
import { requirePartner } from "../lib/admin-auth.js";
import { NotFoundError, ValidationError } from "../lib/errors.js";

const OPEN_STATUSES = ["PENDING", "SENT_TO_PARTNER", "ACCEPTED_BY_PARTNER", "REJECTED_BY_PARTNER"] as const;

export async function partnerRoutes(app: FastifyInstance): Promise<void> {
  /** Who am I + queue summary. */
  app.get("/api/partner/me", async (req) => {
    const identity = await requirePartner(req);
    const db = getDb(env().DATABASE_URL);
    const [stats] = await db
      .select({
        open: sql<number>`(count(*) filter (where ${orderSplits.status} in ('PENDING','SENT_TO_PARTNER','ACCEPTED_BY_PARTNER','REJECTED_BY_PARTNER')))::int`,
        shipped: sql<number>`(count(*) filter (where ${orderSplits.status} = 'SHIPPED'))::int`,
        delivered: sql<number>`(count(*) filter (where ${orderSplits.status} = 'DELIVERED'))::int`,
      })
      .from(orderSplits)
      .where(eq(orderSplits.partnerId, identity.partnerId as PartnerIdType));
    return {
      partnerId: identity.partnerId,
      name: identity.name,
      stats: stats ?? { open: 0, shipped: 0, delivered: 0 },
    };
  });

  /** My splits — queue view with items + destination (no customer PII). */
  app.get("/api/partner/splits", async (req) => {
    const identity = await requirePartner(req);
    const db = getDb(env().DATABASE_URL);
    const status = (req.query as { status?: string }).status;
    type SplitStatus = "PENDING" | "SENT_TO_PARTNER" | "ACCEPTED_BY_PARTNER" | "REJECTED_BY_PARTNER" | "SHIPPED" | "DELIVERED" | "CANCELLED";
    const filter =
      status && status !== "ALL"
        ? and(
            eq(orderSplits.partnerId, identity.partnerId as PartnerIdType),
            eq(orderSplits.status, status as SplitStatus),
          )
        : eq(orderSplits.partnerId, identity.partnerId as PartnerIdType);

    const splits = await db
      .select({ split: orderSplits, orderCreatedAt: orders.createdAt })
      .from(orderSplits)
      .innerJoin(orders, eq(orderSplits.orderId, orders.id))
      .where(filter)
      .orderBy(desc(orders.createdAt))
      .limit(100);

    const out = [];
    for (const { split, orderCreatedAt } of splits) {
      const [order] = await db.select().from(orders).where(eq(orders.id, split.orderId)).limit(1);
      if (!order) continue;
      const lines = await db
        .select({
          sku: orderLines.sku,
          name: orderLines.name,
          size: orderLines.size,
          colorway: orderLines.colorway,
          quantity: orderLines.quantity,
        })
        .from(orderLines)
        .where(and(eq(orderLines.orderId, split.orderId), eq(orderLines.splitId, split.id)));
      out.push({
        id: split.id,
        orderNumber: order.orderNumber,
        createdAt: orderCreatedAt,
        status: split.status,
        trackingCode: split.trackingCode,
        trackingUrl: split.trackingUrl,
        destination: {
          city: order.shipCity,
          state: order.shipState,
          country: order.shipCountry,
          postalCode: order.shipPostalCode,
        },
        deliveryMethod: order.deliveryMethod,
        items: lines,
      });
    }
    return { splits: out };
  });

  /** Mark my split SHIPPED — with tracking code (required). */
  app.post("/api/partner/splits/:id/ship", async (req) => {
    const identity = await requirePartner(req);
    const { id } = req.params as { id: string };
    const body = z
      .object({
        trackingCode: z.string().min(4).max(100),
        trackingUrl: z.string().url().optional(),
      })
      .parse(req.body);

    const db = getDb(env().DATABASE_URL);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      throw new NotFoundError("Split", id);
    }
    const [split] = await db.select().from(orderSplits).where(eq(orderSplits.id, id)).limit(1);
    if (!split || split.partnerId !== identity.partnerId) {
      throw new NotFoundError("Split", id);
    }
    if (!["SENT_TO_PARTNER", "ACCEPTED_BY_PARTNER", "PENDING"].includes(split.status)) {
      throw new ValidationError(
        `Split is ${split.status}; only open splits can be marked shipped.`,
      );
    }

    await db
      .update(orderSplits)
      .set({
        status: "SHIPPED",
        trackingCode: body.trackingCode,
        trackingUrl: body.trackingUrl ?? null,
      })
      .where(eq(orderSplits.id, id));

    await db.insert(orderEvents).values({
      orderId: split.orderId,
      kind: "PARTNER_SHIPPED",
      detail: {
        partnerId: identity.partnerId,
        trackingCode: body.trackingCode,
        via: "vendor-portal",
        by: identity.name,
      },
    });
    return { ok: true, status: "SHIPPED" };
  });

  /** Mark my split DELIVERED (from SHIPPED). */
  app.post("/api/partner/splits/:id/deliver", async (req) => {
    const identity = await requirePartner(req);
    const { id } = req.params as { id: string };
    const db = getDb(env().DATABASE_URL);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      throw new NotFoundError("Split", id);
    }
    const [split] = await db.select().from(orderSplits).where(eq(orderSplits.id, id)).limit(1);
    if (!split || split.partnerId !== identity.partnerId) {
      throw new NotFoundError("Split", id);
    }
    if (split.status !== "SHIPPED") {
      throw new ValidationError(`Split is ${split.status}; only shipped splits can be delivered.`);
    }
    await db.update(orderSplits).set({ status: "DELIVERED" }).where(eq(orderSplits.id, id));
    await db.insert(orderEvents).values({
      orderId: split.orderId,
      kind: "PARTNER_DELIVERED",
      detail: { partnerId: identity.partnerId, via: "vendor-portal", by: identity.name },
    });
    return { ok: true, status: "DELIVERED" };
  });
}
