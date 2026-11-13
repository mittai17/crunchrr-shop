/**
 * Centralized env access for the API process.
 * Parsing lives in @crunchrr/shared so the schema stays in one place.
 */
import { loadServerEnv, parseCorsOrigins, isDemoPayments } from "@crunchrr/shared";

let cached: ReturnType<typeof loadServerEnv> | null = null;

export function env(): ReturnType<typeof loadServerEnv> {
  if (cached === null) {
    cached = loadServerEnv();
  }
  return cached;
}

export { parseCorsOrigins, isDemoPayments };
