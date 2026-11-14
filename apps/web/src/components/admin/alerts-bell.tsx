"use client";

/**
 * Admin alerts bell — polls the gated metrics snapshot every 30s and
 * surfaces the things a solo operator must not miss: stuck splits,
 * exhausted retries, bad webhook signatures, stock-outs, low stock.
 * Alerts are derived from GET /api/admin/metrics (no extra endpoints).
 */
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useAdminApi } from "./api-context";

type Health = {
  webhooks: { outcomes24h: Array<{ outcome: string | null; count: number }> };
  splits: { stalePending: number; retryExhausted: number };
  inventory: { skus: number; low: number; out: number };
};

type Alert = { id: string; label: string; count: number; href: string; tone: "alert" | "warn" };

function deriveAlerts(h: Health): Alert[] {
  const alerts: Alert[] = [];
  const badWebhooks = h.webhooks.outcomes24h
    .filter((o) => o.outcome === "INVALID_SIGNATURE" || o.outcome === "ERROR")
    .reduce((s, o) => s + o.count, 0);

  if (badWebhooks > 0) {
    alerts.push({
      id: "webhook",
      label: `${badWebhooks} webhook failure${badWebhooks === 1 ? "" : "s"} (24h)`,
      count: badWebhooks,
      href: "/admin/webhooks",
      tone: "alert",
    });
  }
  if (h.splits.retryExhausted > 0) {
    alerts.push({
      id: "retry",
      label: `${h.splits.retryExhausted} split${h.splits.retryExhausted === 1 ? "" : "s"} out of retries`,
      count: h.splits.retryExhausted,
      href: "/admin/fulfillment",
      tone: "alert",
    });
  }
  if (h.splits.stalePending > 0) {
    alerts.push({
      id: "stale",
      label: `${h.splits.stalePending} split${h.splits.stalePending === 1 ? "" : "s"} stuck >10m`,
      count: h.splits.stalePending,
      href: "/admin/fulfillment",
      tone: "warn",
    });
  }
  if (h.inventory.out > 0) {
    alerts.push({
      id: "out",
      label: `${h.inventory.out} SKU${h.inventory.out === 1 ? "" : "s"} out of stock`,
      count: h.inventory.out,
      href: "/admin/inventory",
      tone: "alert",
    });
  }
  if (h.inventory.low > 0) {
    alerts.push({
      id: "low",
      label: `${h.inventory.low} SKU${h.inventory.low === 1 ? "" : "s"} low on stock (≤5)`,
      count: h.inventory.low,
      href: "/admin/inventory",
      tone: "warn",
    });
  }
  return alerts;
}

export function AlertsBell() {
  const api = useAdminApi();
  const [alerts, setAlerts] = useState<Alert[] | null>(null);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let alive = true;
    const load = (): void => {
      void api
        .get<Health>("/api/admin/metrics")
        .then((h) => alive && setAlerts(deriveAlerts(h)))
        .catch(() => undefined);
    };
    load();
    const timer = setInterval(load, 30_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [api]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent): void => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const urgent = (alerts ?? []).filter((a) => a.tone === "alert").reduce((s, a) => s + a.count, 0);
  const total = (alerts ?? []).length;

  return (
    <div className="relative" ref={boxRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Operations alerts"
        title="Operations alerts"
        className="relative flex h-9 w-9 items-center justify-center rounded-xl text-canvas/60 transition-colors hover:bg-white/5 hover:text-canvas"
      >
        <span className="material-symbols-outlined text-lg">notifications</span>
        {urgent > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-coral px-1 font-display text-[9px] font-bold text-white">
            {urgent > 99 ? "99+" : urgent}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute left-0 top-11 z-50 w-72 overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-neutral-100 bg-surface-muted/60 px-3 py-2">
            <span className="font-display text-[10px] font-bold uppercase tracking-wider text-charcoal-light">
              Operations alerts
            </span>
            <span className="font-mono text-[9px] text-charcoal-light">30s poll</span>
          </div>
          {alerts === null ? (
            <p className="px-3 py-4 text-[11px] text-charcoal-muted">Checking the control plane…</p>
          ) : total === 0 ? (
            <div className="flex items-center gap-2 px-3 py-4 text-[11px] font-bold text-jade">
              <span className="material-symbols-outlined text-base">verified</span>
              All clear — nothing needs you.
            </div>
          ) : (
            <ul className="divide-y divide-neutral-50">
              {alerts.map((a) => (
                <li key={a.id}>
                  <Link
                    href={a.href}
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-2 px-3 py-2.5 transition-colors hover:bg-surface-muted/60"
                  >
                    <span
                      className={`h-1.5 w-1.5 shrink-0 rounded-full ${a.tone === "alert" ? "bg-coral" : "bg-amber-400"}`}
                    />
                    <span className="flex-1 text-[11px] font-medium text-charcoal">{a.label}</span>
                    <span className="material-symbols-outlined text-xs text-charcoal-light">chevron_right</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <div className="border-t border-neutral-100 px-3 py-2">
            <Link
              href="/admin"
              onClick={() => setOpen(false)}
              className="font-display text-[9px] font-bold uppercase tracking-wider text-charcoal-light hover:text-brand"
            >
              Open overview health strip →
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
