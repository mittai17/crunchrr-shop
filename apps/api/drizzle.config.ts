import { defineConfig } from "drizzle-kit";

/**
 * Drizzle Kit config — reads DATABASE_URL from apps/api/.env
 * Schema lives in src/db/schema.ts (single source of truth).
 */
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
    ssl: "require",
  },
  strict: true,
  verbose: true,
});
