"use client";

/**
 * Vendor Portal (/partner) — self-service fulfillment for POD partners.
 * Scoped by the partner login (role=PARTNER): vendors see only their own
 * splits with destination city/country, mark them SHIPPED with a tracking
 * code, and mark them DELIVERED. No pricing, no customer PII, no admin.
 */
import { useCallback, useEffect, useState } from "react";
import { useSession, UserButton } from "@clerk/nextjs";
import Link from "next/link";
import { adminApi } from "@/lib/admin-client";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4001";

type PartnerMe = {
  partnerId: string;
  name: string;
  stats: { open: number; shipped: number; delivered: number };
};

type PartnerSplit = {
  id: string;
  orderNumber: string;
  createdAt: string;
  status: string;
  trackingCode: string | null;
  trackingUrl: string | null;
  destination: { city: string; state: string; country: string; postalCode: string };
  deliveryMethod: string;
  items: Array<{ sku: string; name: string; size: string; colorway: string; quantity: number }>;
};

const STATUS_TONE: Record<string, string> = {
  PENDING: "bg-surface-muted text-charcoal-muted",
  SENT_TO_PARTNER: "bg-surface-muted text-charcoal-muted",
  ACCEPTED_BY_PARTNER: "bg-brand/10 text-brand",
  REJECTED_BY_PARTNER: "bg-error-container text-error",
  SHIPPED: "bg-charcoal text-canvas",
  DELIVERED: "bg-jade-tint text-jade-deep",
  CANCELLED: "bg-surface-muted text-charcoal-light",
};

export default function PartnerPortalPage() {
  const { isLoaded, isSignedIn, session } = useSession();
  const [me, setMe] = useState<PartnerMe | null>(null);
  const [splits, setSplits] = useState<PartnerSplit[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [track, setTrack] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!session) return;
    const api = adminApi(() => session.getToken());
    void api
      .get<PartnerMe>("/api/partner/me")
      .then(setMe)
      .catch((e: Error) => setError(e.message));
    void api
      .get<{ splits: PartnerSplit[] }>("/api/partner/splits")
      .then((r) => setSplits(r.splits))
      .catch((e: Error) => setError(e.message));
  }, [session]);

  useEffect(() => {
    load();
  }, [load]);

  const ship = async (id: string) => {
    setBusyId(id);
    setError(null);
    setNote(null);
    try {
      const api = adminApi(async () => (await session!.getToken()) ?? "");
      await api.post(`/api/partner/splits/${id}/ship`, { trackingCode: (track[id] ?? "").trim() });
      setNote("Marked shipped — the customer sees the tracking code on their order.");
      setTrack((d) => ({ ...d, [id]: "" }));
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  const deliver = async (id: string) => {
    setBusyId(id);
    setError(null);
    setNote(null);
    try {
      const api = adminApi(async () => (await session!.getToken()) ?? "");
      await api.post(`/api/partner/splits/${id}/deliver`);
      setNote("Marked delivered.");
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  if (!isLoaded) {
    return (
      <main className="grid min-h-screen place-items-center bg-canvas">
        <p className="font-display text-xs font-bold uppercase tracking-[0.2em] text-charcoal-light">
          Loading vendor portal…
        </p>
      </main>
    );
  }

  if (!isSignedIn) {
    return (
      <main className="grid min-h-screen place-items-center bg-canvas px-6">
        <div className="max-w-sm rounded-3xl border border-neutral-200/70 bg-white p-8 text-center shadow-card">
          <span className="material-symbols-outlined text-4xl text-brand">local_shipping</span>
          <h1 className="mt-3 font-display text-2xl font-bold text-charcoal">Vendor Portal</h1>
          <p className="mt-2 text-xs text-charcoal-muted">
            Sign in with the vendor login issued by Crunchrr ops.
          </p>
          <Link
            href="/sign-in"
            className="mt-5 inline-block rounded-full bg-charcoal px-6 py-2.5 font-display text-[11px] font-bold uppercase tracking-wider text-canvas"
          >
            Sign in
          </Link>
        </div>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-canvas">
      <header className="flex items-center justify-between border-b border-neutral-200/60 bg-white px-5 py-3">
        <div className="flex items-center gap-3">
          <Link href="/" className="font-display text-sm font-black tracking-tight text-charcoal">
            CRUNCHRR<span className="text-brand">.</span>
          </Link>
          <span className="rounded-full bg-surface-muted px-2 py-0.5 font-display text-[9px] font-bold uppercase tracking-wider text-charcoal-muted">
            Vendor Portal
          </span>
        </div>
        <div className="flex items-center gap-3">
          {me ? (
            <span className="font-display text-[10px] font-bold uppercase tracking-wider text-charcoal">
              {me.partnerId} · {me.name}
            </span>
          ) : null}
          <UserButton />
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl px-5 py-8">
        <h1 className="font-display text-3xl font-bold tracking-tight text-charcoal">Fulfillment Queue</h1>

        {me ? (
          <div className="mt-4 grid grid-cols-3 gap-3">
            <div className="rounded-2xl border border-neutral-200/60 bg-white p-4 shadow-card">
              <p className="font-display text-[10px] font-bold uppercase tracking-wider text-charcoal-light">Open</p>
              <p className="mt-1 font-display text-2xl font-bold text-charcoal">{me.stats.open}</p>
            </div>
            <div className="rounded-2xl border border-neutral-200/60 bg-white p-4 shadow-card">
              <p className="font-display text-[10px] font-bold uppercase tracking-wider text-charcoal-light">Shipped</p>
              <p className="mt-1 font-display text-2xl font-bold text-charcoal">{me.stats.shipped}</p>
            </div>
            <div className="rounded-2xl border border-neutral-200/60 bg-white p-4 shadow-card">
              <p className="font-display text-[10px] font-bold uppercase tracking-wider text-charcoal-light">Delivered</p>
              <p className="mt-1 font-display text-2xl font-bold text-jade">{me.stats.delivered}</p>
            </div>
          </div>
        ) : null}

        {error ? (
          <div className="mt-4 rounded-xl border border-error/30 bg-error-container px-3 py-2 text-xs font-bold text-error">
            {error}
          </div>
        ) : null}
        {note ? (
          <div className="mt-4 rounded-xl border border-jade/30 bg-jade-tint px-3 py-2 text-xs font-bold text-jade-deep">
            {note}
          </div>
        ) : null}

        {splits === null && !error ? (
          <p className="mt-6 font-display text-xs font-bold uppercase tracking-wider text-charcoal-light">
            Pulling your queue…
          </p>
        ) : null}

        {splits !== null ? (
          <div className="mt-5 space-y-3">
            {splits.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-neutral-300/70 bg-white/60 px-6 py-12 text-center text-xs text-charcoal-muted">
                Nothing in your queue right now.
              </p>
            ) : (
              splits.map((s) => (
                <article key={s.id} className="rounded-2xl border border-neutral-200/60 bg-white p-4 shadow-card">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-display text-sm font-bold text-charcoal">{s.orderNumber}</span>
                      <span className={`rounded-full px-2 py-0.5 font-display text-[9px] font-bold uppercase tracking-wider ${STATUS_TONE[s.status] ?? ""}`}>
                        {s.status.replace(/_/g, " ").toLowerCase()}
                      </span>
                    </div>
                    <span className="text-[10px] text-charcoal-light">
                      {new Date(s.createdAt).toLocaleString()}
                    </span>
                  </div>

                  <ul className="mt-2 divide-y divide-neutral-50">
                    {s.items.map((it) => (
                      <li key={`${s.id}-${it.sku}`} className="flex items-center justify-between py-1.5 text-xs">
                        <span className="font-bold text-charcoal">{it.name}</span>
                        <span className="text-charcoal-muted">
                          {it.colorway} · {it.size} · ×{it.quantity}
                        </span>
                      </li>
                    ))}
                  </ul>

                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-neutral-100 pt-2">
                    <p className="text-[10px] text-charcoal-muted">
                      Ship to: {s.destination.city}
                      {s.destination.state ? `, ${s.destination.state}` : ""} · {s.destination.country}{" "}
                      {s.destination.postalCode} · {s.deliveryMethod.toLowerCase()}
                      {s.trackingCode ? ` · tracking ${s.trackingCode}` : ""}
                    </p>
                    {s.status === "SHIPPED" ? (
                      <button
                        type="button"
                        disabled={busyId === s.id}
                        onClick={() => void deliver(s.id)}
                        className="rounded-full bg-jade px-4 py-1.5 font-display text-[10px] font-bold uppercase tracking-wider text-white disabled:opacity-50"
                      >
                        {busyId === s.id ? "…" : "Mark delivered"}
                      </button>
                    ) : null}
                    {["PENDING", "SENT_TO_PARTNER", "ACCEPTED_BY_PARTNER", "REJECTED_BY_PARTNER"].includes(s.status) ? (
                      <div className="flex items-center gap-2">
                        <input
                          value={track[s.id] ?? ""}
                          onChange={(e) => setTrack((d) => ({ ...d, [s.id]: e.target.value }))}
                          placeholder="Tracking #"
                          maxLength={100}
                          className="w-36 rounded-full border border-neutral-200/80 px-3 py-1.5 text-xs outline-none focus:border-charcoal/40"
                        />
                        <button
                          type="button"
                          disabled={busyId === s.id || (track[s.id] ?? "").trim().length < 4}
                          onClick={() => void ship(s.id)}
                          className="rounded-full bg-charcoal px-4 py-1.5 font-display text-[10px] font-bold uppercase tracking-wider text-canvas disabled:opacity-50"
                        >
                          {busyId === s.id ? "…" : "Mark shipped"}
                        </button>
                      </div>
                    ) : null}
                  </div>
                </article>
              ))
            )}
          </div>
        ) : null}
      </main>
    </div>
  );
}
