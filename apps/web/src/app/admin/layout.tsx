import type { ReactNode } from "react";
import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { AdminChrome } from "@/components/admin/chrome";

/**
 * Admin gate + shell. Authorization here is the same rule the API enforces:
 * ADMIN_CLERK_USER_IDS allowlist, with an explicit dev bypass outside prod.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const { userId } = await auth();
  const allowlist = (process.env.ADMIN_CLERK_USER_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const devBypass = process.env.NODE_ENV !== "production" && process.env.ADMIN_DEV_BYPASS === "true";
  const isAdmin = Boolean(userId) && (allowlist.includes(userId as string) || devBypass);

  if (!isAdmin) {
    return (
      <div className="flex min-h-screen w-full flex-col items-center justify-center bg-charcoal px-6 text-center">
        <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-white/5">
          <span className="material-symbols-outlined text-3xl text-brand">lock_person</span>
        </div>
        <h1 className="mb-2 font-display text-2xl font-bold uppercase tracking-tight text-canvas">
          Ops Access Required
        </h1>
        <p className="mb-8 max-w-sm text-sm leading-relaxed text-canvas/60">
          {userId
            ? "This account isn't on the Crunchrr ops allowlist. Ask an owner to add your user id to ADMIN_CLERK_USER_IDS."
            : "Sign in with an ops account to reach the Crunchrr control plane."}
        </p>
        <div className="flex items-center gap-4">
          <Link
            href="/sign-in"
            className="flex h-11 items-center rounded-full bg-brand px-6 font-display text-xs font-bold uppercase tracking-wider text-white transition-colors hover:bg-brand-dark"
          >
            Sign In
          </Link>
          <Link
            href="/"
            className="flex h-11 items-center rounded-full border border-white/20 px-6 font-display text-xs font-bold uppercase tracking-wider text-canvas/80 transition-colors hover:border-white/50 hover:text-canvas"
          >
            Back to Store
          </Link>
        </div>
      </div>
    );
  }

  return <AdminChrome>{children}</AdminChrome>;
}
