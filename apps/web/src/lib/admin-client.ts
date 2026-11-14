"use client";

/**
 * Admin API client — every call attaches the Clerk session token.
 * The API enforces the allowlist / dev-bypass; the UI just surfaces errors.
 */
import type { AdminOrderRow, AdminOverview, AdminPartner, AdminSplitRow, AdminWebhookRow, OrderResponse, Promo, Zone } from "@crunchrr/shared";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4001";

type Err = { error?: { message?: string } };

async function call<T>(method: string, path: string, token: string | null, body?: unknown): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const json = (await res.json().catch(() => ({}))) as T & Err;
  if (!res.ok) {
    throw new Error(json?.error?.message ?? `Request failed (${res.status})`);
  }
  return json;
}

export type AdminApi = {
  get: <T>(path: string) => Promise<T>;
  post: <T>(path: string, body?: unknown) => Promise<T>;
  patch: <T>(path: string, body?: unknown) => Promise<T>;
  put: <T>(path: string, body?: unknown) => Promise<T>;
  delete: <T>(path: string) => Promise<T>;
};

/** Stable fetcher bound to the live session — the token is resolved per
 * request (Clerk session JWTs rotate, so a cached one would go stale). */
export function adminApi(getToken: () => Promise<string | null>): AdminApi {
  return {
    get: (p) => resolve(getToken).then((t) => call("GET", p, t)),
    post: (p, b) => resolve(getToken).then((t) => call("POST", p, t, b)),
    patch: (p, b) => resolve(getToken).then((t) => call("PATCH", p, t, b)),
    put: (p, b) => resolve(getToken).then((t) => call("PUT", p, t, b)),
    delete: (p) => resolve(getToken).then((t) => call("DELETE", p, t)),
  };
}

async function resolve(getToken: () => Promise<string | null>): Promise<string | null> {
  try {
    return await getToken();
  } catch {
    return null;
  }
}

/* -------- response shapes used by the admin pages -------- */

export type Overview = AdminOverview;

export type AdminOrderDetail = {
  order: OrderResponse;
  customer: {
    customerName: string;
    phone: string | null;
    shipLine1: string;
    shipLine2: string | null;
    shipCity: string;
    shipState: string;
    shipPostalCode: string;
    shipCountry: string;
    deliveryMethod: string;
  } | null;
  events: Array<{ kind: string; detail: unknown; createdAt: string }>;
};

export type AdminOrderList = { orders: AdminOrderRow[] };

export type AdminProductRow = {
  id: string;
  slug: string;
  name: string;
  category: string;
  collection: string;
  active: boolean;
  featured: boolean;
  image: string | null;
  variantCount: number;
  totalStock: number;
  priceMinMinor: number;
  priceMaxMinor: number;
  partners: string[];
};

export type AdminVariantRow = {
  id: string;
  sku: string;
  size: string;
  colorway: string;
  colorHex: string;
  stock: number;
  partnerId: string;
  partnerCostMinor: number;
  priceMinor: number;
  comparePriceMinor: number | null;
  active: boolean;
};

export type AdminProductDetail = {
  product: AdminProductRow & {
    tagline: string;
    description: string;
    gsmLabel: string | null;
    fabricLabel: string | null;
    badgeText: string | null;
  };
  variants: AdminVariantRow[];
};

export type SplitList = { splits: AdminSplitRow[] };
export type PartnerList = { partners: AdminPartner[] };
export type WebhookList = {
  webhooks: AdminWebhookRow[];
  rows: Array<{
    id: string;
    payload: unknown;
    errorText: string | null;
    signatureOk: boolean | null;
    processed: boolean | null;
  }>;
};
export type ZoneList = { zones: Zone[] };
export type PromoList = { promos: Promo[] };
export type { Zone, Promo, AdminPartner };
export { PARTNER_IDS, CURRENCY_CODES } from "@crunchrr/shared";

/* ------------------------------------------------------------------ */
/* v2 — analytics, live ops, team, social studio                       */
/* ------------------------------------------------------------------ */

export type Analytics = {
  bestsellers: Array<{ sku: string; name: string; colorway: string; units: number; revenueMinor: number }>;
  vendors: Array<{
    partnerId: string;
    total: number;
    open: number;
    delivered: number;
    rejected: number;
    avgAcceptMins: number | null;
  }>;
  margins: Array<{ sku: string; name: string; colorway: string; units: number; revenueMinor: number; costMinor: number }>;
  byCountry: Array<{ country: string; currency: string; minor: number; count: number }>;
  series30d: Array<{ date: string; minorUsd: number; orders: number }>;
  aovUsd: number;
  revenueUsd30d: number;
};

export type ActivityFeed = {
  feed: Array<{ ts: string; source: string; kind: string; label: string; href: string | null }>;
};

export type TeamAdmin = {
  id: string;
  clerkUserId: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
  createdAt: string;
};

export type AuditRow = {
  id: string;
  clerkUserId: string;
  actorName: string;
  action: string;
  target: string;
  detail: unknown;
  createdAt: string;
};

export type TeamData = { admins: TeamAdmin[]; audit: AuditRow[] };

export type SocialPost = {
  id: string;
  platform: string;
  content: string;
  productSlug: string | null;
  imageUrl: string | null;
  status: string;
  scheduledAt: string | null;
  postedAt: string | null;
  postRef: string | null;
  createdAt: string;
};

export type SocialData = { posts: SocialPost[]; platforms: string[] };
