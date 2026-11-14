"use client";

/**
 * Live Ops — merged activity feed (order events + payment webhooks +
 * admin actions), auto-refreshing every 15s. The shop's heartbeat monitor.
 */
import { useCallback, useEffect, useState } from "react";
import { useAdminApi } from "@/components/admin/chrome";
import Link from "next/link";
import { ErrorNote, Spinner, StatusChip } from "@/components/admin/ui";
import type { ActivityFeed } from "@/lib/admin-client";

const SOURCE_STYLE: Record<string, { icon: string; cls: string }> = {
  ORDER: { icon: "receipt_long", cls: "text-brand" },
  WEBHOOK: { icon: "webhook", cls: "text-jade" },
  ADMIN: { icon: "admin_panel_settings", cls: "text-charcoal" },
};

function timeAgo(iso: string): string {
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return new Date(iso).toLocaleDateString();
}

export default function AdminLivePage() {
  const api = useAdminApi();
  const [data, setData] = useState<ActivityFeed | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState(true);
  const [tick, setTick] = useState(0);

  const load = useCallback(() => {
    void api
      .get<ActivityFeed>("/api/admin/activity")
      .then(setData)
      .catch((e: Error) => setError(e.message));
  }, [api]);

  useEffect(() => {
    load();
  }, [load, tick]);

  useEffect(() => {
    if (!live) return;
    const id = setInterval(() => setTick((t) => t + 1), 15_000);
    return () => clearInterval(id);
  }, [live]);

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <span className="material-symbols-outlined text-lg text-brand">bolt</span>
            <span className="font-display text-[10px] font-bold uppercase tracking-[0.22em] text-charcoal-light">
              Heartbeat
            </span>
          </div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-charcoal">Live Ops</h1>
        </div>
        <button
          type="button"
          onClick={() => setLive((v) => !v)}
          className={`flex items-center gap-2 rounded-full border px-4 py-2 font-display text-[10px] font-bold uppercase tracking-wider transition-colors ${
            live ? "border-jade bg-jade/10 text-jade" : "border-neutral-200/60 bg-white text-charcoal-muted"
          }`}
        >
          <span className={`h-2 w-2 rounded-full ${live ? "animate-pulse bg-jade" : "bg-neutral-300"}`} />
          {live ? "Live · 15s" : "Paused"}
        </button>
      </header>

      {error ? <ErrorNote message={error} /> : null}
      {!data && !error ? <Spinner label="Tapping the feed" /> : null}

      {data ? (
        <div className="overflow-hidden rounded-2xl border border-neutral-200/60 bg-white shadow-card">
          {data.feed.length === 0 ? (
            <p className="px-4 py-10 text-center text-xs text-charcoal-muted">
              Quiet. Place a test order to see the feed move.
            </p>
          ) : (
            <ul className="divide-y divide-neutral-50">
              {data.feed.map((item, i) => {
                const st = SOURCE_STYLE[item.source] ?? { icon: "receipt_long", cls: "text-brand" };
                const body = (
                  <div className="flex items-center gap-3 px-4 py-2.5">
                    <span className={`material-symbols-outlined text-base ${st.cls}`}>{st.icon}</span>
                    <span className="w-16 shrink-0 font-display text-[9px] font-bold uppercase tracking-wider text-charcoal-light">
                      {item.source}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-xs text-charcoal">{item.label}</span>
                    <StatusChip label={item.kind} />
                    <span className="w-16 shrink-0 text-right text-[10px] text-charcoal-light">
                      {timeAgo(item.ts)}
                    </span>
                  </div>
                );
                return (
                  <li key={`${item.ts}-${i}`} className="transition-colors hover:bg-surface-muted/40">
                    {item.href ? (
                      <Link href={item.href} className="block">
                        {body}
                      </Link>
                    ) : (
                      body
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
