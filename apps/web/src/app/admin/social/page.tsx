"use client";

/**
 * Studio — one composer for every social platform + the paid campaigns
 * manager. Posts are stored with schedule + product links; publishing is
 * simulated until per-platform OAuth apps are connected (clearly labeled
 * in the UI and API). Ads budgets are briefs for the connected ad account.
 */
import { useCallback, useEffect, useState } from "react";
import { useAdminApi } from "@/components/admin/chrome";
import { AdminButton, ErrorNote, Field, inputCls, Spinner, StatusChip } from "@/components/admin/ui";
import type { SocialData } from "@/lib/admin-client";

type AdsData = {
  campaigns: Array<{
    id: string;
    name: string;
    platform: string;
    objective: string;
    dailyBudgetMinor: number;
    status: string;
    productSlug: string | null;
    startAt: string | null;
    endAt: string | null;
    createdAt: string;
  }>;
  platforms: string[];
};

export default function AdminStudioPage() {
  const api = useAdminApi();
  const [tab, setTab] = useState<"POSTS" | "ADS">("POSTS");
  const [data, setData] = useState<SocialData | null>(null);
  const [ads, setAds] = useState<AdsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [platform, setPlatform] = useState("INSTAGRAM");
  const [content, setContent] = useState("");
  const [productSlug, setProductSlug] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");

  const [adForm, setAdForm] = useState({ name: "", platform: "META", objective: "SALES", budget: "20", productSlug: "", startAt: "", endAt: "" });
  const [creatingAd, setCreatingAd] = useState(false);

  const load = useCallback(() => {
    void api
      .get<SocialData>("/api/admin/social")
      .then(setData)
      .catch((e: Error) => setError(e.message));
    void api
      .get<AdsData>("/api/admin/ads")
      .then(setAds)
      .catch(() => undefined);
  }, [api]);
  useEffect(() => {
    load();
  }, [load]);

  const compose = async () => {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      await api.post("/api/admin/social", {
        platform,
        content: content.trim(),
        productSlug: productSlug.trim() || null,
        imageUrl: imageUrl.trim() || null,
        scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : null,
      });
      setContent("");
      setProductSlug("");
      setImageUrl("");
      setScheduledAt("");
      setNote("Post queued.");
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const publish = async (id: string) => {
    setError(null);
    setNote(null);
    try {
      const r = await api.post<{ note?: string }>(`/api/admin/social/${id}/publish`, {});
      setNote(r.note ?? "Published.");
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const remove = async (id: string) => {
    setError(null);
    try {
      await api.delete(`/api/admin/social/${id}`);
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const createAd = async () => {
    setCreatingAd(true);
    setError(null);
    setNote(null);
    try {
      await api.post("/api/admin/ads", {
        name: adForm.name.trim(),
        platform: adForm.platform,
        objective: adForm.objective,
        dailyBudgetUsd: Number(adForm.budget || "0"),
        productSlug: adForm.productSlug.trim() || undefined,
        startAt: adForm.startAt ? new Date(adForm.startAt).toISOString() : undefined,
        endAt: adForm.endAt ? new Date(adForm.endAt).toISOString() : undefined,
      });
      setNote(`Campaign "${adForm.name.trim()}" created as a DRAFT brief.`);
      setAdForm({ ...adForm, name: "", budget: "20", productSlug: "" });
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCreatingAd(false);
    }
  };

  const setAdStatus = async (id: string, status: string) => {
    setError(null);
    setNote(null);
    try {
      await api.patch(`/api/admin/ads/${id}`, { status });
      setNote(`Campaign ${status.toLowerCase()}.`);
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="space-y-5">
      <header>
        <div className="mb-1 flex items-center gap-2">
          <span className="material-symbols-outlined text-lg text-brand">campaign</span>
          <span className="font-display text-[10px] font-bold uppercase tracking-[0.22em] text-charcoal-light">
            One composer · every channel
          </span>
        </div>
        <h1 className="font-display text-3xl font-bold tracking-tight text-charcoal">Social Studio</h1>
      </header>

      <div className="flex gap-1.5">
        {(["POSTS", "ADS"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`rounded-full px-5 py-2 font-display text-[10px] font-bold uppercase tracking-wider transition-all ${
              tab === t
                ? "bg-charcoal text-canvas shadow-card"
                : "border border-neutral-200/60 bg-white text-charcoal-muted hover:border-brand hover:text-brand"
            }`}
          >
            {t === "POSTS" ? "Organic posts" : "Paid campaigns"}
          </button>
        ))}
      </div>

      {error ? <ErrorNote message={error} /> : null}
      {note ? (
        <p className="rounded-xl border border-jade/30 bg-jade/10 px-3 py-2 text-xs font-bold text-jade">{note}</p>
      ) : null}
      {!data && !error ? <Spinner label="Opening the studio" /> : null}

      {tab === "ADS" ? (
        ads ? (
          <div className="grid gap-4 lg:grid-cols-[380px_1fr]">
            <section className="card3d space-y-3 rounded-2xl border border-neutral-200/60 bg-white p-4 shadow-card">
              <h2 className="font-display text-xs font-bold uppercase tracking-wider text-charcoal-light">Campaign brief</h2>
              <Field label="Campaign name">
                <input
                  value={adForm.name}
                  onChange={(e) => setAdForm({ ...adForm, name: e.target.value })}
                  placeholder="Drop 004 — Cashmere Vault push"
                  className={inputCls}
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Platform">
                  <select value={adForm.platform} onChange={(e) => setAdForm({ ...adForm, platform: e.target.value })} className={inputCls}>
                    {ads.platforms.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Objective">
                  <select value={adForm.objective} onChange={(e) => setAdForm({ ...adForm, objective: e.target.value })} className={inputCls}>
                    {["SALES", "TRAFFIC", "AWARENESS"].map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Daily budget ($)">
                  <input
                    value={adForm.budget}
                    onChange={(e) => setAdForm({ ...adForm, budget: e.target.value })}
                    inputMode="decimal"
                    className={inputCls}
                  />
                </Field>
                <Field label="Product slug">
                  <input
                    value={adForm.productSlug}
                    onChange={(e) => setAdForm({ ...adForm, productSlug: e.target.value })}
                    placeholder="vault-rib-tee"
                    className={inputCls}
                  />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Start (optional)">
                  <input type="datetime-local" value={adForm.startAt} onChange={(e) => setAdForm({ ...adForm, startAt: e.target.value })} className={inputCls} />
                </Field>
                <Field label="End (optional)">
                  <input type="datetime-local" value={adForm.endAt} onChange={(e) => setAdForm({ ...adForm, endAt: e.target.value })} className={inputCls} />
                </Field>
              </div>
              <AdminButton variant="coral" disabled={creatingAd || !adForm.name.trim()} onClick={() => void createAd()}>
                {creatingAd ? "Creating…" : "Create campaign"}
              </AdminButton>
              <p className="text-[10px] leading-relaxed text-charcoal-light">
                Campaign briefs are stored and audited now; spend runs in
                simulation until the platform's ad account is connected.
              </p>
            </section>

            <section className="card3d overflow-x-auto rounded-2xl border border-neutral-200/60 bg-white shadow-card">
              <h2 className="border-b border-neutral-100 bg-surface-muted/60 px-3 py-2 font-display text-xs font-bold uppercase tracking-wider text-charcoal-light">
                Campaigns ({ads.campaigns.length})
              </h2>
              {ads.campaigns.length === 0 ? (
                <p className="px-4 py-10 text-center text-xs text-charcoal-muted">No campaigns yet.</p>
              ) : (
                <ul className="divide-y divide-neutral-50">
                  {ads.campaigns.map((c) => (
                    <li key={c.id} className="flex items-center justify-between gap-3 px-4 py-3">
                      <div className="min-w-0 flex-1">
                        <div className="mb-1 flex flex-wrap items-center gap-2">
                          <span className="font-display text-[10px] font-bold uppercase tracking-wider text-charcoal">{c.platform}</span>
                          <StatusChip label={c.status} />
                          <span className="text-[10px] text-charcoal-light">
                            {c.objective.toLowerCase()} · ${((c.dailyBudgetMinor ?? 0) / 100).toFixed(0)}/day
                          </span>
                        </div>
                        <p className="text-xs font-bold text-charcoal">{c.name}</p>
                        {c.productSlug ? <p className="text-[10px] text-charcoal-light">→ /{c.productSlug}</p> : null}
                      </div>
                      <div className="flex shrink-0 gap-1.5">
                        {c.status !== "ACTIVE" && c.status !== "COMPLETED" ? (
                          <AdminButton variant="coral" onClick={() => void setAdStatus(c.id, "ACTIVE")}>
                            Activate
                          </AdminButton>
                        ) : null}
                        {c.status === "ACTIVE" ? (
                          <AdminButton onClick={() => void setAdStatus(c.id, "PAUSED")}>Pause</AdminButton>
                        ) : null}
                        {c.status !== "COMPLETED" ? (
                          <AdminButton onClick={() => void setAdStatus(c.id, "COMPLETED")}>End</AdminButton>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        ) : (
          <Spinner label="Loading campaigns" />
        )
      ) : null}

      {tab === "POSTS" && data ? (
        <div className="grid gap-4 lg:grid-cols-[380px_1fr]">
          {/* Composer */}
          <section className="space-y-3 rounded-2xl border border-neutral-200/60 bg-white p-4 shadow-card">
            <h2 className="font-display text-xs font-bold uppercase tracking-wider text-charcoal-light">Compose</h2>
            <Field label="Platform">
              <select value={platform} onChange={(e) => setPlatform(e.target.value)} className={inputCls}>
                {data.platforms.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Caption">
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={4}
                maxLength={2200}
                placeholder="Drop 004 — the vault opens Friday. #crunchrr"
                className={inputCls}
              />
            </Field>
            <Field label="Product link (slug)">
              <input
                value={productSlug}
                onChange={(e) => setProductSlug(e.target.value)}
                placeholder="urban-vanguard-heavyweight-hoodie"
                className={inputCls}
              />
            </Field>
            <Field label="Image URL">
              <input
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder="https://…"
                className={inputCls}
              />
            </Field>
            <Field label="Schedule (optional)">
              <input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} className={inputCls} />
            </Field>
            <AdminButton variant="coral" disabled={busy || !content.trim()} onClick={() => void compose()}>
              {busy ? "Queueing…" : "Queue post"}
            </AdminButton>
            <p className="text-[10px] leading-relaxed text-charcoal-light">
              Publishing runs in simulation until each platform's OAuth app is
              connected — every post is stored, scheduled and audited either way.
            </p>
          </section>

          {/* Queue */}
          <section className="overflow-x-auto rounded-2xl border border-neutral-200/60 bg-white shadow-card">
            <h2 className="border-b border-neutral-100 bg-surface-muted/60 px-3 py-2 font-display text-xs font-bold uppercase tracking-wider text-charcoal-light">
              Post queue ({data.posts.length})
            </h2>
            {data.posts.length === 0 ? (
              <p className="px-4 py-10 text-center text-xs text-charcoal-muted">Nothing queued yet.</p>
            ) : (
              <ul className="divide-y divide-neutral-50">
                {data.posts.map((p) => (
                  <li key={p.id} className="flex items-start justify-between gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex flex-wrap items-center gap-2">
                        <span className="font-display text-[10px] font-bold uppercase tracking-wider text-charcoal">
                          {p.platform}
                        </span>
                        <StatusChip label={p.status} />
                        {p.scheduledAt ? (
                          <span className="text-[10px] text-charcoal-light">
                            {new Date(p.scheduledAt).toLocaleString()}
                          </span>
                        ) : null}
                      </div>
                      <p className="text-xs text-charcoal">{p.content}</p>
                      <p className="mt-0.5 text-[10px] text-charcoal-light">
                        {p.productSlug ? `→ /${p.productSlug}` : "no product link"}
                        {p.postRef ? ` · ref ${p.postRef}` : ""}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col gap-1.5">
                      {p.status !== "PUBLISHED" ? (
                        <>
                          <AdminButton variant="coral" onClick={() => void publish(p.id)}>
                            Publish now
                          </AdminButton>
                          <AdminButton onClick={() => void remove(p.id)}>Delete</AdminButton>
                        </>
                      ) : (
                        <span className="text-[10px] text-charcoal-light">
                          {p.postedAt ? new Date(p.postedAt).toLocaleString() : ""}
                        </span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      ) : null}
    </div>
  );
}
