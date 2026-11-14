/**
 * FX refresh — keeps zone rates honest without a paid data feed.
 *
 * Source: open.er-api.com (free, no key, daily-updated ECB-derived rates).
 * Semantics line up exactly with our zone field: the API returns
 * `1 USD = rates[CUR]`, and `shipping_zones.fx_from_usd` is "1 USD (major)
 * = fxFromUsd zone-major units".
 *
 * Safety rails (a bad FX day must never reprice the store):
 *  - per-currency drift > 25% is rejected (data error or currency crisis),
 *  - rates below 0.000001 or non-numeric are skipped,
 *  - every applied change is written to `admin_actions` with old + new,
 *  - the scheduled job is best-effort: failures log and retry next cycle.
 */
import { and, eq, ne } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { env } from "../config/env.js";
import { adminActions, shippingZones } from "../db/schema.js";
import { AppError } from "../lib/errors.js";
import { inc } from "../lib/metrics.js";

const FX_SOURCE = "https://open.er-api.com/v6/latest/USD";
const MAX_DRIFT = 0.25;

export type FxChange = {
  countryCode: string;
  currency: string;
  previous: number;
  next: number;
  driftPct: number;
  applied: boolean;
  skippedReason?: "MISSING_RATE" | "DRIFT_GUARD" | "UNCHANGED";
};

type FxApiBody = {
  result?: string;
  base_code?: string;
  time_last_update_utc?: string;
  rates?: Record<string, number>;
};

export async function refreshFxRates(opts?: {
  apply?: boolean;
  actor?: { clerkUserId: string; actorName: string };
}): Promise<{ source: string; fetchedAt: string | null; changes: FxChange[]; changedCount: number }> {
  const apply = opts?.apply ?? false;

  let body: FxApiBody;
  try {
    const res = await fetch(FX_SOURCE, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`FX source returned ${res.status}`);
    body = (await res.json()) as FxApiBody;
  } catch (err) {
    inc("fx.refresh.failed");
    throw new AppError(
      502,
      "FX_SOURCE_UNAVAILABLE",
      `FX source unreachable: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  if (body.result !== "success" || !body.rates) {
    inc("fx.refresh.failed");
    throw new AppError(502, "FX_SOURCE_BAD_PAYLOAD", "FX source returned an unexpected payload");
  }

  const db = getDb(env().DATABASE_URL);
  const zones = await db
    .select()
    .from(shippingZones)
    .where(and(ne(shippingZones.currency, "USD"), eq(shippingZones.active, true)));

  const changes: FxChange[] = [];
  for (const zone of zones) {
    const previous = Number(zone.fxFromUsd);
    const rate = body.rates[zone.currency];
    if (typeof rate !== "number" || !Number.isFinite(rate) || rate < 0.000001) {
      changes.push({
        countryCode: zone.countryCode,
        currency: zone.currency,
        previous,
        next: previous,
        driftPct: 0,
        applied: false,
        skippedReason: "MISSING_RATE",
      });
      continue;
    }
    const next = Math.round(rate * 1_000_000) / 1_000_000;
    const driftPct = previous > 0 ? ((next - previous) / previous) * 100 : 0;
    if (Math.abs(driftPct) > MAX_DRIFT * 100) {
      changes.push({
        countryCode: zone.countryCode,
        currency: zone.currency,
        previous,
        next,
        driftPct: Math.round(driftPct * 100) / 100,
        applied: false,
        skippedReason: "DRIFT_GUARD",
      });
      continue;
    }
    if (Math.abs(next - previous) < 0.000001) {
      changes.push({
        countryCode: zone.countryCode,
        currency: zone.currency,
        previous,
        next,
        driftPct: 0,
        applied: false,
        skippedReason: "UNCHANGED",
      });
      continue;
    }

    if (apply) {
      await db
        .update(shippingZones)
        .set({ fxFromUsd: next.toFixed(6) })
        .where(eq(shippingZones.countryCode, zone.countryCode));
    }
    changes.push({
      countryCode: zone.countryCode,
      currency: zone.currency,
      previous,
      next,
      driftPct: Math.round(driftPct * 100) / 100,
      applied: apply,
    });
  }

  const candidates = changes.filter((c) => !c.skippedReason);
  inc(apply ? "fx.refresh.applied_batches" : "fx.refresh.preview_batches");

  if (apply && candidates.length > 0) {
    // Audit as one row: system job or the admin who pressed the button.
    await db
      .insert(adminActions)
      .values({
        clerkUserId: opts?.actor?.clerkUserId ?? "system:fx-refresh",
        actorName: opts?.actor?.actorName ?? "system (fx refresh)",
        action: "ZONE_FX_REFRESH",
        target: `${candidates.length} zone(s)`,
        detail: { source: FX_SOURCE, fetchedAt: body.time_last_update_utc ?? null, changes: candidates },
      })
      .catch(() => undefined);
  }

  return {
    source: FX_SOURCE,
    fetchedAt: body.time_last_update_utc ?? null,
    changes,
    changedCount: apply ? changes.filter((c) => c.applied).length : candidates.length,
  };
}

/** Interval worker — best-effort, unref'd, disabled when FX_REFRESH_HOURS=0. */
let fxWorkerStarted = false;
export function startFxRefreshWorker(): void {
  if (fxWorkerStarted) return;
  const hours = env().FX_REFRESH_HOURS;
  if (hours <= 0) return;
  fxWorkerStarted = true;
  setInterval(() => {
    void refreshFxRates({ apply: true }).catch(() => undefined);
  }, hours * 60 * 60 * 1000).unref();
}
