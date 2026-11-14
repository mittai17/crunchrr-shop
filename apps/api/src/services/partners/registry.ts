/**
 * Partner registry — resolves the adapter for a partner id.
 */
import type { PartnerAdapter } from "./types.js";
import { QikinkAdapter } from "./qikink.js";
import { PrintroveAdapter } from "./printrove.js";
import { GenericPodAdapter } from "./generic-pod.js";

const adapters = new Map<string, PartnerAdapter>();
adapters.set("QIKINK", new QikinkAdapter());
adapters.set("PRINTROVE", new PrintroveAdapter());
/* Roster slots: live adapters pending — simulated dispatch until then. */
adapters.set("INKMONK", new GenericPodAdapter("INKMONK"));
adapters.set("BLINKSTORE", new GenericPodAdapter("BLINKSTORE"));
adapters.set("PRINTFUL", new GenericPodAdapter("PRINTFUL"));
adapters.set("PRINTIFY", new GenericPodAdapter("PRINTIFY"));
adapters.set("GELATO", new GenericPodAdapter("GELATO"));

/** IN_HOUSE is manual fulfillment; adapter-less until ops tooling lands. */
export function getPartnerAdapter(partnerId: string): PartnerAdapter | null {
  return adapters.get(partnerId) ?? null;
}

export async function configuredPartners(): Promise<Array<{ id: string; configured: boolean }>> {
  const out: Array<{ id: string; configured: boolean }> = [];
  for (const [id, a] of adapters) {
    out.push({ id, configured: await a.isConfigured() });
  }
  return out;
}
