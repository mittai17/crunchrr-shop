/**
 * Webhook ingestion — persist-first, verify-signature, process idempotently.
 *
 * Guarantees:
 *  - The raw payload is stored before ANY business logic runs.
 *  - Signature failure is a 401 and the row is marked INVALID_SIGNATURE.
 *  - Processing errors are logged with the row id and still return 200
 *    (providers aggressively retry non-2xx; we want controlled retries).
 *  - Duplicate provider event ids short-circuit as DUPLICATE.
 */
import { and, eq } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { paymentWebhooks } from "../db/schema.js";
import { env } from "../config/env.js";
import type { FastifyBaseLogger } from "fastify";

type IngestResult =
  | { outcome: "OK"; data: unknown }
  | { outcome: "DUPLICATE" }
  | { outcome: "INVALID_SIGNATURE" };

/** Persist the raw webhook and reserve the provider event id (dedupe). */
export async function ingestWebhook(args: {
  provider: string;
  eventType: string;
  eventId: string | null;
  payload: unknown;
  signatureOk: boolean;
  log: FastifyBaseLogger;
}): Promise<{ rowId: string; result: IngestResult }> {
  const db = getDb(env().DATABASE_URL);

  if (!args.signatureOk) {
    // onConflictDoNothing: a replayed valid event id must not overwrite the
    // stored original (attacker-controlled payloads can't rewrite history).
    const [row] = await db
      .insert(paymentWebhooks)
      .values({
        provider: args.provider,
        eventId: args.eventId,
        eventType: args.eventType,
        signatureOk: false,
        outcome: "INVALID_SIGNATURE",
        payloadJson: args.payload as object,
      })
      .onConflictDoNothing()
      .returning({ id: paymentWebhooks.id });
    args.log.warn({ provider: args.provider, eventId: args.eventId }, "webhook signature rejected");
    return { rowId: row?.id ?? "duplicate-invalid", result: { outcome: "INVALID_SIGNATURE" } };
  }

  if (args.eventId) {
    const [existing] = await db
      .select({ id: paymentWebhooks.id, outcome: paymentWebhooks.outcome })
      .from(paymentWebhooks)
      .where(and(eq(paymentWebhooks.provider, args.provider), eq(paymentWebhooks.eventId, args.eventId)))
      .limit(1);
    if (existing) {
      args.log.info({ provider: args.provider, eventId: args.eventId }, "webhook duplicate ignored");
      return { rowId: existing.id, result: { outcome: "DUPLICATE" } };
    }
  }

  const [row] = await db
    .insert(paymentWebhooks)
    .values({
      provider: args.provider,
      eventId: args.eventId,
      eventType: args.eventType,
      signatureOk: true,
      payloadJson: args.payload as object,
    })
    .onConflictDoNothing()
    .returning({ id: paymentWebhooks.id });

  if (!row) {
    // Lost an insert race — treat as duplicate.
    return { rowId: "race", result: { outcome: "DUPLICATE" } };
  }
  return { rowId: row.id, result: { outcome: "OK", data: args.payload } };
}

/** Finalize a webhook row after processing. */
export async function completeWebhook(args: {
  rowId: string;
  outcome: "OK" | "IGNORED" | "ERROR";
  errorText?: string;
}): Promise<void> {
  const db = getDb(env().DATABASE_URL);
  await db
    .update(paymentWebhooks)
    .set({
      processed: true,
      outcome: args.outcome,
      errorText: args.errorText ?? null,
      processedAt: new Date(),
    })
    .where(eq(paymentWebhooks.id, args.rowId));
}
