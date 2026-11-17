"use client";

/**
 * Order tracking — lookup by the human-readable order number.
 * Shows live status timeline, items, totals, and partner split routing.
 */
import { useCallback, useEffect, useState } from "react";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { cn, formatMoney } from "@/lib/utils";
import type { OrderResponse } from "@crunchrr/shared";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4001";

const TIMELINE: Array<{ key: string; label: string; hint: string }> = [
  { key: "PENDING_PAYMENT", label: "Placed", hint: "Awaiting payment capture" },
  { key: "PAYMENT_CONFIRMED", label: "Paid", hint: "Funds captured — batch locked" },
  { key: "PARTNER_DISPATCHED", label: "Routed", hint: "Sent to print & pack partner" },
  { key: "SHIPPED", label: "Shipped", hint: "Handed to the carrier" },
  { key: "DELIVERED", label: "Delivered", hint: "At your door" },
];

const TERMINAL_STATES: Record<string, { tone: string; label: string; note: string }> = {
  CANCELLED: {
    tone: "bg-error-container text-error",
    label: "Cancelled",
    note: "This order was cancelled and any captured funds are refunded.",
  },
  REFUNDED: {
    tone: "bg-error-container text-error",
    label: "Refunded",
    note: "Payment has been fully refunded to the original method.",
  },
  FAILED: {
    tone: "bg-error-container text-error",
    label: "Failed",
    note: "Payment failed — no funds were captured. Place the order again.",
  },
};

function stepIndexFor(status: string): number {
  const idx = TIMELINE.findIndex((t) => t.key === status);
  return idx === -1 ? -1 : idx;
}

export default function TrackOrderPage() {
  const [value, setValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [order, setOrder] = useState<OrderResponse | null>(null);

  const lookup = useCallback(async (raw: string) => {
    const num = raw.trim().toUpperCase();
    if (!num) return;
    setLoading(true);
    setError(null);
    setOrder(null);
    try {
      const res = await fetch(`${API}/api/orders/number/${encodeURIComponent(num)}`);
      const json = (await res.json()) as { order?: OrderResponse; error?: { message: string } };
      if (!res.ok || !json.order) {
        setError(json.error?.message ?? "Order not found. Check the number and try again.");
        return;
      }
      setOrder(json.order);
    } catch {
      setError("Could not reach the vault API. Try again in a moment.");
    } finally {
      setLoading(false);
    }
  }, []);

  /* Prefill from /track?order=CR-XXXX (success screen links here). */
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("order");
    if (q) {
      setValue(q);
      void lookup(q);
    }
  }, [lookup]);

  const activeIdx = order ? stepIndexFor(order.status) : -1;
  const terminal = order ? TERMINAL_STATES[order.status] ?? null : null;

  return (
    <div className="flex min-h-screen w-full flex-col bg-canvas">
      <SiteHeader />
      <main className="flex-1 py-12 lg:py-16">
        <div className="mx-auto w-full max-w-7xl px-6 lg:px-12">
          <div className="mx-auto max-w-3xl">
        {/* Header */}
        <div className="mb-8">
          <div className="mb-2 flex items-center gap-2">
            <span className="material-symbols-outlined text-xl text-brand">local_shipping</span>
            <span className="font-display text-[11px] font-bold uppercase tracking-[0.22em] text-charcoal-muted">
              Order Radar
            </span>
          </div>
          <h1 className="font-display text-4xl font-bold uppercase tracking-tight text-charcoal md:text-5xl">
            Track Your Order
          </h1>
          <p className="mt-2 max-w-lg text-sm text-charcoal-muted">
            Enter the order number from your confirmation —{" "}
            <span className="font-display font-bold text-charcoal">CR-DACD4Y-EHUT</span>{" "}
            (example format).
          </p>
        </div>

        {/* Lookup form */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void lookup(value);
          }}
          className="mb-8 flex flex-col gap-3 sm:flex-row"
        >
          <div className="relative flex-1">
            <span className="material-symbols-outlined pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-lg text-charcoal-light">
              receipt_long
            </span>
            <input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="CR-XXXXXX-XXXX"
              aria-label="Order number"
              className="w-full rounded-full border border-neutral-200/80 bg-white py-3.5 pl-11 pr-4 font-display text-sm font-bold uppercase tracking-wider text-charcoal shadow-sm outline-none transition-colors placeholder:font-normal placeholder:tracking-normal placeholder:text-charcoal-light focus:border-charcoal/40"
            />
          </div>
          <button
            type="submit"
            disabled={loading || !value.trim()}
            className="flex h-[50px] items-center justify-center gap-2 rounded-full bg-charcoal px-8 font-display text-xs font-bold uppercase tracking-wider text-canvas transition-all hover:bg-brand active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {loading ? (
              <span className="material-symbols-outlined animate-spin text-base">
                progress_activity
              </span>
            ) : (
              <span className="material-symbols-outlined text-base">radar</span>
            )}
            Track
          </button>
        </form>

        {error ? (
          <div className="mb-8 flex items-center gap-3 rounded-2xl border border-error/20 bg-error-container px-5 py-4">
            <span className="material-symbols-outlined text-xl text-error">error</span>
            <p className="text-sm font-medium text-error">{error}</p>
          </div>
        ) : null}

        {/* Result */}
        {order ? (
          <div className="space-y-6">
            {/* Summary card */}
            <div className="rounded-3xl border border-neutral-200/70 bg-white p-6 shadow-card md:p-8">
              <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
                <div>
                  <span className="mb-1 block font-display text-[10px] font-bold uppercase tracking-[0.2em] text-charcoal-muted">
                    Order
                  </span>
                  <span className="font-display text-2xl font-bold tracking-tight text-charcoal">
                    {order.orderNumber}
                  </span>
                </div>
                <div className="text-right">
                  <span className="mb-1 block font-display text-[10px] font-bold uppercase tracking-[0.2em] text-charcoal-muted">
                    Total
                  </span>
                  <span className="font-display text-2xl font-bold text-charcoal">
                    {formatMoney(order.totals.grandTotalMinor, order.totals.currency)}
                  </span>
                  <span className="block text-[11px] text-charcoal-muted">
                    {new Date(order.createdAt).toLocaleDateString(undefined, {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                </div>
              </div>

              {/* Terminal states (cancelled / refunded / failed) */}
              {terminal ? (
                <div
                  className={cn(
                    "mb-6 flex items-center gap-3 rounded-2xl px-5 py-4",
                    terminal.tone,
                  )}
                >
                  <span className="material-symbols-outlined text-xl">info</span>
                  <div>
                    <span className="block font-display text-xs font-bold uppercase tracking-wider">
                      {terminal.label}
                    </span>
                    <span className="block text-xs opacity-80">{terminal.note}</span>
                  </div>
                </div>
              ) : null}

              {/* Progress timeline */}
              {!terminal ? (
                <ol className="relative flex flex-col gap-0">
                  {TIMELINE.map((step, i) => {
                    const done = activeIdx >= i;
                    const current = activeIdx === i;
                    return (
                      <li key={step.key} className="flex gap-4">
                        <div className="flex flex-col items-center">
                          <span
                            className={cn(
                              "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 font-display text-[10px] font-bold transition-colors",
                              done
                                ? "border-jade-deep bg-jade-deep text-white"
                                : "border-neutral-200 bg-white text-charcoal-light",
                            )}
                          >
                            {done ? (
                              <span className="material-symbols-outlined filled text-sm">
                                check
                              </span>
                            ) : (
                              i + 1
                            )}
                          </span>
                          {i < TIMELINE.length - 1 ? (
                            <span
                              className={cn(
                                "w-0.5 flex-1",
                                activeIdx > i ? "bg-jade-deep" : "bg-neutral-200",
                              )}
                              style={{ minHeight: 22 }}
                            />
                          ) : null}
                        </div>
                        <div className={cn("pb-5", i === TIMELINE.length - 1 && "pb-1")}>
                          <span
                            className={cn(
                              "block font-display text-sm font-bold",
                              done ? "text-charcoal" : "text-charcoal-light",
                            )}
                          >
                            {step.label}
                            {current ? (
                              <span className="ml-2 rounded-full bg-jade-tint px-2 py-0.5 font-display text-[10px] font-bold uppercase tracking-wider text-jade-deep">
                                Current
                              </span>
                            ) : null}
                          </span>
                          <span
                            className={cn(
                              "block text-xs",
                              done ? "text-charcoal-muted" : "text-charcoal-muted/80",
                            )}
                          >
                            {step.hint}
                          </span>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              ) : null}

              {/* Items */}
              <div className="border-t border-neutral-100 pt-5">
                <span className="mb-3 block font-display text-[10px] font-bold uppercase tracking-[0.2em] text-charcoal-muted">
                  Pieces
                </span>
                <ul className="space-y-1.5">
                  {order.splits.flatMap((s) =>
                    s.lines.map((l) => (
                      <li
                        key={l.sku}
                        className="flex items-center justify-between gap-3 text-sm"
                      >
                        <span className="min-w-0 truncate text-charcoal">
                          <span className="font-display font-bold">{l.quantity}×</span>{" "}
                          {l.name}
                        </span>
                        <span className="shrink-0 font-display text-[10px] font-bold uppercase tracking-wider text-charcoal-muted">
                          {l.sku}
                        </span>
                      </li>
                    )),
                  )}
                </ul>
              </div>

              {/* Partner routing */}
              {order.splits.length > 0 ? (
                <div className="border-t border-neutral-100 pt-5">
                  <span className="mb-3 block font-display text-[10px] font-bold uppercase tracking-[0.2em] text-charcoal-muted">
                    Partner Routing
                  </span>
                  <div className="space-y-2">
                    {order.splits.map((s) => (
                      <div
                        key={s.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-surface-muted px-4 py-3"
                      >
                        <span className="font-display text-xs font-bold uppercase text-charcoal">
                          {s.partnerId}
                          {s.partnerOrderId ? (
                            <span className="ml-2 font-normal normal-case text-charcoal-muted">
                              #{s.partnerOrderId}
                            </span>
                          ) : null}
                        </span>
                        <span
                          className={cn(
                            "rounded-full px-2.5 py-1 font-display text-[10px] font-bold uppercase tracking-wider",
                            s.status === "ACCEPTED_BY_PARTNER" ||
                              s.status === "SHIPPED" ||
                              s.status === "DELIVERED"
                              ? "bg-jade-tint text-jade-deep"
                              : s.status === "REJECTED_BY_PARTNER" ||
                                  s.status === "CANCELLED"
                                ? "bg-error-container text-error"
                                : "bg-white text-charcoal-muted",
                          )}
                        >
                          {s.status.replace(/_/g, " ").toLowerCase()}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
