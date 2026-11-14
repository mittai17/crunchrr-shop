/**
 * Shipping zones service — the multi-country source of truth.
 */
import { eq, asc } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { shippingZones } from "../db/schema.js";
import { env } from "../config/env.js";
import { AppError } from "../lib/errors.js";
import type { ZoneMoney } from "../lib/money.js";
import type { Currency, Zone, ZoneUpsert } from "@crunchrr/shared";

function toZone(row: typeof shippingZones.$inferSelect): Zone {
  return {
    id: row.id,
    countryCode: row.countryCode,
    countryName: row.countryName,
    currency: row.currency as Currency,
    fxFromUsd: Number(row.fxFromUsd),
    shippingFeeMinor: row.shippingFeeMinor,
    priorityFeeMinor: row.priorityFeeMinor,
    freeThresholdMinor: row.freeThresholdMinor,
    taxBps: row.taxBps,
    active: row.active,
    sortOrder: row.sortOrder,
  };
}

export async function listZones(opts?: { activeOnly?: boolean }): Promise<Zone[]> {
  const db = getDb(env().DATABASE_URL);
  const rows = await db
    .select()
    .from(shippingZones)
    .orderBy(asc(shippingZones.sortOrder), asc(shippingZones.countryName));
  return rows.map(toZone).filter((z) => (opts?.activeOnly ? z.active : true));
}

export async function getZoneByCountry(countryCode: string): Promise<Zone | null> {
  const db = getDb(env().DATABASE_URL);
  const code = countryCode.trim().toUpperCase().slice(0, 2);
  const [row] = await db
    .select()
    .from(shippingZones)
    .where(eq(shippingZones.countryCode, code))
    .limit(1);
  return row ? toZone(row) : null;
}

/** Zone as money-math input, guaranteed active (checkout path). */
export async function resolveActiveZone(countryCode: string): Promise<ZoneMoney & { countryName: string }> {
  const zone = await getZoneByCountry(countryCode);
  if (!zone || !zone.active) {
    const all = await listZones({ activeOnly: true });
    const supported = all.map((z) => z.countryName).join(", ");
    throw new (await import("../lib/errors.js")).ValidationError(
      `We don't ship to '${countryCode}' yet. Supported: ${supported || "none configured"}.`,
    );
  }
  return {
    currency: zone.currency,
    fxFromUsd: zone.fxFromUsd,
    shippingFeeMinor: zone.shippingFeeMinor,
    priorityFeeMinor: zone.priorityFeeMinor,
    freeThresholdMinor: zone.freeThresholdMinor,
    taxBps: zone.taxBps,
    countryName: zone.countryName,
  };
}

export async function upsertZone(input: ZoneUpsert): Promise<Zone> {
  const db = getDb(env().DATABASE_URL);
  const code = input.countryCode.trim().toUpperCase();
  const values = {
    countryCode: code,
    countryName: input.countryName.trim(),
    currency: input.currency,
    fxFromUsd: String(input.fxFromUsd),
    shippingFeeMinor: input.shippingFeeMinor,
    priorityFeeMinor: input.priorityFeeMinor,
    freeThresholdMinor: input.freeThresholdMinor,
    taxBps: input.taxBps,
    active: input.active,
    sortOrder: input.sortOrder,
    updatedAt: new Date(),
  };
  const [row] = await db
    .insert(shippingZones)
    .values(values)
    .onConflictDoUpdate({ target: shippingZones.countryCode, set: values })
    .returning();
  if (!row) throw new AppError(500, "ZONE_UPSERT_FAILED", "Zone upsert failed");
  return toZone(row);
}

export async function setZoneActive(countryCode: string, active: boolean): Promise<void> {
  const db = getDb(env().DATABASE_URL);
  await db
    .update(shippingZones)
    .set({ active, updatedAt: new Date() })
    .where(eq(shippingZones.countryCode, countryCode.toUpperCase()));
}
