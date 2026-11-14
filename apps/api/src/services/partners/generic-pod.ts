/**
 * Generic POD partner adapter — the roster slot for platforms whose live
 * API integration hasn't been coded yet (Inkmonk, Blinkstore, Printful,
 * Printify, Gelato).
 *
 * Behavior mirrors the Qikink/Printrove simulation path: every dispatch is
 * recorded with a partnerOrderId and audit trail, then acknowledged as
 * ACCEPTED_BY_PARTNER so the fulfillment engine keeps moving. When the
 * per-platform adapter lands it replaces this class in the registry —
 * nothing else in the dispatch pipeline changes.
 */
import type { PartnerAdapter, PartnerDispatchInput, PartnerDispatchResult } from "./types.js";
import { resolvePartnerConfig } from "./config.js";
import { PartnerError } from "../../lib/errors.js";

/** Roster metadata surfaced in the admin partners panel. */
export const PARTNER_META: Record<
  string,
  { label: string; hq: string; region: string; baseUrl: string; note: string }
> = {
  INKMONK: {
    label: "Inkmonk",
    hq: "Chennai, Tamil Nadu",
    region: "IN",
    baseUrl: "https://api.inkmonk.com",
    note: "Chennai print network — same-day TN dispatch, apparel + merch.",
  },
  BLINKSTORE: {
    label: "Blinkstore",
    hq: "Mumbai, India",
    region: "IN",
    baseUrl: "https://api.blinkstore.org",
    note: "India-wide POD marketplace with pan-India courier tie-ups.",
  },
  PRINTFUL: {
    label: "Printful",
    hq: "Charlotte, NC, USA",
    region: "US/UK/EU",
    baseUrl: "https://api.printful.com",
    note: "US + UK fulfillment centers for Western drop lanes.",
  },
  PRINTIFY: {
    label: "Printify",
    hq: "San Francisco, USA",
    region: "US/UK",
    baseUrl: "https://api.printify.com",
    note: "Global print-provider network — pick US/UK facilities per SKU.",
  },
  GELATO: {
    label: "Gelato",
    hq: "Oslo / New York / London",
    region: "US/UK/EU",
    baseUrl: "https://order.gelato.com",
    note: "Local production in 30+ countries; strongest US/UK lane latency.",
  },
  CONTRADO: {
    label: "Contrado",
    hq: "London, England",
    region: "UK/EU",
    baseUrl: "https://api.contrado.com",
    note: "London print facility — premium UK-made apparel & accessories.",
  },
  INKTHREADABLE: {
    label: "Inkthreadable",
    hq: "Lancashire, England",
    region: "UK",
    baseUrl: "https://api.inkthreadable.co.uk",
    note: "England-based POD with carbon-neutral UK production.",
  },
  GOOTEN: {
    label: "Gooten",
    hq: "New York, USA",
    region: "US/UK",
    baseUrl: "https://api.gooten.com",
    note: "US API-first POD network with UK print partners.",
  },
};

export class GenericPodAdapter implements PartnerAdapter {
  constructor(readonly id: string) {}

  async isConfigured(): Promise<boolean> {
    const cfg = await resolvePartnerConfig(this.id);
    return cfg.configured;
  }

  async ping(): Promise<{ ok: boolean; message: string }> {
    const meta = PARTNER_META[this.id];
    if (!meta) return { ok: false, message: `Unknown partner '${this.id}'` };
    const cfg = await resolvePartnerConfig(this.id);
    if (cfg.configured) {
      return {
        ok: true,
        message: `${meta.label} — credentials stored (${cfg.source}). Live API adapter pending; dispatch is recorded and the ${meta.hq} team fulfills from the partner dashboard.`,
      };
    }
    return {
      ok: true,
      message: `${meta.label} — no credentials yet, so dispatch runs in simulation. Store credentials to route orders to the ${meta.hq} dashboard.`,
    };
  }

  async dispatch(input: PartnerDispatchInput): Promise<PartnerDispatchResult> {
    const { order, lines } = input;
    const meta = PARTNER_META[this.id];
    if (!meta) throw new PartnerError(this.id, "Unknown partner id in registry");

    const payload = {
      channel_order_id: order.orderNumber,
      customer: {
        name: order.customerName,
        email: order.email,
        phone: order.phone ?? "0000000000",
        address_line1: order.shipLine1,
        ...(order.shipLine2 ? { address_line2: order.shipLine2 } : {}),
        city: order.shipCity,
        state: order.shipState,
        postal_code: order.shipPostalCode,
        country: order.shipCountry,
      },
      line_items: lines.map((l) => ({
        sku: l.sku,
        name: l.name,
        color: l.colorway,
        size: l.size,
        quantity: l.quantity,
        retail_price: l.priceMinor / 100,
      })),
      shipping_method: order.deliveryMethod === "PRIORITY" ? "Express" : "Standard",
      note: `${meta.label} (${meta.hq}) — ${meta.region} lane`,
    };

    // Simulated acceptance until the live adapter for this platform lands.
    return {
      partnerOrderId: `${this.id.slice(0, 2)}-DEMO-${order.orderNumber}`,
      partnerRef: { simulated: true, payload },
      status: "ACCEPTED_BY_PARTNER",
      message: `${meta.label} — simulated acceptance (live API integration pending)`,
    };
  }
}
