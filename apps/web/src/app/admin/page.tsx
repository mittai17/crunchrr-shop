"use client";

/**
 * Admin overview — KPIs, 7-day USD-equivalent revenue bars, fulfillment
 * pressure, low-stock watchlist.
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import { useAdminApi } from "@/components/admin/chrome";
import { ErrorNote, KpiCard, Spinner, StatusChip } from "@/components/admin/ui";
import { formatMoney, formatUsd } from "@/lib/utils";
import type { Overview } from "@/lib/admin-client";

export default function AdminOverviewPage() {
  const api = useAdminApi();
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api
      .get<Overview>("/api/admin/overview")
      .then(setData)
      .catch((e: Error) => setError(e.message));
  }, [api]);

  if (error) return <ErrorNote message={error} />;
  if (!data) return <Spinner label="Pulling shop metrics" />;

  const maxDay = Math.max(...data.series7d.map((d) => d.minorUsd), 1);
  const revenueLabel = data.revenue
    .map((r) => formatMoney(r.minor, r.currency))
    .join(" + ") || "—";

  return (
    <div className="space-y-6">
      <header>
        <div className="mb-1 flex items-center gap-2">
          <span className="material-symbols-outlined text-lg text-brand">space_dashboard</span>
          <span className="font-display text-[10px] font-bold uppercase tracking-[0.22em] text-charcoal-light">
            Control Plane
          </span>
        </div>
        <h1 className="font-display text-3xl font-bold tracking-tight text-charcoal">
          Shop Overview
        </h1>
      </header>

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <KpiCard icon="paid" label="Revenue" value={revenueLabel} sub="paid orders, all currencies" tone="good" />
        <KpiCard icon="receipt_long" label="Orders 7d" value={data.orders.last7d} sub={`${data.orders.total} all-time`} />
        <KpiCard
          icon="hourglass_top"
          label="Awaiting pay"
          value={data.orders.pendingPayment}
          sub="abandoned checkouts"
          tone={data.orders.pendingPayment > 0 ? "alert" : "default"}
        />
        <KpiCard
          icon="local_shipping"
          label="Fulfillment"
          value={data.orders.fulfilmentQueue}
          sub="open partner splits"
          tone={data.orders.fulfilmentQueue > 0 ? "good" : "default"}
        />
        <KpiCard
          icon="report"
          label="Partner rejects"
          value={data.orders.partnerRejected}
          sub="need re-dispatch"
          tone={data.orders.partnerRejected > 0 ? "alert" : "default"}
        />
        <KpiCard
          icon="webhook"
          label="Webhook fails"
          value={data.webhookFailures24h}
          sub="last 24h"
          tone={data.webhookFailures24h > 0 ? "alert" : "good"}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        {/* 7-day revenue */}
        <section className="rounded-2xl border border-neutral-200/60 bg-white p-5 lg:col-span-3">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-xs font-bold uppercase tracking-[0.16em] text-charcoal">
              Revenue — last 7 days
            </h2>
            <span className="text-[10px] uppercase tracking-wider text-charcoal-light">
              USD-equivalent
            </span>
          </div>
          <div className="flex h-44 items-stretch gap-2">
            {data.series7d.map((d) => (
              <div key={d.date} className="flex h-full flex-1 flex-col items-center gap-1.5">
                <span className="h-4 text-[9px] font-bold text-charcoal-light">
                  {d.minorUsd > 0 ? formatUsd(d.minorUsd) : ""}
                </span>
                <div className="flex w-full flex-1 items-end">
                  <div
                    className="w-full rounded-t-lg bg-gradient-to-t from-brand/70 to-brand"
                    style={{ height: `${Math.max((d.minorUsd / maxDay) * 100, 2)}%` }}
                    title={`${d.date}: ${formatUsd(d.minorUsd)} (${d.orders} orders)`}
                  />
                </div>
                <span className="text-[9px] uppercase text-charcoal-light">
                  {new Date(`${d.date}T00:00:00`).toLocaleDateString(undefined, { weekday: "short" })}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* Low stock */}
        <section className="rounded-2xl border border-neutral-200/60 bg-white p-5 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-xs font-bold uppercase tracking-[0.16em] text-charcoal">
              Low stock watchlist
            </h2>
            <Link
              href="/admin/products"
              className="font-display text-[10px] font-bold uppercase tracking-wider text-brand hover:underline"
            >
              Catalog →
            </Link>
          </div>
          {data.lowStock.length === 0 ? (
            <p className="py-6 text-center text-xs text-charcoal-muted">
              Healthy — no variant at or below 4 units.
            </p>
          ) : (
            <ul className="space-y-2">
              {data.lowStock.map((v) => (
                <li key={v.sku} className="flex items-center justify-between gap-3 text-xs">
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-charcoal">{v.name}</span>
                    <span className="text-[10px] text-charcoal-muted">
                      {v.colorway} · {v.size} · {v.partnerId.toLowerCase()}
                    </span>
                  </span>
                  <StatusChip
                    label={`${v.stock} left`}
                    tone={v.stock === 0 ? "bg-error-container text-error" : "bg-brand/10 text-brand"}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Quick actions */}
      <section className="grid gap-3 sm:grid-cols-3">
        <Link
          href="/admin/fulfillment"
          className="card3d flex items-center gap-3 rounded-2xl border border-neutral-200/60 bg-white p-4 shadow-card"
        >
          <span className="material-symbols-outlined text-xl text-brand">local_shipping</span>
          <div>
            <span className="block font-display text-xs font-bold uppercase tracking-wider text-charcoal">
              Fulfillment queue
            </span>
            <span className="text-[11px] text-charcoal-muted">{data.orders.fulfilmentQueue} splits in flight</span>
          </div>
        </Link>
        <Link
          href="/admin/zones"
          className="card3d flex items-center gap-3 rounded-2xl border border-neutral-200/60 bg-white p-4 shadow-card"
        >
          <span className="material-symbols-outlined text-xl text-brand">public</span>
          <div>
            <span className="block font-display text-xs font-bold uppercase tracking-wider text-charcoal">
              Countries & currency
            </span>
            <span className="text-[11px] text-charcoal-muted">Shipping zones, FX and tax</span>
          </div>
        </Link>
        <Link
          href="/admin/webhooks"
          className="card3d flex items-center gap-3 rounded-2xl border border-neutral-200/60 bg-white p-4 shadow-card"
        >
          <span className="material-symbols-outlined text-xl text-brand">webhook</span>
          <div>
            <span className="block font-display text-xs font-bold uppercase tracking-wider text-charcoal">
              Webhook audit
            </span>
            <span className="text-[11px] text-charcoal-muted">Every delivery, archived</span>
          </div>
        </Link>
      </section>
    </div>
  );
}
