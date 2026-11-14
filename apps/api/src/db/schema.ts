/**
 * Crunchrr — Drizzle ORM schema (PostgreSQL / Neon).
 *
 * Multi-partner Print-on-Demand domain: catalog, orders, payment webhooks,
 * and per-partner split fulfilment. All money is stored in minor units
 * (paise for INR / cents for USD) as integers to avoid float drift.
 */
import { relations } from "drizzle-orm";
import {
  bigint,
  uuid,
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

/* ------------------------------------------------------------------ */
/* Enums                                                               */
/* ------------------------------------------------------------------ */

export const productCategoryEnum = pgEnum("product_category", [
  "HOODIES",
  "TEES",
  "BOTTOMS",
  "OUTERWEAR",
  "HEADWEAR",
  "ARTIFACTS",
]);

export const partnerIdEnum = pgEnum("partner_id", [
  "QIKINK",
  "PRINTROVE",
  "INKMONK",
  "BLINKSTORE",
  "PRINTFUL",
  "PRINTIFY",
  "GELATO",
  "CONTRADO",
  "INKTHREADABLE",
  "GOOTEN",
  "IN_HOUSE",
]);

export const productSizeEnum = pgEnum("product_size", [
  "XS",
  "S",
  "M",
  "L",
  "XL",
  "XXL",
  "ONE_SIZE",
]);

export const orderStatusEnum = pgEnum("order_status", [
  "PENDING_PAYMENT",
  "PAYMENT_CONFIRMED",
  "PARTNER_DISPATCHED",
  "SHIPPED",
  "DELIVERED",
  "CANCELLED",
  "REFUNDED",
  "FAILED",
]);

export const splitStatusEnum = pgEnum("split_status", [
  "PENDING",
  "SENT_TO_PARTNER",
  "ACCEPTED_BY_PARTNER",
  "REJECTED_BY_PARTNER",
  "SHIPPED",
  "DELIVERED",
  "CANCELLED",
]);

export const paymentProviderEnum = pgEnum("payment_provider", ["RAZORPAY", "CASHFREE"]);

/* ------------------------------------------------------------------ */
/* Catalog                                                             */
/* ------------------------------------------------------------------ */

export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: varchar("slug", { length: 140 }).notNull().unique(),
    name: varchar("name", { length: 160 }).notNull(),
    tagline: text("tagline").notNull().default(""),
    description: text("description").notNull().default(""),
    category: productCategoryEnum("category").notNull(),
    collection: varchar("collection", { length: 80 }).notNull().default("Drop 004"),
    gsmLabel: varchar("gsm_label", { length: 60 }).notNull().default(""),
    fabricLabel: varchar("fabric_label", { length: 120 }).notNull().default(""),
    /** e.g. {"text":"Vault Piece","tone":"coral"} */
    badge: jsonb("badge").$type<{ text: string; tone: "coral" | "charcoal" | "jade" | "error" } | null>(),
    unitsLeftLabel: varchar("units_left_label", { length: 80 }),
    rating: numeric("rating", { precision: 2, scale: 1 }).notNull().default("4.9"),
    reviewCount: integer("review_count").notNull().default(0),
    specs: jsonb("specs")
      .$type<{ fit: string; material: string; shipping: string; sustainability: string }>()
      .notNull()
      .default({ fit: "", material: "", shipping: "", sustainability: "" }),
    featured: boolean("featured").notNull().default(false),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("products_category_active_idx").on(t.category, t.active), index("products_created_idx").on(t.createdAt)],
);

export const productImages = pgTable(
  "product_images",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    alt: text("alt").notNull().default("Crunchrr product"),
    /** "01 Front", "02 Sleeve"… */
    label: varchar("label", { length: 60 }),
    position: integer("position").notNull().default(0),
  },
  (t) => [index("product_images_product_idx").on(t.productId, t.position)],
);

/** One SKU = one partner-routable unit. partnerId decides where the PO goes. */
export const productVariants = pgTable(
  "product_variants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    sku: varchar("sku", { length: 60 }).notNull().unique(),
    size: productSizeEnum("size").notNull(),
    colorway: varchar("colorway", { length: 100 }).notNull(),
    colorHex: varchar("color_hex", { length: 7 }).notNull(),
    stock: integer("stock").notNull().default(0),
    partnerId: partnerIdEnum("partner_id").notNull(),
    /** Partner garment/print cost, minor units. */
    partnerCostMinor: integer("partner_cost_minor").notNull().default(0),
    /** Retail price, minor units. */
    priceMinor: integer("price_minor").notNull(),
    comparePriceMinor: integer("compare_price_minor"),
    active: boolean("active").notNull().default(true),
  },
  (t) => [index("product_variants_product_idx").on(t.productId), index("product_variants_partner_idx").on(t.partnerId)],
);

/* ------------------------------------------------------------------ */
/* Orders & fulfilment splits                                          */
/* ------------------------------------------------------------------ */

export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderNumber: varchar("order_number", { length: 40 }).notNull().unique(),
    status: orderStatusEnum("status").notNull().default("PENDING_PAYMENT"),
    /** Clerk user id. */
    userId: varchar("user_id", { length: 80 }),
    email: varchar("email", { length: 190 }).notNull(),
    phone: varchar("phone", { length: 24 }),
    customerName: varchar("customer_name", { length: 120 }).notNull(),

    shipLine1: varchar("ship_line1", { length: 200 }).notNull(),
    shipLine2: varchar("ship_line2", { length: 200 }),
    shipCity: varchar("ship_city", { length: 100 }).notNull(),
    shipState: varchar("ship_state", { length: 100 }).notNull(),
    shipPostalCode: varchar("ship_postal_code", { length: 16 }).notNull(),
    shipCountry: varchar("ship_country", { length: 80 }).notNull().default("India"),

    deliveryMethod: varchar("delivery_method", { length: 16 }).notNull().default("STANDARD"),

    currency: varchar("currency", { length: 3 }).notNull().default("USD"),
    itemsSubtotalMinor: bigint("items_subtotal_minor", { mode: "number" }).notNull(),
    discountMinor: bigint("discount_minor", { mode: "number" }).notNull().default(0),
    shippingMinor: bigint("shipping_minor", { mode: "number" }).notNull().default(0),
    taxMinor: bigint("tax_minor", { mode: "number" }).notNull().default(0),
    grandTotalMinor: bigint("grand_total_minor", { mode: "number" }).notNull(),

    promoCode: varchar("promo_code", { length: 40 }),

    paymentProvider: paymentProviderEnum("payment_provider"),
    /** Razorpay order id / Cashfree order id. */
    paymentGatewayRef: varchar("payment_gateway_ref", { length: 80 }),
    /** Payment id after capture. */
    paymentRef: varchar("payment_ref", { length: 80 }),
    paidAt: timestamp("paid_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("orders_user_idx").on(t.userId),
    index("orders_status_idx").on(t.status),
    index("orders_gateway_ref_idx").on(t.paymentGatewayRef),
  ],
);

/** One logical bag line; routed to exactly one partner split. */
export const orderLines = pgTable(
  "order_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    variantId: uuid("variant_id")
      .notNull()
      .references(() => productVariants.id),
    /** Denormalized snapshots for stable partner payloads. */
    name: varchar("name", { length: 160 }).notNull(),
    sku: varchar("sku", { length: 60 }).notNull(),
    size: productSizeEnum("size").notNull(),
    colorway: varchar("colorway", { length: 100 }).notNull(),
    quantity: integer("quantity").notNull(),
    priceMinor: integer("price_minor").notNull(),
    costMinor: integer("cost_minor").notNull(),
    partnerId: partnerIdEnum("partner_id").notNull(),
    splitId: uuid("split_id"),
  },
  (t) => [index("order_lines_order_idx").on(t.orderId)],
);

/** Orders are dynamically split per partner and routed by API. */
export const orderSplits = pgTable(
  "order_splits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    partnerId: partnerIdEnum("partner_id").notNull(),
    status: splitStatusEnum("status").notNull().default("PENDING"),
    partnerOrderId: varchar("partner_order_id", { length: 80 }),
    /** Raw partner response reference for support investigations. */
    partnerRef: jsonb("partner_ref"),
    shippedAt: timestamp("shipped_at", { withTimezone: true }),
    trackingCode: varchar("tracking_code", { length: 100 }),
    trackingUrl: text("tracking_url"),
  },
  (t) => [
    uniqueIndex("order_splits_order_partner_uq").on(t.orderId, t.partnerId),
    index("order_splits_status_idx").on(t.status),
  ],
);

/** Append-only audit trail for every state transition. */
export const orderEvents = pgTable(
  "order_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    /** CREATED, PAYMENT_CONFIRMED, SPLIT_CREATED, PARTNER_SENT… */
    kind: varchar("kind", { length: 60 }).notNull(),
    detail: jsonb("detail"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("order_events_order_idx").on(t.orderId, t.createdAt)],
);

/* ------------------------------------------------------------------ */
/* Webhook ingestion                                                   */
/* ------------------------------------------------------------------ */

/**
 * Every raw webhook hit is persisted before processing so replays and
 * investigations never depend on the provider's retention window.
 */
export const paymentWebhooks = pgTable(
  "payment_webhooks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    provider: varchar("provider", { length: 16 }).notNull(),
    /** Provider-supplied dedupe key when available. */
    eventId: varchar("event_id", { length: 100 }),
    eventType: varchar("event_type", { length: 80 }).notNull(),
    signatureOk: boolean("signature_ok").notNull().default(false),
    processed: boolean("processed").notNull().default(false),
    /** OK | DUPLICATE | IGNORED | INVALID_SIGNATURE | ERROR */
    outcome: varchar("outcome", { length: 24 }),
    errorText: text("error_text"),
    payloadJson: jsonb("payload_json").notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("payment_webhooks_provider_event_uq").on(t.provider, t.eventId),
    index("payment_webhooks_provider_time_idx").on(t.provider, t.receivedAt),
  ],
);

/* ------------------------------------------------------------------ */
/* Partner ops                                                         */
/* ------------------------------------------------------------------ */

export const partnerCredentials = pgTable("partner_credentials", {
  partnerId: partnerIdEnum("partner_id").primaryKey(),
  apiBaseUrl: text("api_base_url").notNull(),
  /** Which credentials are configured — never the secret itself. */
  authHint: varchar("auth_hint", { length: 80 }),
  /** Admin-editable credentials; adapters prefer these over env vars. */
  clientId: text("client_id"),
  clientSecret: text("client_secret"),
  active: boolean("active").notNull().default(true),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ------------------------------------------------------------------ */
/* Multi-country shipping zones                                        */
/* ------------------------------------------------------------------ */

/**
 * One row per supported destination country. Catalog prices are stored in
 * base USD minor units; each zone carries the FX multiplier (per major
 * unit) plus its own fees/tax so checkout charges in the local currency.
 */
export const shippingZones = pgTable("shipping_zones", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** ISO-3166 alpha-2, e.g. "US", "IN". */
  countryCode: varchar("country_code", { length: 2 }).notNull().unique(),
  countryName: varchar("country_name", { length: 80 }).notNull(),
  currency: varchar("currency", { length: 3 }).notNull(),
  /** 1 USD (major) = fxFromUsd zone-major units. */
  fxFromUsd: numeric("fx_from_usd", { precision: 12, scale: 6 }).notNull(),
  shippingFeeMinor: integer("shipping_fee_minor").notNull(),
  priorityFeeMinor: integer("priority_fee_minor").notNull(),
  freeThresholdMinor: integer("free_threshold_minor").notNull(),
  /** Tax in basis points (1800 = 18%). */
  taxBps: integer("tax_bps").notNull(),
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(100),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ------------------------------------------------------------------ */
/* Promo codes (admin-managed, replaces the hardcoded map)             */
/* ------------------------------------------------------------------ */

export const promos = pgTable("promos", {
  code: varchar("code", { length: 40 }).primaryKey(),
  percentOff: integer("percent_off").notNull(),
  label: varchar("label", { length: 80 }).notNull(),
  active: boolean("active").notNull().default(true),
  usedCount: integer("used_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ------------------------------------------------------------------ */
/* Relations (query-time helpers)                                      */
/* ------------------------------------------------------------------ */

export const productRelations = relations(products, ({ many }) => ({
  images: many(productImages),
  variants: many(productVariants),
  lines: many(orderLines),
}));

export const productImageRelations = relations(productImages, ({ one }) => ({
  product: one(products, { fields: [productImages.productId], references: [products.id] }),
}));

export const productVariantRelations = relations(productVariants, ({ one, many }) => ({
  product: one(products, { fields: [productVariants.productId], references: [products.id] }),
  lines: many(orderLines),
}));

export const orderRelations = relations(orders, ({ many }) => ({
  lines: many(orderLines),
  splits: many(orderSplits),
  events: many(orderEvents),
}));

export const orderLineRelations = relations(orderLines, ({ one }) => ({
  order: one(orders, { fields: [orderLines.orderId], references: [orders.id] }),
  variant: one(productVariants, { fields: [orderLines.variantId], references: [productVariants.id] }),
  split: one(orderSplits, { fields: [orderLines.splitId], references: [orderSplits.id] }),
}));

export const orderSplitRelations = relations(orderSplits, ({ one, many }) => ({
  order: one(orders, { fields: [orderSplits.orderId], references: [orders.id] }),
  lines: many(orderLines),
}));

export const orderEventRelations = relations(orderEvents, ({ one }) => ({
  order: one(orders, { fields: [orderEvents.orderId], references: [orders.id] }),
}));

/* ------------------------------------------------------------------ */
/* Inferred types                                                      */
/* ------------------------------------------------------------------ */

export type ProductRow = typeof products.$inferSelect;
export type ProductImageRow = typeof productImages.$inferSelect;
export type ProductVariantRow = typeof productVariants.$inferSelect;
export type OrderRow = typeof orders.$inferSelect;
export type OrderLineRow = typeof orderLines.$inferSelect;
export type OrderSplitRow = typeof orderSplits.$inferSelect;
export type OrderEventRow = typeof orderEvents.$inferSelect;
export type PaymentWebhookRow = typeof paymentWebhooks.$inferSelect;
export type PartnerIdType = (typeof partnerIdEnum.enumValues)[number];
export type OrderStatusType = (typeof orderStatusEnum.enumValues)[number];
export type SplitStatusType = (typeof splitStatusEnum.enumValues)[number];
export type ProductCategoryType = (typeof productCategoryEnum.enumValues)[number];
export type ProductSizeType = (typeof productSizeEnum.enumValues)[number];
