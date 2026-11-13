/**
 * Razorpay integration using the official `razorpay` Node SDK.
 * Lazily instantiated; every call is defensively typed so malformed
 * SDK responses cannot crash the request lifecycle.
 */
import Razorpay from "razorpay";
import { env, isDemoPayments } from "../../config/env.js";
import { PaymentError } from "../../lib/errors.js";

type RazorpayOrderShape = { id: string };

let client: Razorpay | null = null;

function getClient(): Razorpay {
  if (client) return client;
  const e = env();
  if (!e.RAZORPAY_KEY_ID || !e.RAZORPAY_KEY_SECRET) {
    throw new PaymentError("Razorpay credentials are not configured");
  }
  client = new Razorpay({
    key_id: e.RAZORPAY_KEY_ID,
    key_secret: e.RAZORPAY_KEY_SECRET,
  });
  return client;
}

export function isRazorpayConfigured(): boolean {
  const e = env();
  return Boolean(e.RAZORPAY_KEY_ID && e.RAZORPAY_KEY_SECRET) && !isDemoPayments(e);
}

export async function createRazorpayOrder(args: {
  amountMinor: number;
  currency: "USD" | "INR";
  receipt: string;
  notes?: Record<string, string>;
}): Promise<RazorpayOrderShape> {
  try {
    const order = await getClient().orders.create({
      amount: args.amountMinor,
      currency: args.currency,
      receipt: args.receipt,
      notes: args.notes,
    });
    if (!order || typeof order.id !== "string") {
      throw new PaymentError("Razorpay order response missing id", order);
    }
    return { id: order.id };
  } catch (err) {
    if (err instanceof PaymentError) throw err;
    throw new PaymentError(
      `Failed to create Razorpay order: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}
