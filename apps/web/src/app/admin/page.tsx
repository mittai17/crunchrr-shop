"use client";

/**
 * Admin overview — KPIs, 7-day USD-equivalent revenue bars, fulfillment
 * pressure, low-stock watchlist, and a live system-health strip.
 * Polls every 20s (G4) so ops never has to reload to see a stuck split.
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import { useAdminApi } from "@/components/admin/chrome";
import { ErrorNote, KpiCard, Spinner, StatusChip } from "@/components/admin/ui";
import { formatMoney, formatUsd } from "@/lib/utils";
import type { Overview } from "@/lib/admin-client";

type Health = {
  generatedAt: string;
  uptimeSeconds: number;
  memoryMb: { rss: number; heap: number };
  dbOk: boolean;
  orders: { byStatus: Array<{ status: string; count: number }>; last24h: number };
  webhooks: { outcomes24h: Array<{ outcome: string | null; count: number }>; lastReceivedAt: string | null };
  splits: { byStatus: Array<{ status: string; count: number }>; stalePending: number; retryExhausted: number };
  inventory: { skus: number; low: number; out: number };
  workers: Record<string, number>;
};

function uptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export default function AdminOverviewPage() {
  const api = useAdminApi();
  const [data, setData] = useState<Overview | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const load = (): void => {
      void api
        .get<Overview>("/api/admin/overview")
        .then((d) => alive && setData(d))
        .catch((e: Error) => alive && setError(e.message));
      void api
        .get<Health>("/api/admin/metrics")
        .then((m) => alive && setHealth(m))
        .catch(() => undefined);
    };
    load();
    const timer = setInterval(load, 20_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
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

      {/* System health — live, polled every 20s */}
      {health ? (
        <section className="rounded-2xl border border-neutral-200/60 bg-white p-4 shadow-card">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-display text-xs font-bold uppercase tracking-[0.16em] text-charcoal">
              System health
            </h2>
            <span className="flex items-center gap-1.5 font-display text-[10px] font-bold uppercase tracking-wider text-charcoal-light">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-jade" />
              live · 20s · refreshed {new Date(health.generatedAt).toLocaleTimeString()}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-6">
            <HealthChip
              label="Database"
              value={health.dbOk ? "healthy" : "DOWN"}
              tone={health.dbOk ? "good" : "alert"}
            />
            <HealthChip label="API uptime" value={uptime(health.uptimeSeconds)} tone="good" />
            <HealthChip label="Orders 24h" value={String(health.orders.last24h)} />
            <HealthChip
              label="Webhook events 24h"
              value={String(health.webhooks.outcomes24h.reduce((s, o) => s + o.count, 0))}
              tone={health.webhooks.outcomes24h.some((o) => o.outcome === "INVALID_SIGNATURE" || o.outcome === "ERROR") ? "alert" : "good"}
            />
            <HealthChip
              label="Stale splits >10m"
              value={String(health.splits.stalePending)}
              tone={health.splits.stalePending > 0 ? "alert" : "good"}
            />
            <HealthChip
              label="Retry exhausted"
              value={String(health.splits.retryExhausted)}
              tone={health.splits.retryExhausted > 0 ? "alert" : "good"}
            />
          </div>
          <p className="mt-3 font-mono text-[10px] leading-relaxed text-charcoal-light">
            rss {health.memoryMb.rss}mb · heap {health.memoryMb.heap}mb · skus {health.inventory.skus} (low{" "}
            {health.inventory.low}, out {health.inventory.out}) · sweeps {health.workers["worker.retry.sweeps"] ?? 0} ·
            redispatched {health.workers["worker.retry.redispatched"] ?? 0} · social published{" "}
            {health.workers["social.sweep.published"] ?? 0}
          </p>
        </section>
      ) : null}

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
          className="flex items-center gap-3 rounded-2xl border border-neutral-200/60 bg-white p-4 shadow-card"
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
          className="flex items-center gap-3 rounded-2xl border border-neutral-200/60 bg-white p-4 shadow-card"
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
          className="flex items-center gap-3 rounded-2xl border border-neutral-200/60 bg-white p-4 shadow-card"
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

function HealthChip({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "good" | "alert";
}) {
  const toneCls =
    tone === "alert" ? "text-coral" : tone === "good" ? "text-jade" : "text-charcoal";
  return (
    <div className="rounded-xl border border-neutral-100 bg-surface-muted/50 px-3 py-2">
      <p className="font-display text-[9px] font-bold uppercase tracking-wider text-charcoal-light">
        {label}
      </p>
      <p className={`font-display text-sm font-bold ${toneCls}`}>{value}</p>
    </div>
  );
}
