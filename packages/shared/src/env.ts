/**
 * Shared environment parsing — used by the Fastify API at boot.
 * Fails fast with a precise message instead of booting a broken server.
 */
import { z } from "zod";

const boolish = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === "boolean" ? v : ["1", "true", "yes", "on"].includes(v.toLowerCase())));

const serverEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  // HTTP surface
  API_PORT: z.coerce.number().int().min(1).max(65535).default(4001),
  API_HOST: z.string().default("0.0.0.0"),

  // Comma-separated list, e.g. "http://localhost:3000,https://crunchrr.shop"
  CORS_ORIGINS: z.string().default("http://localhost:3000"),

  // Admin panel gate — allowlisted Clerk user ids (comma separated).
  ADMIN_CLERK_USER_IDS: z.string().default(""),
  // Dev convenience: any signed-in user may access admin APIs outside prod.
  ADMIN_DEV_BYPASS: boolish.default(false),

  // Neon Postgres (pooled connection string)
  DATABASE_URL: z
    .string()
    .url({ message: "DATABASE_URL must be a valid Neon Postgres URL" }),

  // Clerk backend verification
  CLERK_SECRET_KEY: z.string().startsWith("sk_").optional(),
  CLERK_PUBLISHABLE_KEY: z.string().startsWith("pk_").optional(),

  // Razorpay
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional(),

  // Cashfree
  CASHFREE_APP_ID: z.string().optional(),
  CASHFREE_SECRET_KEY: z.string().optional(),
  CASHFREE_API_VERSION: z.string().default("2023-08-01"),

  // Partner credentials
  QIKINK_API_BASE: z.string().url().default("https://api.qikink.com"),
  QIKINK_CLIENT_ID: z.string().optional(),
  QIKINK_CLIENT_SECRET: z.string().optional(),
  PRINTROVE_API_BASE: z.string().url().default("https://api.printrove.com"),
  PRINTROVE_EMAIL: z.string().email().optional(),
  PRINTROVE_PASSWORD: z.string().optional(),

  // Behaviour
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  FORCE_DEMO_PAYMENTS: boolish.default(false),

  // FX auto-refresh cadence in hours (0 disables the scheduled job).
  FX_REFRESH_HOURS: z.coerce.number().int().min(0).max(168).default(12),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

/** Parse + freeze process.env. Throws a formatted failure on first bad key. */
export function loadServerEnv(source: NodeJS.ProcessEnv = process.env): ServerEnv {
  const parsed = serverEnvSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid API environment:\n${issues}`);
  }
  return Object.freeze(parsed.data);
}

/** Convenience flag: run the payment bridge in demo mode. */
export function isDemoPayments(env: ServerEnv): boolean {
  if (env.FORCE_DEMO_PAYMENTS) return true;
  return !(
    env.RAZORPAY_KEY_ID &&
    env.RAZORPAY_KEY_SECRET &&
    env.RAZORPAY_WEBHOOK_SECRET
  );
}

export function parseCorsOrigins(raw: string): string[] {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}
