"use client";

/**
 * Admin chrome — dark ops shell with sidebar nav (desktop) / chip rail
 * (mobile) + Clerk account box.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserButton, useSession } from "@clerk/nextjs";
import { createContext, useContext, useMemo, type ReactNode } from "react";
import { adminApi, type AdminApi } from "@/lib/admin-client";

const NAV = [
  { href: "/admin", label: "Overview", icon: "space_dashboard" },
  { href: "/admin/live", label: "Live Ops", icon: "bolt" },
  { href: "/admin/analytics", label: "Analytics", icon: "monitoring" },
  { href: "/admin/orders", label: "Orders", icon: "receipt_long" },
  { href: "/admin/fulfillment", label: "Fulfillment", icon: "local_shipping" },
  { href: "/admin/products", label: "Catalog", icon: "checkroom" },
  { href: "/admin/partners", label: "Partners", icon: "hub" },
  { href: "/admin/zones", label: "Countries", icon: "public" },
  { href: "/admin/promos", label: "Promos", icon: "sell" },
  { href: "/admin/social", label: "Studio", icon: "campaign" },
  { href: "/admin/team", label: "Team", icon: "group" },
  { href: "/admin/webhooks", label: "Webhooks", icon: "webhook" },
] as const;

/* Token context so nested pages share one session token lookup. */
const AdminApiContext = createContext<AdminApi | null>(null);

export function useAdminApi(): AdminApi {
  const api = useContext(AdminApiContext);
  if (!api) throw new Error("useAdminApi outside AdminChrome");
  return api;
}

export function AdminChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { isLoaded, isSignedIn, session } = useSession();
  /* The fetcher resolves the token per request; the memo just keeps a
   * stable identity. Re-memo on sign-in flips so early mounts (before the
   * session is active) don't pin a token-less fetcher. */
  const api = useMemo(
    () => adminApi(() => (session?.getToken() as Promise<string | null>) ?? Promise.resolve(null)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isSignedIn, session],
  );

  const isActive = (href: string) =>
    href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);

  return (
    <div className="flex min-h-screen w-full bg-canvas">
      {/* Sidebar (desktop) */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-white/5 bg-charcoal px-4 py-6 lg:flex">
        <Link href="/admin" className="mb-1 flex items-center gap-2 px-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand font-display text-sm font-bold text-charcoal">
            C
          </span>
          <span className="font-display text-lg font-bold tracking-tight text-canvas">
            crunchrr.
          </span>
          <span className="rounded-full bg-brand/20 px-1.5 py-0.5 font-display text-[9px] font-bold uppercase tracking-wider text-brand">
            Ops
          </span>
        </Link>
        <p className="mb-6 px-2 text-[10px] uppercase tracking-[0.2em] text-canvas/30">
          Control plane
        </p>

        <nav className="flex flex-1 flex-col gap-0.5">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 font-display text-xs font-bold uppercase tracking-wider transition-colors ${
                isActive(item.href)
                  ? "bg-brand/15 text-brand"
                  : "text-canvas/55 hover:bg-white/5 hover:text-canvas"
              }`}
            >
              <span className="material-symbols-outlined text-lg">{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="mt-4 border-t border-white/10 pt-4">
          <Link
            href="/"
            className="mb-3 flex items-center gap-3 rounded-xl px-3 py-2.5 font-display text-xs font-bold uppercase tracking-wider text-canvas/55 transition-colors hover:bg-white/5 hover:text-canvas"
          >
            <span className="material-symbols-outlined text-lg">storefront</span>
            Storefront
          </Link>
          <div className="flex items-center gap-3 px-3">
            <UserButton appearance={{ elements: { avatarBox: "w-8 h-8 rounded-full" } }} />
            <span className="text-[10px] uppercase tracking-wider text-canvas/40">Ops account</span>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top rail */}
        <div className="sticky top-0 z-30 border-b border-white/5 bg-charcoal lg:hidden">
          <div className="flex items-center justify-between px-4 pb-2 pt-3">
            <Link href="/admin" className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-md bg-brand font-display text-xs font-bold text-charcoal">
                C
              </span>
              <span className="font-display text-base font-bold text-canvas">ops.</span>
            </Link>
            <div className="flex items-center gap-3">
              <Link href="/" className="text-[10px] font-bold uppercase tracking-wider text-canvas/50">
                Storefront
              </Link>
              <UserButton appearance={{ elements: { avatarBox: "w-7 h-7 rounded-full" } }} />
            </div>
          </div>
          <div className="flex gap-1 overflow-x-auto px-3 pb-2">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 font-display text-[10px] font-bold uppercase tracking-wider ${
                  isActive(item.href) ? "bg-brand/20 text-brand" : "text-canvas/50"
                }`}
              >
                <span className="material-symbols-outlined text-sm">{item.icon}</span>
                {item.label}
              </Link>
            ))}
          </div>
        </div>

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 lg:px-8 lg:py-8">
          {/* Children mount only after Clerk hydration so their first
              fetch already has a live session token. */}
          {isLoaded && api ? (
            <AdminApiContext.Provider value={api}>{children}</AdminApiContext.Provider>
          ) : (
            <div className="flex items-center justify-center gap-2 py-20 text-xs font-bold uppercase tracking-wider text-charcoal-light">
              <span className="material-symbols-outlined animate-spin text-base">progress_activity</span>
              Unlocking control plane…
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
