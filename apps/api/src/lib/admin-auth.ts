/**
 * Admin auth guard — allowlisted Clerk user ids; dev bypass for solo QA.
 */
import type { FastifyRequest } from "fastify";
import { env } from "../config/env.js";
import { verifyClerkToken } from "./auth.js";
import { AppError } from "./errors.js";

export async function requireAdmin(req: FastifyRequest): Promise<string> {
  const e = env();
  let userId: string | null = null;
  try {
    const auth = await verifyClerkToken(req);
    userId = auth?.userId ?? null;
  } catch {
    userId = null;
  }

  const allowlist = e.ADMIN_CLERK_USER_IDS.split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const devBypass = e.NODE_ENV !== "production" && e.ADMIN_DEV_BYPASS;

  if (!userId) {
    throw new AppError(401, "UNAUTHENTICATED", "Sign in to use the admin panel.");
  }
  if (!allowlist.includes(userId) && !devBypass) {
    throw new AppError(403, "FORBIDDEN", "Admin access required.");
  }
  return userId;
}
