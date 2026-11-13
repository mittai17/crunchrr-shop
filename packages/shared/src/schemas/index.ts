/**
 * @crunchrr/shared — domain schemas & types
 *
 * Single source of truth for every payload that crosses the
 * Next.js ⇄ Fastify ⇄ Partner ⇄ Payment-provider boundaries.
 * Zod schemas are written once here and inferred everywhere else.
 */

import { z } from "zod";

/* ------------------------------------------------------------------ */
/* Constants & primitives                                              */
/* ------------------------------------------------------------------ */

/** Fulfilment partners integrated with Crunchrr. */
export const PARTNER_IDS = ["QIKINK", "PRINTROVE", "IN_HOUSE"] as const;
export type PartnerId = (typeof PARTNER_IDS)[number];

/** Lifecycle of an order at Crunchrr level. */
export const ORDER_STATUSES = [
  "PENDING_PAYMENT",
  "PAYMENT_CONFIRMED",
  "PARTNER_DISPATCHED",
  "SHIPPED",
  "DELIVERED",
  "CANCELLED",
  "REFUNDED",
  "FAILED",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** Lifecycle of a single partner split order. */
export const SPLIT_STATUSES = [
  "PENDING",
  "SENT_TO_PARTNER",
  "ACCEPTED_BY_PARTNER",
  "REJECTED_BY_PARTNER",
  "SHIPPED",
  "DELIVERED",
  "CANCELLED",
] as const;
export type SplitStatus = (typeof SPLIT_STATUSES)[number];

/** Product categories surfaced in the storefront UI. */
export const PRODUCT_CATEGORIES = [
  "HOODIES",
  "TEES",
  "BOTTOMS",
  "OUTERWEAR",
  "HEADWEAR",
  "ARTIFACTS",
] as const;
export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number];

export const PRODUCT_SIZES = ["XS", "S", "M", "L", "XL", "XXL", "ONE_SIZE"] as const;
export type ProductSize = (typeof PRODUCT_SIZES)[number];

export const PAYMENT_PROVIDERS = ["RAZORPAY", "CASHFREE"] as const;
export type PaymentProvider = (typeof PAYMENT_PROVIDERS)[number];

/** ISO-4217 numeric currencies the platform settles in. */
export const CURRENCY = z.enum(["INR", "USD"]);
export type Currency = z.infer<typeof CURRENCY>;

/* ------------------------------------------------------------------ */
/* Product / catalog                                                   */
/* ------------------------------------------------------------------ */

export const productVariantSchema = z.object({
  id: z.string().min(1),
  sku: z.string().min(1),
  size: z.enum(PRODUCT_SIZES),
  colorway: z.string().min(1),
  colorHex: z.string().regex(/^#([0-9a-fA-F]{6})$/, "hex color"),
  stock: z.number().int().min(0),
  partnerId: z.enum(PARTNER_IDS),
  /** Price in minor units (paise for INR, cents for USD). */
  priceMinor: z.number().int().nonnegative(),
  comparePriceMinor: z.number().int().nonnegative().nullable().optional(),
});
export type ProductVariant = z.infer<typeof productVariantSchema>;

export const productImageSchema = z.object({
  id: z.string().min(1),
  url: z.string().min(1),
  alt: z.string().default("Crunchrr product"),
  label: z.string().optional(),
});
export type ProductImage = z.infer<typeof productImageSchema>;

export const productSchema = z.object({
  id: z.string().min(1),
  slug: z.string().min(1),
  name: z.string().min(1),
  tagline: z.string().default(""),
  description: z.string().default(""),
  category: z.enum(PRODUCT_CATEGORIES),
  collection: z.string().default("Drop 004"),
  gsmLabel: z.string().default(""),
  fabricLabel: z.string().default(""),
  badge: z
    .object({ text: z.string(), tone: z.enum(["coral", "charcoal", "jade", "error"]) })
    .nullable()
    .optional(),
  unitsLeftLabel: z.string().nullable().optional(),
  rating: z.number().min(0).max(5),
  reviewCount: z.number().int().nonnegative(),
  images: z.array(productImageSchema).min(1),
  variants: z.array(productVariantSchema).min(1),
  specs: z
    .object({
      fit: z.string().default(""),
      material: z.string().default(""),
      shipping: z.string().default(""),
      sustainability: z.string().default(""),
    })
    .default({ fit: "", material: "", shipping: "", sustainability: "" }),
  createdAt: z.string().optional(),
});
export type Product = z.infer<typeof productSchema>;

/** Serialized product list payload returned by GET /api/products. */
export const productListResponseSchema = z.object({
  items: z.array(productSchema),
  total: z.number().int().nonnegative(),
});
export type ProductListResponse = z.infer<typeof productListResponseSchema>;

export const productDetailResponseSchema = z.object({
  product: productSchema,
  related: z.array(productSchema).default([]),
});
export type ProductDetailResponse = z.infer<typeof productDetailResponseSchema>;

export const catalogQuerySchema = z.object({
  category: z.enum(PRODUCT_CATEGORIES).optional(),
  size: z.enum(PRODUCT_SIZES).optional(),
  search: z.string().max(120).optional(),
  sort: z
    .enum(["featured", "newest", "price-asc", "price-desc", "bestseller"])
    .default("featured"),
  limit: z.coerce.number().int().min(1).max(48).default(12),
  offset: z.coerce.number().int().min(0).default(0),
});
export type CatalogQuery = z.infer<typeof catalogQuerySchema>;

/* ------------------------------------------------------------------ */
/* Cart & checkout                                                     */
/* ------------------------------------------------------------------ */

/** One line item chosen by the shopper (variant resolved on the API). */
export const cartLineSchema = z.object({
  variantSku: z.string().min(1),
  quantity: z.number().int().min(1).max(10),
});
export type CartLine = z.infer<typeof cartLineSchema>;

export const checkoutRequestSchema = z.object({
  lines: z.array(cartLineSchema).min(1, "Bag is empty").max(20),
  customer: z.object({
    name: z.string().min(2).max(80),
    email: z.string().email().max(160),
    phone: z
      .string()
      .trim()
      .regex(/^[+0-9][0-9\s-]{6,18}$/, "Valid phone required"),
  }),
  shippingAddress: z.object({
    line1: z.string().min(3).max(160),
    line2: z.string().max(160).optional(),
    city: z.string().min(2).max(80),
    state: z.string().min(2).max(80),
    postalCode: z.string().min(4).max(10),
    country: z.string().min(2).max(56).default("India"),
  }),
  deliveryMethod: z.enum(["STANDARD", "PRIORITY"]).default("STANDARD"),
  promoCode: z.string().max(40).optional(),
  /** Amount the client believes the bag totals — server re-computes and rejects mismatches. */
  clientCurrency: CURRENCY.default("USD"),
});
export type CheckoutRequest = z.infer<typeof checkoutRequestSchema>;

/** Server-computed authoritative totals (never trust the client). */
export const checkoutTotalsSchema = z.object({
  currency: CURRENCY,
  itemsSubtotalMinor: z.number().int().nonnegative(),
  discountMinor: z.number().int().nonnegative(),
  shippingMinor: z.number().int().nonnegative(),
  taxMinor: z.number().int().nonnegative(),
  grandTotalMinor: z.number().int().nonnegative(),
});
export type CheckoutTotals = z.infer<typeof checkoutTotalsSchema>;

export const checkoutResponseSchema = z.object({
  orderId: z.string().min(1),
  orderNumber: z.string().min(1),
  totals: checkoutTotalsSchema,
  payment: z.object({
    provider: z.enum(PAYMENT_PROVIDERS),
    /** Razorpay order id / Cashfree order token. */
    gatewayOrderId: z.string().min(1),
    /** Minor units the gateway must collect. */
    amountMinor: z.number().int().positive(),
    currency: CURRENCY,
    /** Publishable key id for Razorpay checkout.js on the client. */
    publicKeyId: z.string().optional(),
    /** When true no real gateway is configured — UI should show a demo confirmation. */
    demoMode: z.boolean(),
  }),
});
export type CheckoutResponse = z.infer<typeof checkoutResponseSchema>;

/* ------------------------------------------------------------------ */
/* Orders                                                              */
/* ------------------------------------------------------------------ */

export const orderSplitSchema = z.object({
  id: z.string().min(1),
  partnerId: z.enum(PARTNER_IDS),
  partnerOrderId: z.string().nullable(),
  status: z.enum(SPLIT_STATUSES),
  lines: z.array(
    z.object({
      sku: z.string(),
      name: z.string(),
      quantity: z.number().int().positive(),
      partnerCostMinor: z.number().int().nonnegative(),
    }),
  ),
});
export type OrderSplit = z.infer<typeof orderSplitSchema>;

export const orderResponseSchema = z.object({
  id: z.string(),
  orderNumber: z.string(),
  status: z.enum(ORDER_STATUSES),
  userId: z.string().nullable(),
  email: z.string(),
  totals: checkoutTotalsSchema,
  paymentProvider: z.enum(PAYMENT_PROVIDERS).nullable(),
  paymentRef: z.string().nullable(),
  splits: z.array(orderSplitSchema),
  createdAt: z.string(),
});
export type OrderResponse = z.infer<typeof orderResponseSchema>;

/** Compact per-order shape for "my orders" lists. */
export const orderSummarySchema = z.object({
  id: z.string(),
  orderNumber: z.string(),
  status: z.enum(ORDER_STATUSES),
  grandTotalMinor: z.number().int().nonnegative(),
  currency: z.enum(["USD", "INR"]),
  itemCount: z.number().int().positive(),
  previewLine: z.string(),
  createdAt: z.string(),
});
export type OrderSummary = z.infer<typeof orderSummarySchema>;

/* ------------------------------------------------------------------ */
/* Webhooks — Razorpay                                                 */
/* ------------------------------------------------------------------ */

/**
 * Razorpay's documented webhook `payload` envelope.
 * Every field the handler touches is explicitly typed; unknown event
 * types are rejected early rather than silently mutated.
 */
export const razorpayWebhookSchema = z.object({
  event: z.string().min(1),
  /** Razorpay sends a Unix-seconds timestamp. */
  created_at: z.coerce.number().int().nonnegative(),
  payload: z
    .object({
      payment: z
        .object({
          entity: z.object({
            id: z.string().min(3),
            order_id: z.string().min(3),
            amount: z.number().int().nonnegative(),
            currency: z.string().min(3).max(3),
            status: z.string().min(3),
            method: z.string().optional(),
            captured: z.boolean().optional(),
            notes: z.record(z.string()).optional(),
            error_description: z.string().nullable().optional(),
          }),
        })
        .optional(),
      order: z
        .object({
          entity: z.object({
            id: z.string().min(3),
            amount: z.number().int().nonnegative(),
            currency: z.string().min(3).max(3),
            status: z.string().optional(),
          }),
        })
        .optional(),
      refund: z
        .object({
          entity: z.object({
            id: z.string().min(3),
            payment_id: z.string().min(3),
            amount: z.number().int().nonnegative(),
            status: z.string().optional(),
          }),
        })
        .optional(),
    })
    .passthrough(), // tolerate undocumented sections without crashing
});
export type RazorpayWebhook = z.infer<typeof razorpayWebhookSchema>;

/** Payment webhook outcomes the route handler may trigger. */
export const PAYMENT_CONFIRMING_EVENTS = new Set([
  "payment.captured",
  "order.paid",
  "payment.authorized",
]);
export const PAYMENT_FAILURE_EVENTS = new Set([
  "payment.failed",
  "order.cancelled",
]);

/* ------------------------------------------------------------------ */
/* Webhooks — Cashfree                                                 */
/* ------------------------------------------------------------------ */

export const cashfreeWebhookSchema = z.object({
  type: z.string().min(1), // e.g. "PAYMENT_SUCCESS"
  data: z
    .object({
      order: z
        .object({
          order_id: z.string().min(1),
          order_amount: z.number().nonnegative(),
          order_currency: z.string().min(3).max(3),
        })
        .optional(),
      payment: z
        .object({
          cf_payment_id: z.union([z.string(), z.number()]).transform(String),
          payment_status: z.string().min(1),
          payment_amount: z.number().nonnegative().optional(),
          payment_currency: z.string().min(3).max(3).optional(),
          payment_group: z.string().optional(),
          payment_method: z.unknown().optional(),
        })
        .optional(),
    })
    .passthrough(),
});
export type CashfreeWebhook = z.infer<typeof cashfreeWebhookSchema>;

/* ------------------------------------------------------------------ */
/* Health & misc                                                       */
/* ------------------------------------------------------------------ */

export const healthResponseSchema = z.object({
  status: z.literal("ok"),
  service: z.string(),
  version: z.string(),
  uptimeSeconds: z.number().nonnegative(),
  db: z.boolean(),
});
export type HealthResponse = z.infer<typeof healthResponseSchema>;

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
    requestId: z.string().optional(),
  }),
});
export type ApiError = z.infer<typeof apiErrorSchema>;
