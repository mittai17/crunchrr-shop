/**
 * Printrove adapter — real integration shape per Printrove Orders API.
 *
 * Flow: POST /api/v1/channels/orders (Bearer token from login endpoint).
 * When credentials are absent the adapter short-circuits to a simulated
 * acceptance so local development never crashes; the split keeps an
 * obviously-demo reference for later reconciliation.
 */
import type { PartnerAdapter, PartnerDispatchInput, PartnerDispatchResult } from "./types.js";
import { PartnerError } from "../../lib/errors.js";
import { resolvePartnerConfig } from "./config.js";

type PrintroveLine = {
  name: string;
  sku: string;
  quantity: number;
  color: string;
  size: string;
  retail_price: number;
};

type PrintroveOrderPayload = {
  source: "api";
  channel_order_id: string;
  customer: {
    name: string;
    email: string;
    phone: string;
    address_line1: string;
    address_line2?: string;
    city: string;
    state: string;
    pincode: string;
    country: string;
  };
  line_items: PrintroveLine[];
  payment: { method: "Prepaid" };
  shipping_method: "Standard" | "Express";
};

export class PrintroveAdapter implements PartnerAdapter {
  readonly id = "PRINTROVE" as const;

  async isConfigured(): Promise<boolean> {
    return (await resolvePartnerConfig(this.id)).configured;
  }

  async ping(): Promise<{ ok: boolean; message: string }> {
    const cfg = await resolvePartnerConfig(this.id);
    if (!cfg.configured) {
      return { ok: true, message: "Simulated — no credentials configured" };
    }
    try {
      await this.getToken(cfg);
      return { ok: true, message: "Auth OK (token issued)" };
    } catch (err) {
      return { ok: false, message: `Auth failed: ${(err as Error).message.slice(0, 120)}` };
    }
  }

  /** Login → JWT. Cached per process; Printrove tokens last ~24h. */
  private token: { value: string; expiresAt: number } | null = null;

  private async getToken(cfg: { apiBaseUrl: string; clientId: string | null; clientSecret: string | null }): Promise<string> {
    if (this.token && this.token.expiresAt > Date.now() + 60_000) {
      return this.token.value;
    }
    const res = await fetch(`${cfg.apiBaseUrl}/api/v1/channels/tokens`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: cfg.clientId ?? "",
        password: cfg.clientSecret ?? "",
      }),
    });
    if (!res.ok) {
      throw new PartnerError("PRINTROVE", `Auth failed (${res.status})`);
    }
    const body = (await res.json()) as { token?: string };
    if (!body.token) throw new PartnerError("PRINTROVE", "No token in auth response");
    this.token = { value: body.token, expiresAt: Date.now() + 20 * 60 * 60 * 1000 };
    return this.token.value;
  }

  async dispatch(input: PartnerDispatchInput): Promise<PartnerDispatchResult> {
    const { order, lines } = input;
    const cfg = await resolvePartnerConfig(this.id);

    const payload: PrintroveOrderPayload = {
      source: "api",
      channel_order_id: order.orderNumber,
      customer: {
        name: order.customerName,
        email: order.email,
        phone: order.phone ?? "0000000000",
        address_line1: order.shipLine1,
        ...(order.shipLine2 ? { address_line2: order.shipLine2 } : {}),
        city: order.shipCity,
        state: order.shipState,
        pincode: order.shipPostalCode,
        country: order.shipCountry,
      },
      line_items: lines.map((l) => ({
        name: l.name,
        sku: l.sku,
        quantity: l.quantity,
        color: l.colorway,
        size: l.size,
        retail_price: l.priceMinor / 100,
      })),
      payment: { method: "Prepaid" },
      shipping_method: order.deliveryMethod === "PRIORITY" ? "Express" : "Standard",
    };

    if (!(await this.isConfigured())) {
      return this.simulate(payload, order.orderNumber);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    try {
      const token = await this.getToken(cfg);
      const res = await fetch(`${cfg.apiBaseUrl}/api/v1/channels/orders`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new PartnerError(
          "PRINTROVE",
          `Order push failed (${res.status})`,
          text.slice(0, 500),
        );
      }

      const body = (await res.json().catch(() => ({}))) as {
        id?: string | number;
        message?: string;
      };
      const partnerOrderId = body.id != null ? String(body.id) : order.orderNumber;

      return {
        partnerOrderId,
        partnerRef: body,
        status: "ACCEPTED_BY_PARTNER",
        message: body.message,
      };
    } catch (err) {
      if (err instanceof PartnerError) throw err;
      throw new PartnerError(
        "PRINTROVE",
        err instanceof Error ? err.message : String(err),
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  private simulate(payload: PrintroveOrderPayload, orderNumber: string): PartnerDispatchResult {
    return {
      partnerOrderId: `PR-DEMO-${orderNumber}`,
      partnerRef: { simulated: true, payload },
      status: "ACCEPTED_BY_PARTNER",
      message: "Printrove credentials not configured — simulated acceptance",
    };
  }
}
