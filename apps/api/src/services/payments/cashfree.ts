/**
 * Cashfree integration using the official `cashfree-pg` Node SDK (v6).
 *
 * v6 surface: `new Cashfree(CFEnvironment.SANDBOX, appId, secret)` +
 * instance methods `PGCreateOrder(request)` / `PGVerifyWebhookSignature(...)`.
 * TEST-* app ids run against SANDBOX automatically.
 */
import {
  Cashfree,
  CFEnvironment,
  type CreateOrderRequest,
} from "cashfree-pg";
import type { Currency } from "@crunchrr/shared";
import { env } from "../../config/env.js";
import { PaymentError } from "../../lib/errors.js";

let cashfree: Cashfree | null = null;

function getClient(): Cashfree {
  if (cashfree) return cashfree;
  const e = env();
  if (!e.CASHFREE_APP_ID || !e.CASHFREE_SECRET_KEY) {
    throw new PaymentError("Cashfree credentials are not configured");
  }
  const environment = e.CASHFREE_APP_ID.toUpperCase().startsWith("TEST")
    ? CFEnvironment.SANDBOX
    : CFEnvironment.PRODUCTION;
  cashfree = new Cashfree(environment, e.CASHFREE_APP_ID, e.CASHFREE_SECRET_KEY);
  return cashfree;
}

export function isCashfreeConfigured(): boolean {
  const e = env();
  return Boolean(e.CASHFREE_APP_ID && e.CASHFREE_SECRET_KEY);
}

export async function createCashfreeOrder(args: {
  orderNumber: string;
  amountMinor: number;
  currency: Currency;
  customer: { name: string; email: string; phone: string };
}): Promise<{ order_id: string }> {
  try {
    const request: CreateOrderRequest = {
      order_id: args.orderNumber,
      order_amount: args.amountMinor / 100,
      order_currency: args.currency,
      customer_details: {
        customer_id: args.orderNumber,
        customer_name: args.customer.name,
        customer_email: args.customer.email,
        customer_phone: args.customer.phone,
      },
      order_meta: {
        return_url: `${process.env.STOREFRONT_URL ?? "http://localhost:3000"}/bag?order={order_id}`,
      },
    };

    const response = await getClient().PGCreateOrder(request);
    const orderId = (response?.data as { order_id?: string } | undefined)?.order_id;
    if (!orderId) {
      throw new PaymentError("Cashfree order response missing order_id", response);
    }
    return { order_id: orderId };
  } catch (err) {
    if (err instanceof PaymentError) throw err;
    const message =
      (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
      (err instanceof Error ? err.message : String(err));
    throw new PaymentError(`Failed to create Cashfree order: ${message}`);
  }
}

/**
 * Signature gate for the Cashfree webhook route (delegates to the SDK's
 * verifier, which throws on any mismatch).
 */
export function verifyCashfreeSignatureWithSdk(
  signature: string | undefined,
  rawBody: string,
  timestamp: string | undefined,
): boolean {
  try {
    getClient().PGVerifyWebhookSignature(signature ?? "", rawBody, timestamp ?? "");
    return true;
  } catch {
    return false;
  }
}
