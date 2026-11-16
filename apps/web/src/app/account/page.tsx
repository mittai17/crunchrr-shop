"use client";

/**
 * Account screen — Clerk identity + order history for the signed-in user.
 * Orders come from GET /api/orders (Clerk-token authenticated).
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth, useSession, useUser } from "@clerk/nextjs";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { cn, formatMoney } from "@/lib/utils";
import type { OrderSummary } from "@crunchrr/shared";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4001";

const STATUS_CHIP: Record<string, string> = {
  PENDING_PAYMENT: "bg-surface-muted text-charcoal-muted",
  PAYMENT_CONFIRMED: "bg-jade-tint text-jade-deep",
  PARTNER_DISPATCHED: "bg-jade-tint text-jade-deep",
  SHIPPED: "bg-jade-tint text-jade-deep",
  DELIVERED: "bg-jade-deep text-white",
  CANCELLED: "bg-error-container text-error",
  REFUNDED: "bg-error-container text-error",
  FAILED: "bg-error-container text-error",
};

function OrderRow({ order }: { order: OrderSummary }) {
  return (
    <Link
      href={`/track?order=${encodeURIComponent(order.orderNumber)}`}
      className="group flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-neutral-200/60 bg-white px-5 py-4 shadow-card transition-colors hover:border-charcoal/20"
    >
      <div className="min-w-0">
        <div className="mb-1 flex items-center gap-2">
          <span className="font-display text-sm font-bold tracking-tight text-charcoal">
            {order.orderNumber}
          </span>
          <span
            className={cn(
              "rounded-full px-2 py-0.5 font-display text-[10px] font-bold uppercase tracking-wider",
              STATUS_CHIP[order.status] ?? "bg-surface-muted text-charcoal-muted",
            )}
          >
            {order.status.replace(/_/g, " ").toLowerCase()}
          </span>
        </div>
        <span className="block truncate text-xs text-charcoal-muted">
          {order.previewLine}
          {order.itemCount > 1 ? ` +${order.itemCount - 1} more` : ""}
        </span>
        <span className="block text-[10px] text-charcoal-muted">
          {new Date(order.createdAt).toLocaleDateString(undefined, {
            year: "numeric",
            month: "short",
            day: "numeric",
          })}
        </span>
      </div>
      <div className="flex items-center gap-3">
        <span className="font-display text-base font-bold text-charcoal">
          {formatMoney(order.grandTotalMinor, order.currency)}
        </span>
        <span className="material-symbols-outlined text-lg text-charcoal-muted transition-colors group-hover:text-brand">
          arrow_forward
        </span>
      </div>
    </Link>
  );
}

export default function AccountPage() {
  const { user } = useUser();
  const { isSignedIn } = useAuth();
  const { session } = useSession();
  const [orders, setOrders] = useState<OrderSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!session) return;
    void (async () => {
      try {
        const token = await session.getToken();
        if (!token || cancelled) return;
        const res = await fetch(`${API}/api/orders`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const json = (await res.json()) as {
          orders?: OrderSummary[];
          error?: { message: string };
        };
        if (cancelled) return;
        if (!res.ok) {
          setError(json.error?.message ?? "Could not load orders.");
          return;
        }
        setOrders(json.orders ?? []);
      } catch {
        if (!cancelled) setError("Could not reach the vault API.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session]);

  return (
    <div className="flex min-h-screen w-full flex-col bg-canvas">
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-12 lg:px-12">
        <div className="mb-8">
          <div className="mb-2 flex items-center gap-2">
            <span className="material-symbols-outlined text-xl text-brand">account_circle</span>
            <span className="font-display text-[11px] font-bold uppercase tracking-[0.22em] text-charcoal-muted">
              Collector Hub
            </span>
          </div>
          <h1 className="font-display text-4xl font-bold uppercase tracking-tight text-charcoal md:text-5xl">
            Account
          </h1>
        </div>

        {/* Signed out */}
        {!isSignedIn ? (
          <>
          <div className="flex flex-col items-center rounded-3xl border border-dashed border-neutral-300/70 bg-white/60 px-6 py-20 text-center">
            <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-surface-muted">
              <span className="material-symbols-outlined text-4xl text-charcoal-light">
                lock_person
              </span>
            </div>
            <h2 className="mb-2 font-display text-2xl font-bold uppercase text-charcoal">
              Members only
            </h2>
            <p className="mb-8 max-w-sm text-sm text-charcoal-muted">
              Sign in to sync your orders, allocations and saved pieces across the
              vault. Guest orders can still be tracked by number.
            </p>
            <div className="flex items-center gap-4">
              <Link href="/sign-in" className="btn-pill-coral">
                Sign In
              </Link>
              <Link href="/track" className="btn-pill-ghost">
                Track by Number
              </Link>
            </div>
          </div>
          </>
        ) : null}

        {/* Signed in */}
        {isSignedIn ? (
          <>
          <div className="mb-6 flex flex-wrap items-center gap-4 rounded-3xl border border-neutral-200/70 bg-white p-6 shadow-card">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand font-display text-xl font-bold text-white">
              {user?.firstName?.[0]?.toUpperCase() ??
                user?.emailAddresses[0]?.emailAddress[0]?.toUpperCase() ??
                "C"}
            </div>
            <div className="min-w-0 flex-1">
              <span className="block font-display text-lg font-bold text-charcoal">
                {user?.fullName ?? user?.username ?? "Collector"}
              </span>
              <span className="block truncate text-xs text-charcoal-muted">
                {user?.primaryEmailAddress?.emailAddress ??
                  user?.emailAddresses[0]?.emailAddress ??
                  ""}
              </span>
            </div>
            <Link
              href="/wishlist"
              className="flex items-center gap-2 rounded-full border border-neutral-200/80 px-4 py-2 font-display text-[11px] font-bold uppercase tracking-wider text-charcoal-muted transition-colors hover:border-brand hover:text-brand"
            >
              <span className="material-symbols-outlined text-base">favorite</span>
              Wishlist
            </Link>
          </div>

          {/* Order feed */}
          <div className="mb-4 flex items-center justify-between">
            <span className="font-display text-[11px] font-bold uppercase tracking-[0.2em] text-charcoal-muted">
              Your Orders
            </span>
            <Link
              href="/track"
              className="inline-flex items-center gap-1 font-display text-[10px] font-bold uppercase tracking-wider text-brand hover:underline"
            >
              Track by number
              <span className="material-symbols-outlined text-sm">arrow_forward</span>
            </Link>
          </div>

          {error ? (
            <div className="flex items-center gap-3 rounded-2xl border border-error/20 bg-error-container px-5 py-4">
              <span className="material-symbols-outlined text-xl text-error">error</span>
              <p className="text-sm font-medium text-error">{error}</p>
            </div>
          ) : null}

          {orders === null && !error ? (
            <div className="flex items-center justify-center gap-2 rounded-2xl bg-white px-6 py-12 text-xs font-bold uppercase tracking-wider text-charcoal-muted shadow-card">
              <span className="material-symbols-outlined animate-spin text-base">
                progress_activity
              </span>
              Pulling allocations…
            </div>
          ) : null}

          {orders !== null && orders.length === 0 ? (
            <div className="flex flex-col items-center rounded-2xl bg-white px-6 py-14 text-center shadow-card">
              <span className="material-symbols-outlined mb-3 text-3xl text-charcoal-light">
                receipt_long
              </span>
              <p className="mb-1 font-display text-sm font-bold text-charcoal">
                No orders yet
              </p>
              <p className="mb-6 max-w-xs text-xs text-charcoal-muted">
                Guest orders placed before sign-in are tracked by number, not
                linked to the account.
              </p>
              <Link href="/shop" className="btn-pill-ghost">
                Start Collecting
              </Link>
            </div>
          ) : null}

          {orders !== null && orders.length > 0 ? (
            <div className="space-y-3">
              {orders.map((o) => (
                <OrderRow key={o.id} order={o} />
              ))}
            </div>
          ) : null}
          </>
        ) : null}
      </main>
      <SiteFooter />
    </div>
  );
}
