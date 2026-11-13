/**
 * Type-safe HTTP client for the Crunchrr Next.js frontend.
 *
 * - Server Components import this with the *internal* API base URL.
 * - Client Components use the public base URL (falls back gracefully).
 * - Every response body is Zod-validated before it reaches React, so a
 *   malformed backend payload throws during development instead of
 *   crashing a page with `undefined is not a function`.
 */

import {
  catalogQuerySchema,
  checkoutRequestSchema,
  checkoutResponseSchema,
  healthResponseSchema,
  productDetailResponseSchema,
  productListResponseSchema,
  type CheckoutRequest,
  type Product,
} from "./schemas/index.ts";
import { z } from "zod";

/* ------------------------------------------------------------------ */
/* Configuration                                                       */
/* ------------------------------------------------------------------ */

export function apiBaseUrl(): string {
  // Server side: internal URL (same-host Fastify). Client side: public URL.
  const isServer =
    typeof process !== "undefined" &&
    typeof process.versions === "object" &&
    process.versions !== null &&
    typeof process.versions.node === "string";
  if (isServer) {
    return (
      process.env.API_INTERNAL_URL ??
      process.env.NEXT_PUBLIC_API_URL ??
      "http://localhost:4001"
    );
  }
  // Browser: injected at build time by Next.js.
  const publicUrl =
    typeof process !== "undefined" ? process.env.NEXT_PUBLIC_API_URL : undefined;
  return publicUrl ?? "http://localhost:4001";
}

export class ApiRequestError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export class ApiResponseValidationError extends Error {
  readonly url: string;
  readonly issue: z.ZodError["issues"];

  constructor(url: string, issue: z.ZodError["issues"]) {
    super(
      `API response failed schema validation for ${url}: ${issue
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ")}`,
    );
    this.name = "ApiResponseValidationError";
    this.url = url;
    this.issue = issue;
  }
}

/* ------------------------------------------------------------------ */
/* Core fetcher                                                        */
/* ------------------------------------------------------------------ */

type RequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  revalidate?: number | false;
  tags?: string[];
  signal?: AbortSignal;
  /** Bearer token (Clerk JWT) for authenticated endpoints. */
  authToken?: string;
};

async function request<TSchema extends z.ZodTypeAny>(
  path: string,
  schema: TSchema,
  options: RequestOptions = {},
): Promise<z.output<TSchema>> {  const base = apiBaseUrl().replace(/\/+$/, "");
  const url = `${base}${path.startsWith("/") ? path : `/${path}`}`;

  const headers: Record<string, string> = { Accept: "application/json" };
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (options.authToken) headers.Authorization = `Bearer ${options.authToken}`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: options.method ?? (options.body !== undefined ? "POST" : "GET"),
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: options.signal,
      // Next.js data cache tuning for SEO-sensitive catalog pages.
      ...(typeof options.revalidate !== "undefined"
        ? { next: { revalidate: options.revalidate, tags: options.tags } }
        : {}),
      cache: options.revalidate === false ? "no-store" : undefined,
    } as RequestInit);
  } catch (err) {
    throw new ApiRequestError(
      0,
      "NETWORK_ERROR",
      `Could not reach Crunchrr API at ${url}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const rawText = await res.text().catch(() => "");
  let rawJson: unknown = undefined;
  if (rawText.length > 0) {
    try {
      rawJson = JSON.parse(rawText);
    } catch {
      // Non-JSON error page — surface as opaque server error.
      if (!res.ok) {
        throw new ApiRequestError(res.status, "UPSTREAM_ERROR", `API returned non-JSON response (${res.status}) for ${path}`);
      }
      throw new ApiRequestError(res.status, "UPSTREAM_ERROR", `API returned malformed JSON for ${path}`);
    }
  }

  if (!res.ok) {
    const message =
      (typeof rawJson === "object" && rawJson !== null && "error" in rawJson &&
        typeof (rawJson as { error?: { message?: unknown } }).error?.message === "string"
        ? (rawJson as { error: { message: string } }).error.message
        : `Request failed (${res.status})`) ?? `Request failed (${res.status})`;
    const code =
      (typeof rawJson === "object" && rawJson !== null && "error" in rawJson &&
        typeof (rawJson as { error?: { code?: unknown } }).error?.code === "string"
        ? (rawJson as { error: { code: string } }).error.code
        : "HTTP_ERROR") ?? "HTTP_ERROR";
    throw new ApiRequestError(res.status, code, message, rawJson);
  }

  const parsed = schema.safeParse(rawJson);
  if (!parsed.success) {
    throw new ApiResponseValidationError(path, parsed.error.issues);
  }
  return parsed.data;
}

/* ------------------------------------------------------------------ */
/* Endpoint wrappers                                                   */
/* ------------------------------------------------------------------ */

export type CatalogParams = z.input<typeof catalogQuerySchema>;

function catalogQueryToPath(params: CatalogParams = {}): string {
  const qs = new URLSearchParams();
  const entries = Object.entries(params) as Array<[string, unknown]>;
  for (const [key, value] of entries) {
    if (value !== undefined && value !== "" && value !== null) {
      qs.set(key, String(value));
    }
  }
  const suffix = qs.size > 0 ? `?${qs.toString()}` : "";
  return `/api/products${suffix}`;
}

export const api = {
  health() {
    return request("/api/health", healthResponseSchema, { revalidate: 0 });
  },

  listProducts(params: CatalogParams = {}, opts: RequestOptions = {}) {
    return request(
      catalogQueryToPath(params),
      productListResponseSchema,
      { revalidate: 60, tags: ["catalog"], ...opts },
    );
  },

  getProduct(slug: string, opts: RequestOptions = {}) {
    return request(
      `/api/products/${encodeURIComponent(slug)}`,
      productDetailResponseSchema,
      { revalidate: 60, tags: ["catalog", `product:${slug}`], ...opts },
    );
  },

  checkout(payload: CheckoutRequest, opts: RequestOptions = {}) {
    const parsed = checkoutRequestSchema.parse(payload); // fail fast client-side
    return request("/api/orders/checkout", checkoutResponseSchema, {
      method: "POST",
      body: parsed,
      revalidate: false,
      ...opts,
    });
  },

  getOrder(orderId: string, opts: RequestOptions = {}) {
    return request(
      `/api/orders/${encodeURIComponent(orderId)}`,
      z.object({ order: z.unknown() }), // order shape evolves; UI consumes selected fields
      { revalidate: false, ...opts },
    );
  },
};

export type { Product };
