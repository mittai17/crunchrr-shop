"use client";

/**
 * Analytics — vendor scorecards, margin per SKU, revenue by country,
 * bestsellers, USD-equivalent trend. Range switch (7/30/90 days) is
 * server-side so every table reflects the same window.
 */
import { useCallback, useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { useAdminApi } from "@/components/admin/chrome";
import { ErrorNote, Spinner, Td, Th } from "@/components/admin/ui";
import { formatMoney, formatUsd } from "@/lib/utils";
import type { Analytics } from "@/lib/admin-client";

export default function AdminAnalyticsPage() {
  const api = useAdminApi();
  const [data, setData] = useState<Analytics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState<7 | 30 | 90>(30);
  const [loading, setLoading] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    void api
      .get<Analytics>(`/api/admin/analytics?days=${days}`)
      .then(setData)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [api, days]);
  useEffect(() => {
    load();
  }, [load]);

  const maxUsd = Math.max(...(data?.series.map((d) => d.minorUsd) ?? [1]), 1);

  return (
    <div className="space-y-5">
      <header>
        <div className="mb-1 flex items-center gap-2">
          <span className="material-symbols-outlined text-lg text-brand">monitoring</span>
          <span className="font-display text-[10px] font-bold uppercase tracking-[0.22em] text-charcoal-light">
            Business Intelligence
          </span>
        </div>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h1 className="font-display text-3xl font-bold tracking-tight text-charcoal">Analytics</h1>
          <div className="flex items-center gap-1 rounded-full border border-neutral-200 bg-white p-1">
            {([7, 30, 90] as const).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDays(d)}
                className={`rounded-full px-3 py-1 font-display text-[10px] font-bold uppercase tracking-wider transition-colors ${
                  days === d ? "bg-charcoal text-canvas" : "text-charcoal-light hover:bg-surface-muted"
                }`}
              >
                {d}d
              </button>
            ))}
            {loading ? (
              <span className="material-symbols-outlined animate-spin px-1 text-sm text-charcoal-light">
                progress_activity
              </span>
            ) : null}
          </div>
        </div>
      </header>

      {error ? <ErrorNote message={error} /> : null}
      {!data && !error ? <Spinner label="Crunching numbers" /> : null}

      {data ? (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <div className="card3d rounded-2xl border border-neutral-200/60 bg-white p-4 shadow-card">
              <p className="font-display text-[10px] font-bold uppercase tracking-wider text-charcoal-light">
                Revenue · {data.days}d (USD eq.)
              </p>
              <p className="mt-1 font-display text-2xl font-bold text-charcoal">{formatUsd(data.revenueUsd)}</p>
            </div>
            <div className="card3d rounded-2xl border border-neutral-200/60 bg-white p-4 shadow-card">
              <p className="font-display text-[10px] font-bold uppercase tracking-wider text-charcoal-light">Avg order value</p>
              <p className="mt-1 font-display text-2xl font-bold text-charcoal">{formatUsd(data.aovUsd)}</p>
            </div>
            <div className="card3d rounded-2xl border border-neutral-200/60 bg-white p-4 shadow-card">
              <p className="font-display text-[10px] font-bold uppercase tracking-wider text-charcoal-light">Best margin SKU</p>
              <p className="mt-1 truncate font-display text-base font-bold text-charcoal">
                {data.margins[0] ? `${data.margins[0].sku.slice(0, 18)}…` : "—"}
              </p>
              <p className="text-xs text-jade">
                {data.margins[0] ? `+${formatUsd(data.margins[0].revenueMinor - data.margins[0].costMinor)} profit` : ""}
              </p>
            </div>
            <div className="card3d rounded-2xl border border-neutral-200/60 bg-white p-4 shadow-card">
              <p className="font-display text-[10px] font-bold uppercase tracking-wider text-charcoal-light">Top country</p>
              <p className="mt-1 font-display text-2xl font-bold text-charcoal">
                {data.byCountry[0]?.country ?? "—"}
              </p>
              <p className="text-xs text-charcoal-muted">
                {data.byCountry[0] ? `${data.byCountry[0].count} orders` : ""}
              </p>
            </div>
          </div>

          {/* 30-day revenue — true isometric extrusion */}
          <section className="card3d rounded-2xl border border-neutral-200/60 bg-white p-4 shadow-card">
            <h2 className="mb-1 font-display text-xs font-bold uppercase tracking-wider text-charcoal-light">
              Revenue · last {data.days} days (USD-equivalent)
            </h2>
            <p className="mb-2 text-[10px] text-charcoal-light">Hover a column to spotlight that day.</p>
            <div className="iso-stage flex h-64 items-center justify-center overflow-hidden">
              <div className="iso-chart" style={{ width: "78%", height: "58%" }}>
                {data.series.map((d) => {
                  const h = Math.max((d.minorUsd / maxUsd) * 100, d.minorUsd > 0 ? 7 : 2);
                  return (
                    <div
                      key={d.date}
                      className="iso-bar"
                      style={{ "--h": `${h}%` } as CSSProperties}
                      title={`${d.date}: ${formatUsd(d.minorUsd)} · ${d.orders} orders`}
                    />
                  );
                })}
              </div>
            </div>
          </section>

          {/* Vendor scorecards */}
          <section className="card3d overflow-x-auto rounded-2xl border border-neutral-200/60 bg-white shadow-card">
            <table className="w-full min-w-[640px]">
              <thead className="border-b border-neutral-100 bg-surface-muted/60">
                <tr>
                  <Th>Vendor</Th>
                  <Th>Total</Th>
                  <Th>Open</Th>
                  <Th>Delivered</Th>
                  <Th>Rejected</Th>
                  <Th>Avg accept</Th>
                </tr>
              </thead>
              <tbody>
                {data.vendors.length === 0 ? (
                  <tr><td colSpan={6} className="px-3 py-8 text-center text-xs text-charcoal-muted">No splits yet.</td></tr>
                ) : (
                  data.vendors.map((v) => (
                    <tr key={v.partnerId} className="border-b border-neutral-50 last:border-0">
                      <Td className="font-display text-xs font-bold">{v.partnerId}</Td>
                      <Td>{v.total}</Td>
                      <Td>{v.open}</Td>
                      <Td className="text-jade">{v.delivered}</Td>
                      <Td className={v.rejected > 0 ? "text-coral" : ""}>{v.rejected}</Td>
                      <Td>{v.avgAcceptMins === null ? "—" : `${v.avgAcceptMins} min`}</Td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </section>

          <div className="grid gap-4 lg:grid-cols-2">
            {/* Margin per SKU */}
            <section className="card3d overflow-x-auto rounded-2xl border border-neutral-200/60 bg-white shadow-card">
              <h2 className="border-b border-neutral-100 bg-surface-muted/60 px-3 py-2 font-display text-xs font-bold uppercase tracking-wider text-charcoal-light">
                Margin leaderboard (paid units)
              </h2>
              <table className="w-full">
                <thead className="border-b border-neutral-100">
                  <tr><Th>SKU</Th><Th>Units</Th><Th className="text-right">Margin</Th></tr>
                </thead>
                <tbody>
                  {data.margins.length === 0 ? (
                    <tr><td colSpan={6} className="px-3 py-8 text-center text-xs text-charcoal-muted">No paid lines yet.</td></tr>
                  ) : (
                    data.margins.map((m) => {
                      const margin = m.revenueMinor - m.costMinor;
                      const pct = m.revenueMinor > 0 ? Math.round((margin / m.revenueMinor) * 100) : 0;
                      return (
                        <tr key={m.sku} className="border-b border-neutral-50 last:border-0">
                          <Td>
                            <span className="font-display text-xs font-bold">{m.sku}</span>
                            <span className="block text-[10px] text-charcoal-muted">{m.name} · {m.colorway}</span>
                          </Td>
                          <Td>×{m.units}</Td>
                          <Td className="text-right">
                            <span className="font-display text-xs font-bold text-jade">{formatUsd(margin)}</span>
                            <span className="block text-[10px] text-charcoal-muted">{pct}%</span>
                          </Td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </section>

            {/* Bestsellers + countries */}
            <div className="space-y-4">
              <section className="card3d rounded-2xl border border-neutral-200/60 bg-white shadow-card">
                <h2 className="border-b border-neutral-100 bg-surface-muted/60 px-3 py-2 font-display text-xs font-bold uppercase tracking-wider text-charcoal-light">
                  Bestsellers
                </h2>
                <ul className="divide-y divide-neutral-50">
                  {data.bestsellers.length === 0 ? (
                    <li className="px-3 py-4 text-xs text-charcoal-muted">No sales yet.</li>
                  ) : (
                    data.bestsellers.map((b) => (
                      <li key={b.sku} className="flex items-center justify-between px-3 py-2">
                        <div className="min-w-0">
                          <p className="truncate font-display text-xs font-bold text-charcoal">{b.name}</p>
                          <p className="text-[10px] text-charcoal-muted">{b.colorway} · {b.sku}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-display text-xs font-bold text-charcoal">×{b.units}</p>
                          <p className="text-[10px] text-charcoal-muted">{formatUsd(b.revenueMinor)}</p>
                        </div>
                      </li>
                    ))
                  )}
                </ul>
              </section>

              <section className="card3d rounded-2xl border border-neutral-200/60 bg-white shadow-card">
                <h2 className="border-b border-neutral-100 bg-surface-muted/60 px-3 py-2 font-display text-xs font-bold uppercase tracking-wider text-charcoal-light">
                  Revenue by country
                </h2>
                <ul className="divide-y divide-neutral-50">
                  {data.byCountry.length === 0 ? (
                    <li className="px-3 py-4 text-xs text-charcoal-muted">No paid orders yet.</li>
                  ) : (
                    data.byCountry.map((c) => (
                      <li key={`${c.country}-${c.currency}`} className="flex items-center justify-between px-3 py-2">
                        <span className="font-display text-xs font-bold text-charcoal">{c.country}</span>
                        <span className="text-xs text-charcoal-muted">
                          {c.count} orders · {formatMoney(c.minor, c.currency)}
                        </span>
                      </li>
                    ))
                  )}
                </ul>
              </section>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
