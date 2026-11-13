/**
 * Clerk JWT verification for the Fastify API.
 * Uses @clerk/backend's verifyToken — no network call per request
 * (JWKS cached by the SDK), so p99 stays fast.
 */
import type { FastifyRequest } from "fastify";
import { verifyToken, type VerifyTokenOptions } from "@clerk/backend";
import { env } from "../config/env.js";
import { AuthError } from "./errors.js";

export type ClerkAuth = { userId: string; sessionId?: string };

export async function verifyClerkToken(req: FastifyRequest): Promise<ClerkAuth | null> {
  const secretKey = env().CLERK_SECRET_KEY;
  if (!secretKey) return null; // Clerk not configured → auth disabled

  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return null;

  const token = header.slice("Bearer ".length).trim();
  if (token.length < 20) return null;

  try {
    const options: VerifyTokenOptions = { secretKey };
    const payload = await verifyToken(token, options);
    if (!payload.sub) return null;
    return { userId: payload.sub, sessionId: payload.sid };
  } catch {
    throw new AuthError("Invalid Clerk session token");
  }
}
