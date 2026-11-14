/**
 * DEMO payment confirmation — solo-builder QA loop only.
 *
 * Enabled strictly when PAYMENTS_DEMO=true (and never in production).
 * Walks the exact same confirmPaymentAndDispatch path as a real gateway
 * webhook (payment confirmation → partner split → partner dispatch), so the
 * local flow exercises the real business logic end-to-end.
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { env, isDemoPayments } from "../config/env.js";
import { confirmPaymentAndDispatch, serializeOrder } from "../services/orders.js";

const bodySchema = z.object({
  orderId: z.string().min(1),
});

export async function demoPaymentRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    "/api/orders/demo-confirm",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (req, reply) => {
    const e = env();
    if (e.NODE_ENV === "production" || !isDemoPayments(e)) {
      return reply.status(404).send({
        error: { code: "NOT_AVAILABLE", message: "Demo confirmation is disabled" },
      });
    }

    const body = bodySchema.parse(req.body);
    const order = await confirmPaymentAndDispatch({
      orderId: body.orderId,
      paymentRef: `demo_pay_${Date.now().toString(36)}`,
      provider: "RAZORPAY",
      // No amountMinor → skips the tamper check; demo trusts local totals.
    });

    const payload = await serializeOrder(order.id);
    return reply.send({ ok: true, order: payload });
    },
  );
}
