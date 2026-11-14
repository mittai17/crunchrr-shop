/**
 * Admin auth guard + RBAC + audit helper.
 *
 * Layer 1: Clerk token → userId (fail closed 401).
 * Layer 2: admin_users row → role (auto-bootstrap OWNER from the env
 *          allowlist so the first solo admin never has to seed manually).
 * Layer 3: role ∈ required roles (OWNER ⊃ OPS ⊃ SUPPORT).
 *
 * Roles: OWNER — everything · OPS — fulfillment + catalog + refunds ·
 * SUPPORT — read-only + webhook inspection.
 */
import type { FastifyRequest } from "fastify";
import { eq } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { adminActions, adminUsers } from "../db/schema.js";
import { env } from "../config/env.js";
import { verifyClerkToken } from "./auth.js";
import { AppError } from "./errors.js";

export type AdminRole = "OWNER" | "OPS" | "SUPPORT";
export type AdminIdentity = { userId: string; role: AdminRole; name: string };

const ROLE_RANK: Record<AdminRole, number> = { SUPPORT: 1, OPS: 2, OWNER: 3 };

export async function requireAdmin(
  req: FastifyRequest,
  minRoles?: AdminRole[],
): Promise<AdminIdentity> {
  const e = env();
  let userId: string | null = null;
  try {
    const auth = await verifyClerkToken(req);
    userId = auth?.userId ?? null;
  } catch {
    userId = null;
  }

  if (!userId) {
    throw new AppError(401, "UNAUTHENTICATED", "Sign in to use the admin panel.");
  }

  const db = getDb(e.DATABASE_URL);
  const allowlist = e.ADMIN_CLERK_USER_IDS.split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const devBypass = e.NODE_ENV !== "production" && e.ADMIN_DEV_BYPASS;

  if (!allowlist.includes(userId) && !devBypass) {
    throw new AppError(403, "FORBIDDEN", "Admin access required.");
  }

  let [row] = await db.select().from(adminUsers).where(eq(adminUsers.clerkUserId, userId)).limit(1);

  // Bootstrap: an allowlisted user without a team row becomes OWNER once.
  if (!row && allowlist.includes(userId)) {
    const inserted = await db
      .insert(adminUsers)
      .values({
        clerkUserId: userId,
        name: "Owner",
        email: "owner@crunchrr.dev",
        role: "OWNER",
      })
      .onConflictDoNothing()
      .returning();
    row = inserted[0];
  }

  const role: AdminRole = (row?.role as AdminRole) ?? (devBypass ? "OWNER" : "OPS");
  const name = row?.name ?? (devBypass ? "Dev Admin" : "Admin");

  if (minRoles && minRoles.length > 0) {
    const ok = minRoles.some((r) => ROLE_RANK[role] >= ROLE_RANK[r]);
    if (!ok) {
      throw new AppError(403, "FORBIDDEN_ROLE", `Requires ${minRoles.join(" or ")} role.`);
    }
  }

  return { userId, role, name };
}

/** Append an admin action to the audit trail. Never throws into the route. */
export async function logAdminAction(
  identity: AdminIdentity,
  action: string,
  target: string,
  detail?: unknown,
): Promise<void> {
  try {
    const db = getDb(env().DATABASE_URL);
    await db.insert(adminActions).values({
      clerkUserId: identity.userId,
      actorName: identity.name,
      action,
      target,
      detail: detail ?? null,
    });
  } catch {
    // audit failure must never break the admin write itself
  }
}
