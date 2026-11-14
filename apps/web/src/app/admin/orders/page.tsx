"use client";

/**
 * Orders — searchable, status-filtered table. Row click → detail.
 */
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useAdminApi } from "@/components/admin/chrome";
import { AdminButton, ErrorNote, Spinner, StatusChip, Td, Th } from "@/components/admin/ui";
import { formatMoney } from "@/lib/utils";
import type { AdminOrderList } from "@/lib/admin-client";

const STATUS_TABS = [
  "ALL",
  "PENDING_PAYMENT",
  "PAYMENT_CONFIRMED",
  "PARTNER_DISPATCHED",
  "SHIPPED",
  "DELIVERED",
  "CANCELLED",
  "REFUNDED",
  "FAILED",
] as const;

export default function AdminOrdersPage() {
  const api = useAdminApi();
  const [data, setData] = useState<AdminOrderList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("ALL");
  const [q, setQ] = useState("");

  const load = useCallback(() => {
    setData(null);
    const params = new URLSearchParams();
    if (status !== "ALL") params.set("status", status);
    if (q.trim()) params.set("q", q.trim());
    void api
      .get<AdminOrderList>(`/api/admin/orders?${params}`)
      .then(setData)
      .catch((e: Error) => setError(e.message));
  }, [api, status, q]);

  useEffect(() => {
    const t = setTimeout(load, q ? 250 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <span className="material-symbols-outlined text-lg text-brand">receipt_long</span>
            <span className="font-display text-[10px] font-bold uppercase tracking-[0.22em] text-charcoal-light">
              Sales
            </span>
          </div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-charcoal">Orders</h1>
        </div>
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-base text-charcoal-light">search</span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Order number or email…"
            className="w-52 rounded-xl border border-neutral-200/80 bg-white px-3 py-2 text-sm outline-none focus:border-charcoal/40"
          />
        </div>
      </header>

      {/* Status tabs */}
      <div className="flex flex-wrap gap-1.5">
        {STATUS_TABS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatus(s)}
            className={`rounded-full px-3 py-1.5 font-display text-[10px] font-bold uppercase tracking-wider transition-colors ${
              status === s ? "bg-charcoal text-canvas" : "bg-white text-charcoal-muted hover:text-charcoal"
            } border border-neutral-200/60`}
          >
            {s === "ALL" ? "All" : s.replace(/_/g, " ").toLowerCase()}
          </button>
        ))}
      </div>

      {error ? <ErrorNote message={error} /> : null}
      {!data && !error ? <Spinner label="Loading orders" /> : null}

      {data ? (
        <div className="overflow-hidden rounded-2xl border border-neutral-200/60 bg-white">
          <table className="w-full">
            <thead className="border-b border-neutral-100 bg-surface-muted/60">
              <tr>
                <Th>Order</Th>
                <Th>Customer</Th>
                <Th>Status</Th>
                <Th>Vendors</Th>
                <Th className="text-right">Total</Th>
                <Th className="text-right">Placed</Th>
              </tr>
            </thead>
            <tbody>
              {data.orders.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-10 text-center text-xs text-charcoal-muted">
                    No orders match this filter.
                  </td>
                </tr>
              ) : (
                data.orders.map((o) => (
                  <tr key={o.id} className="border-b border-neutral-50 last:border-0 hover:bg-surface-muted/40">
                    <Td>
                      <Link
                        href={`/admin/orders/${o.id}`}
                        className="font-display text-xs font-bold text-charcoal hover:text-brand"
                      >
                        {o.orderNumber}
                      </Link>
                    </Td>
                    <Td>
                      <span className="block max-w-44 truncate text-xs text-charcoal">{o.email}</span>
                    </Td>
                    <Td>
                      <StatusChip label={o.status} />
                    </Td>
                    <Td>
                      <span className="text-[10px] uppercase tracking-wider text-charcoal-muted">
                        {o.partnerIds.join(" · ") || "—"}
                      </span>
                    </Td>
                    <Td className="text-right font-display text-xs font-bold text-charcoal">
                      {formatMoney(o.grandTotalMinor, o.currency)}
                      <span className="ml-1 font-normal text-charcoal-light">×{o.itemCount}</span>
                    </Td>
                    <Td className="text-right text-[11px] text-charcoal-muted">
                      {new Date(o.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                    </Td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
