/**
 * Partner dispatch contract — every POD partner adapter implements this.
 * The order-split engine depends only on this interface, never on a
 * concrete partner SDK, so adding a partner is one file + one registry row.
 */
import type { OrderRow, OrderLineRow } from "../../db/schema.js";

export type PartnerDispatchInput = {
  order: OrderRow;
  lines: OrderLineRow[];
  /** Callback to emit audit events. */
  emitEvent?: (kind: string, detail?: unknown) => void;
};

export type PartnerDispatchResult = {
  partnerOrderId: string;
  /** Raw provider payload kept for support/debug. */
  partnerRef: unknown;
  status: "ACCEPTED_BY_PARTNER" | "REJECTED_BY_PARTNER";
  message?: string;
};

export interface PartnerAdapter {
  readonly id: "QIKINK" | "PRINTROVE" | "IN_HOUSE";
  /** True when credentials are present and the adapter can run. */
  isConfigured(): boolean;
  dispatch(input: PartnerDispatchInput): Promise<PartnerDispatchResult>;
}
