import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

/**
 * Crunchrr middleware — Clerk session wiring plus light security headers.
 * No routes are hard-gated: checkout is guest-allowed by design.
 */
export default clerkMiddleware(async (auth, req) => {
  const res = NextResponse.next();
  res.headers.set("x-crunchrr-protected", "clerk");
  // Example of gating later: await auth.protect() for member-only pages.
  void auth;
  return res;
});

export const config = {
  matcher: [
    // Skip Next internals + static assets.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
