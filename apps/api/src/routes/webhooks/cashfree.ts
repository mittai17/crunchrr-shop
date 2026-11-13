/**
 * Cashfree webhook receiver.
 *
 * Cashfree signs with base64 HMAC-SHA256 over `timestamp + rawBody`,
 * delivered via x-webhook-signature / x-webhook-timestamp headers.
 * Persist-first + idempotent processing mirrors the Razorpay route.
 */
import type { FastifyInstance, FastifyRequest } from "fastify";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cashfreeWebhookSchema } from "@crunchrr/shared";
import { env } from "../../config/env.js";
import { verifyCashfreeSignatureWithSdk } from "../../services/payments/cashfree.js";
import { completeWebhook, ingestWebhook } from "../../services/webhook-store.js";
import { confirmPaymentAndDispatch, failOrder } from "../../services/orders.js";
import { eq } from "drizzle-orm";
import { getDb } from "../../db/client.js";
import { orders } from "../../db/schema.js";

export async function cashfreeWebhookRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    "/api/webhooks/cashfree",
    {
      bodyLimit: 256 * 1024,
    } as never,
    async (req: FastifyRequest & { rawBody?: string | Buffer }, reply) => {
      const raw =
        typeof req.rawBody === "string"
          ? req.rawBody
          : req.rawBody instanceof Buffer
            ? req.rawBody.toString("utf8")
            : "";
      const signature = (req.headers["x-webhook-signature"] as string | undefined) ?? undefined;
      const timestamp = (req.headers["x-webhook-timestamp"] as string | undefined) ?? undefined;
      const signatureOk = verifyCashfreeSignatureWithSdk(signature, raw, timestamp);

      let parsedJson: unknown;
      try {
        parsedJson = JSON.parse(raw || "{}");
      } catch {
        return reply.status(400).send({
          error: { code: "BAD_JSON", message: "Webhook body is not valid JSON" },
        });
      }

      const envelope = cashfreeWebhookSchema.safeParse(parsedJson);
      if (!envelope.success) {
        await ingestWebhook({
          provider: "CASHFREE",
          eventType: "unparsed",
          eventId: null,
          payload: parsedJson,
          signatureOk,
          log: req.log,
        });
        req.log.warn({ issues: envelope.error.issues.slice(0, 5) }, "cashfree webhook envelope invalid");
        return reply.status(200).send({ ok: true, ignored: "unrecognized_payload" });
      }

      const webhook = envelope.data;
      const eventId = webhook.data.payment?.cf_payment_id ?? webhook.data.order?.order_id ?? null;

      const ingest = await ingestWebhook({
        provider: "CASHFREE",
        eventType: webhook.type,
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

      try {
        const isSuccess =
          webhook.type === "PAYMENT_SUCCESS" || webhook.type === "PAYMENT_SETTLEMENT";
        const isFailure = webhook.type === "PAYMENT_FAILED" || webhook.type === "PAYMENT_USER_DROPPED";

        if (isSuccess && webhook.data.order && webhook.data.payment) {
          const db = getDb(env().DATABASE_URL);
          const order = await db.query.orders.findFirst({
            where: eq(orders.paymentGatewayRef, webhook.data.order.order_id),
          });
          if (!order) {
            req.log.warn({ cfOrderId: webhook.data.order.order_id }, "cashfree webhook for unknown order");
            await completeWebhook({ rowId: ingest.rowId, outcome: "IGNORED" });
            return reply.status(200).send({ ok: true, ignored: "unknown_order" });
          }

          const amountMinor =
            (webhook.data.payment.payment_amount ?? webhook.data.order.order_amount) * 100;

          await confirmPaymentAndDispatch({
            orderId: order.id,
            paymentRef: webhook.data.payment.cf_payment_id,
            provider: "CASHFREE",
            amountMinor: Math.round(amountMinor),
          });
          await completeWebhook({ rowId: ingest.rowId, outcome: "OK" });
          return reply.status(200).send({ ok: true });
        }

        if (isFailure && webhook.data.order) {
          const db = getDb(env().DATABASE_URL);
          const order = await db.query.orders.findFirst({
            where: eq(orders.paymentGatewayRef, webhook.data.order.order_id),
          });
          if (order) {
            await failOrder({ orderId: order.id, reason: webhook.type });
          }
          await completeWebhook({ rowId: ingest.rowId, outcome: "OK" });
          return reply.status(200).send({ ok: true });
        }

        await completeWebhook({ rowId: ingest.rowId, outcome: "IGNORED" });
        return reply.status(200).send({ ok: true, ignored: webhook.type });
      } catch (err) {
        req.log.error({ err, webhookRowId: ingest.rowId }, "cashfree webhook processing error");
        await completeWebhook({
          rowId: ingest.rowId,
          outcome: "ERROR",
          errorText: err instanceof Error ? err.message : String(err),
        });
        return reply.status(200).send({ ok: true, processed: false });
      }
    },
  );
}
