/**
 * Singleton postgres.js pool + Drizzle instance.
 * Neon pooled connections: ssl is mandatory.
 */
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

let _db: ReturnType<typeof makeDb> | null = null;

function makeDb(databaseUrl: string) {
  const client = postgres(databaseUrl, {
    ssl: "require",
    max: 10,
    idle_timeout: 30,
    connect_timeout: 15,
    // Fastify logs query errors; postgres.js would otherwise swallow them.
    onnotice: () => undefined,
  });
  return drizzle(client, { schema, logger: false });
}

/** Get or lazily create the process-wide Drizzle instance. */
export function getDb(databaseUrl: string): ReturnType<typeof makeDb> {
  if (_db === null) {
    if (!databaseUrl) {
      throw new Error("DATABASE_URL is required to create the database client");
    }
    _db = makeDb(databaseUrl);
  }
  return _db;
}

export type Db = ReturnType<typeof getDb>;
export { schema };
