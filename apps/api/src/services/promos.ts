/**
 * Promo codes service — admin-managed, replaces the hardcoded money.ts map.
 */
import { eq, sql } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { promos } from "../db/schema.js";
import { env } from "../config/env.js";
import { AppError } from "../lib/errors.js";
import type { Promo, PromoUpsert } from "@crunchrr/shared";

function toPromo(row: typeof promos.$inferSelect): Promo {
  return {
    code: row.code,
    percentOff: row.percentOff,
    label: row.label,
    active: row.active,
    usedCount: row.usedCount,
  };
}

export async function listPromos(activeOnly?: boolean): Promise<Promo[]> {
  const db = getDb(env().DATABASE_URL);
  const rows = await db.select().from(promos).orderBy(promos.code);
  return rows.map(toPromo).filter((p) => (activeOnly ? p.active : true));
}

/** Lookup for checkout (active only, case-insensitive). */
export async function getActivePromo(code: string): Promise<{ percentOff: number; label: string } | null> {
  if (!code) return null;
  const db = getDb(env().DATABASE_URL);
  const [row] = await db
    .select()
    .from(promos)
    .where(eq(promos.code, code.trim().toUpperCase()))
    .limit(1);
  if (!row || !row.active) return null;
  return { percentOff: row.percentOff, label: row.label };
}

export async function upsertPromo(input: PromoUpsert): Promise<Promo> {
  const db = getDb(env().DATABASE_URL);
  const values = {
    code: input.code.trim().toUpperCase(),
    percentOff: input.percentOff,
    label: input.label.trim(),
    active: input.active,
  };
  const [row] = await db
    .insert(promos)
    .values(values)
    .onConflictDoUpdate({
      target: promos.code,
      set: { percentOff: values.percentOff, label: values.label, active: values.active },
    })
    .returning();
  if (!row) throw new AppError(500, "PROMO_UPSERT_FAILED", "Promo upsert failed");
  return toPromo(row);
}

export async function bumpPromoUsage(code: string): Promise<void> {
  const db = getDb(env().DATABASE_URL);
  await db
    .update(promos)
    .set({ usedCount: sql`${promos.usedCount} + 1` })
    .where(eq(promos.code, code.trim().toUpperCase()));
}
