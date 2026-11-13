/**
 * Partner registry — resolves the adapter for a partner id.
 */
import type { PartnerAdapter } from "./types.js";
import { QikinkAdapter } from "./qikink.js";
import { PrintroveAdapter } from "./printrove.js";

const adapters = new Map<string, PartnerAdapter>();
adapters.set("QIKINK", new QikinkAdapter());
adapters.set("PRINTROVE", new PrintroveAdapter());

/** IN_HOUSE is manual fulfillment; adapter-less until ops tooling lands. */
export function getPartnerAdapter(partnerId: string): PartnerAdapter | null {
  return adapters.get(partnerId) ?? null;
}

export function configuredPartners(): Array<{ id: string; configured: boolean }> {
  const out: Array<{ id: string; configured: boolean }> = [];
  for (const [id, a] of adapters) {
    out.push({ id, configured: a.isConfigured() });
  }
  return out;
}
