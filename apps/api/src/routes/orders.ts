/**
 * Order routes — checkout (optionally Clerk-authenticated) + order lookup.
 */
import type { FastifyInstance, FastifyRequest } from "fastify";
import {
  checkoutRequestSchema,
  checkoutResponseSchema,
  orderResponseSchema,
  orderSummarySchema,
} from "@crunchrr/shared";
import { z } from "zod";
import { env } from "../config/env.js";
import {
  createCheckout,
  serializeOrder,
  serializeOrderByNumber,
  listOrderSummariesByUser,
} from "../services/orders.js";
import { NotFoundError } from "../lib/errors.js";
import { verifyClerkToken } from "../lib/auth.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function orderRoutes(app: FastifyInstance): Promise<void> {  app.post(
    "/api/orders/checkout",
    {
      config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
    },
    async (req, reply) => {
      const body = checkoutRequestSchema.parse(req.body);

      // Attach Clerk user id when a session token is present (optional auth).
      let userId: string | null = null;
      try {
        const auth = await verifyClerkToken(req);
        userId = auth?.userId ?? null;
      } catch {
        userId = null; // guest checkout allowed
      }

      const result = await createCheckout(body);
      if (userId && result.order) {
        // Associate the order with the signed-in user (fire-and-forget update).
        const { getDb } = await import("../db/client.js");
        const { orders } = await import("../db/schema.js");
        const { eq } = await import("drizzle-orm");
        void getDb(env().DATABASE_URL)
          .update(orders)
          .set({ userId })
          .where(eq(orders.id, result.order.id));
      }

      const payload = checkoutResponseSchema.parse({
        orderId: result.order.id,
        orderNumber: result.order.orderNumber,
        totals: result.totals,
        payment: result.payment,
      });
      return reply.status(201).send(payload);
    },
  );

  app.get("/api/orders/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    // Non-UUID ids (e.g. /api/orders/track) must 404 cleanly, never hit Postgres.
    if (!UUID_RE.test(id)) throw new NotFoundError("Order", id);
    const data = await serializeOrder(id);
    const parsed = orderResponseSchema.safeParse(data);
    if (!parsed.success) {
      req.log.error({ issues: parsed.error.issues }, "order serialization mismatch");
      throw new NotFoundError("Order", id);
    }
    return reply.send({ order: parsed.data });
  });

  /* Customer-friendly lookup by the human-readable order number (order tracking). */
  app.get(
    "/api/orders/number/:orderNumber",
    { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const { orderNumber } = req.params as { orderNumber: string };
      const data = await serializeOrderByNumber(orderNumber);
      const parsed = orderResponseSchema.safeParse(data);
      if (!parsed.success) {
        req.log.error({ issues: parsed.error.issues }, "order serialization mismatch");
        throw new NotFoundError("Order", orderNumber);
      }
      return reply.send({ order: parsed.data });
    },
  );

  /* Signed-in account feed: orders belonging to the Clerk user. */
  app.get("/api/orders", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const auth = await verifyClerkToken(req);
    if (!auth?.userId) {
      return reply.status(401).send({
        error: { code: "UNAUTHENTICATED", message: "Sign in to view your orders." },
      });
    }
    const rows = await listOrderSummariesByUser(auth.userId);
    const parsed = z.array(orderSummarySchema).safeParse(rows);
    if (!parsed.success) {
      req.log.error({ issues: parsed.error.issues }, "order summary serialization mismatch");
      return reply.status(500).send({
        error: { code: "SERIALIZATION", message: "Could not serialize orders." },
      });
    }
    return reply.send({ orders: parsed.data });
  });
}
