/**
 * Qikink adapter — real integration shape per Qikink Order API v1.
 *
 * POST {QIKINK_API_BASE}/api/v1/order  with client_id/client_secret auth.
 * When credentials are absent the adapter short-circuits to a simulated
 * acceptance so the solo-builder local flow never crashes; the split is
 * marked with an obviously-demo reference for later reconciliation.
 */
import type { PartnerAdapter, PartnerDispatchInput, PartnerDispatchResult } from "./types.js";
import { env } from "../../config/env.js";
import { PartnerError } from "../../lib/errors.js";

type QikinkOrderPayload = {
  store_id: string;
  client_id: string;
  order_id: string;
  order_date: string;
  billing_customer_name: string;
  billing_last_name: string;
  billing_address: string;
  billing_city: string;
  billing_pincode: string;
  billing_state: string;
  billing_country: string;
  billing_email: string;
  billing_phone: string;
  shipping_is_billing: true;
  order_items: Array<{
    sku: string;
    name: string;
    quantity: number;
    color: string;
    size: string;
    design: Array<{ type: "front" | "back"; url?: string }>;
  }>;
  payment_method: "Prepaid";
  sub_total: number;
};

export class QikinkAdapter implements PartnerAdapter {
  readonly id = "QIKINK" as const;

  isConfigured(): boolean {
    const e = env();
    return Boolean(e.QIKINK_CLIENT_ID && e.QIKINK_CLIENT_SECRET);
  }

  async dispatch(input: PartnerDispatchInput): Promise<PartnerDispatchResult> {
    const { order, lines } = input;
    const e = env();

    const payload: QikinkOrderPayload = {
      store_id: e.QIKINK_CLIENT_ID ?? "demo",
      client_id: e.QIKINK_CLIENT_ID ?? "demo",
      order_id: order.orderNumber,
      order_date: order.createdAt.toISOString().slice(0, 10),
      billing_customer_name: order.customerName.split(" ")[0] ?? order.customerName,
      billing_last_name: order.customerName.split(" ").slice(1).join(" "),
      billing_address: [order.shipLine1, order.shipLine2].filter(Boolean).join(", "),
      billing_city: order.shipCity,
      billing_pincode: order.shipPostalCode,
      billing_state: order.shipState,
      billing_country: order.shipCountry,
      billing_email: order.email,
      billing_phone: order.phone ?? "0000000000",
      shipping_is_billing: true,
      order_items: lines.map((l) => ({
        sku: l.sku,
        name: l.name,
        quantity: l.quantity,
        color: l.colorway,
        size: l.size,
        design: [],
      })),
      payment_method: "Prepaid",
      sub_total: lines.reduce((sum, l) => sum + l.priceMinor * l.quantity, 0) / 100,
    };

    if (!this.isConfigured()) {
      return this.simulate(payload, order.orderNumber);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    try {
      const res = await fetch(`${e.QIKINK_API_BASE}/api/v1/order`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${e.QIKINK_CLIENT_SECRET ?? ""}`,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new PartnerError(
          "QIKINK",
          `Order push failed (${res.status})`,
          text.slice(0, 500),
        );
      }

      const body = (await res.json().catch(() => ({}))) as {
        order_id?: string | number;
        message?: string;
      };
      const partnerOrderId = body.order_id != null ? String(body.order_id) : order.orderNumber;

      return {
        partnerOrderId,
        partnerRef: body,
        status: "ACCEPTED_BY_PARTNER",
        message: body.message,
      };
    } catch (err) {
      if (err instanceof PartnerError) throw err;
      throw new PartnerError(
        "QIKINK",
        err instanceof Error ? err.message : String(err),
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  private simulate(payload: QikinkOrderPayload, orderNumber: string): PartnerDispatchResult {
    return {
      partnerOrderId: `QK-DEMO-${orderNumber}`,
      partnerRef: { simulated: true, payload },
      status: "ACCEPTED_BY_PARTNER",
      message: "Qikink credentials not configured — simulated acceptance",
    };
  }
}
