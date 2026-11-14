/**
 * Razorpay webhook receiver.
 *
 * Security model:
 *  - Raw body captured (bodyLimit + exact-buffer) so the HMAC matches byte-for-byte.
 *  - HMAC-SHA256 over the raw payload compared against X-Razorpay-Signature.
 *  - Zod validation on the parsed envelope; unknown event types are ACKed
 *    but ignored (providers add events over time — never crash on novelty).
 *  - Persisted first (payment_webhooks), then processed idempotently.
 *  - Success triggers partner order creation via confirmPaymentAndDispatch.
 */
import type { FastifyInstance, FastifyRequest } from "fastify";
import { createHmac, timingSafeEqual } from "node:crypto";
import {
  PAYMENT_CONFIRMING_EVENTS,
  PAYMENT_FAILURE_EVENTS,
  razorpayWebhookSchema,
} from "@crunchrr/shared";
import { env } from "../../config/env.js";
import { completeWebhook, ingestWebhook } from "../../services/webhook-store.js";
import { confirmPaymentAndDispatch, failOrder } from "../../services/orders.js";
import { eq } from "drizzle-orm";
import { getDb } from "../../db/client.js";
import { orders } from "../../db/schema.js";

function safeHexEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));
  } catch {
    return false;
  }
}

function verifyRazorpaySignature(rawBody: string, signature: string | undefined): boolean {
  const secret = env().RAZORPAY_WEBHOOK_SECRET;
  if (!secret) {
    // No webhook secret configured — reject in production, allow in dev.
    if (env().NODE_ENV === "production") return false;
    return true;
  }
  if (!signature) return false;
  const digest = createHmac("sha256", secret).update(rawBody).digest("hex");
  return safeHexEqual(digest, signature);
}

type RazorpayRouteOptions = {
  config: { rawBodyRequired: true; rateLimit: false };
};

export async function razorpayWebhookRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    "/api/webhooks/razorpay",
    {
      // Fastify v5: access the untouched raw body for signature verification.
      ...({
        // Webhook retries are bursty; HMAC + event-id dedupe guard the route.
        config: { rawBodyRequired: true, rateLimit: false },
      } satisfies Partial<RazorpayRouteOptions>),
      // Payload cap: Razorpay webhooks are small JSON envelopes.
      bodyLimit: 256 * 1024,
    } as never,
    async (req: FastifyRequest & { rawBody?: string | Buffer }, reply) => {
      /* ---- 1. Raw body + signature ---- */
      const raw =
        typeof req.rawBody === "string"
          ? req.rawBody
          : req.rawBody instanceof Buffer
            ? req.rawBody.toString("utf8")
            : "";
      const signature = req.headers["x-razorpay-signature"] as string | undefined;
      const signatureOk = verifyRazorpaySignature(raw, signature);

      /* ---- 2. Parse + Zod-validate the envelope ---- */
      let parsedJson: unknown;
      try {
        parsedJson = JSON.parse(raw || "{}");
      } catch {
        return reply.status(400).send({
          error: { code: "BAD_JSON", message: "Webhook body is not valid JSON" },
        });
      }

      const envelope = razorpayWebhookSchema.safeParse(parsedJson);
      if (!envelope.success) {
        // Store for forensics even when the shape is unknown.
        await ingestWebhook({
          provider: "RAZORPAY",
          eventType: "unparsed",
          eventId: null,
          payload: parsedJson,
          signatureOk,
          log: req.log,
        });
        req.log.warn({ issues: envelope.error.issues.slice(0, 5) }, "razorpay webhook envelope invalid");
        return reply.status(200).send({ ok: true, ignored: "unrecognized_payload" });
      }

      const webhook = envelope.data;
      const eventId =
        webhook.payload.payment?.entity?.id ??
        webhook.payload.order?.entity?.id ??
        webhook.payload.refund?.entity?.id ??
        webhook.created_at?.toString() ??
        null;

      /* ---- 3. Persist first ---- */
      const ingest = await ingestWebhook({
        provider: "RAZORPAY",
        eventType: webhook.event,
        eventId,
        payload: webhook,
        signatureOk,
        log: req.log,
      });

      if (ingest.result.outcome === "INVALID_SIGNATURE") {
        return reply.status(401).send({
          error: { code: "INVALID_SIGNATURE", message: "Signature verification failed" },
        });
      }
      if (ingest.result.outcome === "DUPLICATE") {
        return reply.status(200).send({ ok: true, dedupe: "duplicate" });
      }

      /* ---- 4. Route by event type ---- */
      try {
        if (PAYMENT_CONFIRMING_EVENTS.has(webhook.event)) {
          const payment = webhook.payload.payment?.entity;
          if (!payment) {
            await completeWebhook({ rowId: ingest.rowId, outcome: "IGNORED" });
            return reply.status(200).send({ ok: true, ignored: "no_payment_entity" });
          }

          // Resolve our order via the gateway order id.
          const db = getDb(env().DATABASE_URL);
          const order = await db.query.orders.findFirst({
            where: eq(orders.paymentGatewayRef, payment.order_id),
          });
          if (!order) {
            req.log.warn({ gatewayOrderId: payment.order_id }, "webhook for unknown order");
            await completeWebhook({ rowId: ingest.rowId, outcome: "IGNORED" });
            return reply.status(200).send({ ok: true, ignored: "unknown_order" });
          }

          await confirmPaymentAndDispatch({
            orderId: order.id,
            paymentRef: payment.id,
            provider: "RAZORPAY",
            amountMinor: payment.amount,
          });

          await completeWebhook({ rowId: ingest.rowId, outcome: "OK" });
          return reply.status(200).send({ ok: true });
        }

        if (PAYMENT_FAILURE_EVENTS.has(webhook.event)) {
          const payment = webhook.payload.payment?.entity;
          if (payment) {
            const db = getDb(env().DATABASE_URL);
            const order = await db.query.orders.findFirst({
              where: eq(orders.paymentGatewayRef, payment.order_id),
            });
            if (order) {
              await failOrder({
                orderId: order.id,
                reason: webhook.event,
              });
            }
          }
          await completeWebhook({ rowId: ingest.rowId, outcome: "OK" });
          return reply.status(200).send({ ok: true });
        }

        // Refunds / settlements / novel events: acknowledged and archived.
        await completeWebhook({ rowId: ingest.rowId, outcome: "IGNORED" });
        return reply.status(200).send({ ok: true, ignored: webhook.event });
      } catch (err) {
        req.log.error({ err, webhookRowId: ingest.rowId }, "razorpay webhook processing error");
        await completeWebhook({
          rowId: ingest.rowId,
          outcome: "ERROR",
          errorText: err instanceof Error ? err.message : String(err),
        });
        // Return 200 so the provider does not storm-retry; our ops can replay.
        return reply.status(200).send({ ok: true, processed: false });
      }
    },
  );
}
