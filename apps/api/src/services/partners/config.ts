/**
 * Partner credential resolution — DB row (admin-editable) preferred over
 * env vars. Secrets never leave the API; the admin surface shows hints only.
 */
import { eq } from "drizzle-orm";
import { getDb } from "../../db/client.js";
import { partnerCredentials } from "../../db/schema.js";
import { env } from "../../config/env.js";
import type { PartnerId } from "@crunchrr/shared";

export type PartnerRuntimeConfig = {
  apiBaseUrl: string;
  clientId: string | null;
  clientSecret: string | null;
  /** DB row says the partner is enabled. */
  active: boolean;
  /** True when usable credentials exist (DB or env). */
  configured: boolean;
  source: "db" | "env" | "none";
};

export async function resolvePartnerConfig(partnerId: string): Promise<PartnerRuntimeConfig> {
  const e = env();
  const db = getDb(e.DATABASE_URL);
  const [row] = await db
    .select()
    .from(partnerCredentials)
    .where(eq(partnerCredentials.partnerId, partnerId as PartnerId))
    .limit(1);

  if (!row) {
    // Fall back to env-only config for partners never seeded.
    if (partnerId === "QIKINK") {
      const configured = Boolean(e.QIKINK_CLIENT_ID && e.QIKINK_CLIENT_SECRET);
      return {
        apiBaseUrl: e.QIKINK_API_BASE,
        clientId: e.QIKINK_CLIENT_ID ?? null,
        clientSecret: e.QIKINK_CLIENT_SECRET ?? null,
        active: true,
        configured,
        source: configured ? "env" : "none",
      };
    }
    if (partnerId === "PRINTROVE") {
      const configured = Boolean(e.PRINTROVE_EMAIL && e.PRINTROVE_PASSWORD);
      return {
        apiBaseUrl: e.PRINTROVE_API_BASE,
        clientId: e.PRINTROVE_EMAIL ?? null,
        clientSecret: e.PRINTROVE_PASSWORD ?? null,
        active: true,
        configured,
        source: configured ? "env" : "none",
      };
    }
    return { apiBaseUrl: "", clientId: null, clientSecret: null, active: true, configured: false, source: "none" };
  }

  const envClientId = partnerId === "QIKINK" ? e.QIKINK_CLIENT_ID : e.PRINTROVE_EMAIL;
  const envSecret = partnerId === "QIKINK" ? e.QIKINK_CLIENT_SECRET : e.PRINTROVE_PASSWORD;
  const clientId = row.clientId ?? envClientId ?? null;
  const clientSecret = row.clientSecret ?? envSecret ?? null;

  return {
    apiBaseUrl: row.apiBaseUrl,
    clientId,
    clientSecret,
    active: row.active,
    configured: Boolean(clientId && clientSecret),
    source: row.clientId && row.clientSecret ? "db" : "env",
  };
}

/** Masked hint for admin surfaces — never the secret itself. */
export function maskSecret(secret: string | null): string | null {
  if (!secret) return null;
  if (secret.length <= 4) return "••••";
  return `${secret.slice(0, 2)}••••${secret.slice(-2)}`;
}
