/**
 * Public shipping + promo lookups for the storefront checkout.
 */
import type { FastifyInstance } from "fastify";
import { publicPromoSchema, publicZoneSchema } from "@crunchrr/shared";
import { listZones } from "../services/zones.js";
import { listPromos } from "../services/promos.js";

export async function storefrontRoutes(app: FastifyInstance): Promise<void> {
  /** Active destination countries for the checkout selector. */
  app.get("/api/shipping/zones", async () => {
    const zones = await listZones({ activeOnly: true });
    return {
      zones: zones.map((z) =>
        publicZoneSchema.parse({
          countryCode: z.countryCode,
          countryName: z.countryName,
          currency: z.currency,
          fxFromUsd: z.fxFromUsd,
          shippingFeeMinor: z.shippingFeeMinor,
          priorityFeeMinor: z.priorityFeeMinor,
          freeThresholdMinor: z.freeThresholdMinor,
          taxBps: z.taxBps,
          active: z.active,
        }),
      ),
    };
  });

  /** Active promo codes (client-side estimate display). */
  app.get("/api/promos", async () => {
    const promos = await listPromos(true);
    return {
      promos: promos.map((p) =>
        publicPromoSchema.parse({ code: p.code, percentOff: p.percentOff, label: p.label, active: p.active }),
      ),
    };
  });
}
