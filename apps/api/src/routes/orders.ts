/**
 * Order routes — checkout (optionally Clerk-authenticated) + order lookup.
 */
import type { FastifyInstance, FastifyRequest } from "fastify";
import {
  checkoutRequestSchema,
  checkoutResponseSchema,
  orderResponseSchema,
} from "@crunchrr/shared";
import { env } from "../config/env.js";
import { createCheckout, serializeOrder } from "../services/orders.js";
import { NotFoundError } from "../lib/errors.js";
import { verifyClerkToken } from "../lib/auth.js";

export async function orderRoutes(app: FastifyInstance): Promise<void> {
  app.post(
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
    const data = await serializeOrder(id);
    const parsed = orderResponseSchema.safeParse(data);
    if (!parsed.success) {
      req.log.error({ issues: parsed.error.issues }, "order serialization mismatch");
      throw new NotFoundError("Order", id);
    }
    return reply.send({ order: parsed.data });
  });
}
