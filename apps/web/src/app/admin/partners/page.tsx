"use client";

/**
 * Partners (multi-vendor) — credentials, reachability tests, per-vendor
 * split stats. Secrets are masked; the API never echoes them back.
 */
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useAdminApi } from "@/components/admin/chrome";
import { AdminButton, ErrorNote, Field, inputCls, Spinner, StatusChip } from "@/components/admin/ui";
import type { AdminPartner, PartnerList } from "@/lib/admin-client";

const PARTNER_META: Record<string, { desc: string; docs: string }> = {
  QIKINK: {
    desc: "Qikink Order API v1 — Tirupati hub serving the TN/AP corridor. client_id + secret per order push.",
    docs: "https://qikink.com",
  },
  PRINTROVE: {
    desc: "Printrove Orders API — Coimbatore, Tamil Nadu. email/password → JWT, then order push.",
    docs: "https://printrove.com",
  },
  INKMONK: {
    desc: "Inkmonk — Chennai, Tamil Nadu. Same-day TN print network; live adapter pending, simulated dispatch.",
    docs: "https://inkmonk.com",
  },
  BLINKSTORE: {
    desc: "Blinkstore — Mumbai, India. Pan-India POD marketplace; live adapter pending, simulated dispatch.",
    docs: "https://blinkstore.org",
  },
  PRINTFUL: {
    desc: "Printful — Charlotte NC (US) + UK/EU fulfillment centers for Western lanes. Simulated dispatch.",
    docs: "https://printful.com",
  },
  PRINTIFY: {
    desc: "Printify — San Francisco; global provider network, US/UK facilities per SKU. Simulated dispatch.",
    docs: "https://printify.com",
  },
  GELATO: {
    desc: "Gelato — local production in 30+ countries; strongest US/UK lane latency. Simulated dispatch.",
    docs: "https://gelato.com",
  },
  CONTRADO: {
    desc: "Contrado — London, England. Premium UK-made apparel & accessories; live adapter pending, simulated dispatch.",
    docs: "https://contrado.com",
  },
  INKTHREADABLE: {
    desc: "Inkthreadable — Lancashire, England. Carbon-neutral UK POD; live adapter pending, simulated dispatch.",
    docs: "https://inkthreadable.co.uk",
  },
  GOOTEN: {
    desc: "Gooten — New York, USA. API-first POD network with UK print partners. Simulated dispatch.",
    docs: "https://gooten.com",
  },
  IN_HOUSE: { desc: "Manual fulfillment. No adapter — dispatch is a human step.", docs: "" },
};

export default function AdminPartnersPage() {
  const api = useAdminApi();
  const [data, setData] = useState<PartnerList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<{
    apiBaseUrl: string;
    clientId: string;
    clientSecret: string;
    active: boolean;
    region: string;
  }>({
    apiBaseUrl: "",
    clientId: "",
    clientSecret: "",
    active: true,
    region: "GLOBAL",
  });
  const [filter, setFilter] = useState<"ALL" | "LIVE" | "SIMULATED" | "PAUSED">("ALL");
  const [testing, setTesting] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<Record<string, { ok: boolean; message: string }>>({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    void api
      .get<PartnerList>("/api/admin/partners")
      .then(setData)
      .catch((e: Error) => setError(e.message));
  }, [api]);
  useEffect(() => {
    load();
  }, [load]);

  const startEdit = (p: AdminPartner) => {
    setEditing(p.partnerId);
    setForm({ apiBaseUrl: p.apiBaseUrl, clientId: "", clientSecret: "", active: p.active, region: p.region ?? "GLOBAL" });
  };

  const save = async (partnerId: string) => {
    setSaving(true);
    setError(null);
    try {
      await api.put(`/api/admin/partners/${partnerId}`, {
        apiBaseUrl: form.apiBaseUrl.trim() || undefined,
        ...(form.clientId.trim() ? { clientId: form.clientId.trim() } : {}),
        ...(form.clientSecret.trim() ? { clientSecret: form.clientSecret.trim() } : {}),
        active: form.active,
        region: form.region,
      });
      setEditing(null);
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const test = async (partnerId: string) => {
    setTesting(partnerId);
    try {
      const r = await api.post<{ ok: boolean; message: string }>(`/api/admin/partners/${partnerId}/test`);
      setTestResult((m) => ({ ...m, [partnerId]: r }));
    } catch (e) {
      setTestResult((m) => ({ ...m, [partnerId]: { ok: false, message: (e as Error).message } }));
    } finally {
      setTesting(null);
    }
  };

  const partners = data?.partners ?? [];
  const kpis = {
    total: partners.length,
    live: partners.filter((p) => p.configured && p.active).length,
    simulated: partners.filter((p) => !p.configured && p.active).length,
    paused: partners.filter((p) => !p.active).length,
    open: partners.reduce((n, p) => n + p.stats.open, 0),
  };
  const visible = partners
    .filter((p) =>
      filter === "ALL"
        ? true
        : filter === "LIVE"
          ? p.configured && p.active
          : filter === "SIMULATED"
            ? !p.configured && p.active
            : !p.active,
    )
    .sort((a, b) => b.stats.open - a.stats.open || b.stats.total - a.stats.total);

  if (error && !data) return <ErrorNote message={error} />;
  if (!data) return <Spinner label="Loading partners" />;

  return (
    <div className="space-y-5">
      <header>
        <div className="mb-1 flex items-center gap-2">
          <span className="material-symbols-outlined text-lg text-brand">hub</span>
          <span className="font-display text-[10px] font-bold uppercase tracking-[0.22em] text-charcoal-light">
            Multi-vendor
          </span>
        </div>
        <h1 className="font-display text-3xl font-bold tracking-tight text-charcoal">
          Fulfillment Partners
        </h1>
        <p className="mt-1 max-w-xl text-xs text-charcoal-muted">
          Credentials are stored server-side and masked here. Adapters prefer
          these over env vars; simulation kicks in automatically when a partner
          is unconfigured.
        </p>
      </header>

      {error ? <ErrorNote message={error} /> : null}

      {/* Network KPIs */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {(
          [
            ["Partners", kpis.total, "text-charcoal"],
            ["Live", kpis.live, "text-jade-deep"],
            ["Simulated", kpis.simulated, "text-charcoal-muted"],
            ["Paused", kpis.paused, "text-error"],
            ["Open splits", kpis.open, kpis.open > 0 ? "text-brand" : "text-charcoal"],
          ] as const
        ).map(([label, n, tone]) => (
          <div key={label} className="rounded-2xl border border-neutral-200/60 bg-white px-4 py-3">
            <span className={`block font-display text-2xl font-bold ${tone}`}>{n}</span>
            <span className="block text-[9px] uppercase tracking-wider text-charcoal-light">{label}</span>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        {(["ALL", "LIVE", "SIMULATED", "PAUSED"] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`rounded-full border px-3 py-1 font-display text-[10px] font-bold uppercase tracking-wider transition-colors ${
              filter === f
                ? "border-charcoal bg-charcoal text-canvas"
                : "border-neutral-200 bg-white text-charcoal-light hover:border-charcoal/30"
            }`}
          >
            {f}
          </button>
        ))}
        <span className="ml-auto text-[10px] uppercase tracking-wider text-charcoal-light">
          {visible.length} of {partners.length} · sorted by open splits
        </span>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {data.partners.map((p) => {
          const meta = PARTNER_META[p.partnerId];
          const isEditing = editing === p.partnerId;
          const result = testResult[p.partnerId];
          return (
            <section key={p.partnerId} className="rounded-2xl border border-neutral-200/60 bg-white p-5">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className="font-display text-sm font-bold uppercase tracking-wider text-charcoal">
                  {p.partnerId}
                </h2>
                <div className="flex gap-1.5">
                  {p.active ? <StatusChip label="Active" tone="bg-jade-tint text-jade-deep" /> : <StatusChip label="Paused" tone="bg-error-container text-error" />}
                  {p.region ? (
                    <span className="rounded-full border border-neutral-200/70 px-2 py-0.5 font-display text-[9px] font-bold uppercase tracking-wider text-charcoal-muted">
                      {p.region}
                    </span>
                  ) : null}
                  {p.configured ? (
                    <StatusChip label="Live" tone="bg-charcoal text-canvas" />
                  ) : (
                    <StatusChip label="Simulated" tone="bg-surface-muted text-charcoal-muted" />
                  )}
                </div>
              </div>
              <p className="mb-3 text-[11px] leading-relaxed text-charcoal-muted">{meta?.desc}</p>

              {/* Stats */}
              <div className="mb-3 grid grid-cols-5 gap-1.5 text-center">
                {(
                  [
                    ["Total", p.stats.total, "text-charcoal"],
                    ["Open", p.stats.open, p.stats.open > 0 ? "text-brand" : "text-charcoal"],
                    ["Rej.", p.stats.rejected, p.stats.rejected > 0 ? "text-error" : "text-charcoal"],
                    ["Ship.", p.stats.shipped, "text-charcoal"],
                    ["Delv.", p.stats.delivered, "text-jade-deep"],
                  ] as const
                ).map(([label, n, tone]) => (
                  <div key={label} className="rounded-xl bg-surface-muted py-2">
                    <span className={`block font-display text-sm font-bold ${tone}`}>{n}</span>
                    <span className="block text-[8px] uppercase tracking-wider text-charcoal-light">{label}</span>
                  </div>
                ))}
              </div>

              {/* Health line */}
              <div className="mb-3 space-y-0.5 text-[10px] text-charcoal-muted">
                <p>
                  Last activity:{" "}
                  <span className="font-medium text-charcoal">
                    {p.lastActivityAt ? new Date(p.lastActivityAt).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "—"}
                  </span>
                  <span className="mx-1.5">·</span>
                  Avg accept:{" "}
                  <span className="font-medium text-charcoal">{p.avgAcceptMins != null ? `${p.avgAcceptMins}m` : "—"}</span>
                </p>
                <p>
                  Last ping:{" "}
                  <span className="font-medium text-charcoal">
                    {p.lastTestAt ? new Date(p.lastTestAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "never"}
                  </span>
                </p>
              </div>

              {isEditing ? (
                <div className="space-y-3">
                  <Field label="Routing region" hint="Drives auto-routing of unassigned (IN_HOUSE) lines.">
                    <select
                      value={form.region}
                      onChange={(e) => setForm({ ...form, region: e.target.value })}
                      className={inputCls}
                    >
                      {["IN", "US", "UK", "EU", "GLOBAL"].map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="API base URL">
                    <input
                      value={form.apiBaseUrl}
                      onChange={(e) => setForm({ ...form, apiBaseUrl: e.target.value })}
                      className={inputCls}
                      placeholder="https://api.qikink.com"
                    />
                  </Field>
                  <Field label={p.partnerId === "PRINTROVE" ? "Email" : "Client ID"} hint="Leave empty to keep the stored value.">
                    <input
                      value={form.clientId}
                      onChange={(e) => setForm({ ...form, clientId: e.target.value })}
                      className={inputCls}
                      placeholder={p.clientId ? `stored: ${p.clientId}` : "not set"}
                    />
                  </Field>
                  <Field label={p.partnerId === "PRINTROVE" ? "Password" : "Client Secret"} hint="Stored server-side, never displayed again.">
                    <input
                      type="password"
                      value={form.clientSecret}
                      onChange={(e) => setForm({ ...form, clientSecret: e.target.value })}
                      className={inputCls}
                      placeholder={p.hasSecret ? "•••• stored" : "not set"}
                    />
                  </Field>
                  <label className="flex items-center gap-2 text-xs text-charcoal">
                    <input
                      type="checkbox"
                      checked={form.active}
                      onChange={(e) => setForm({ ...form, active: e.target.checked })}
                      className="h-4 w-4 accent-[#F45B50]"
                    />
                    Partner enabled (routes get this vendor)
                  </label>
                  <div className="flex gap-2">
                    <AdminButton variant="coral" disabled={saving} onClick={() => void save(p.partnerId)}>
                      Save
                    </AdminButton>
                    <AdminButton variant="ghost" onClick={() => setEditing(null)}>
                      Cancel
                    </AdminButton>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <dl className="space-y-1 text-[11px]">
                    <div className="flex justify-between gap-2">
                      <dt className="text-charcoal-light">Base URL</dt>
                      <dd className="truncate font-medium text-charcoal">{p.apiBaseUrl || "—"}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-charcoal-light">ID</dt>
                      <dd className="font-medium text-charcoal">{p.clientId ?? "not set"}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-charcoal-light">Secret</dt>
                      <dd className="font-medium text-charcoal">{p.hasSecret ? "•••• stored" : "not set"}</dd>
                    </div>
                  </dl>
                  <div className="flex flex-wrap gap-2">
                    <AdminButton onClick={() => startEdit(p)}>Edit creds</AdminButton>
                    <AdminButton
                      variant="ghost"
                      disabled={testing === p.partnerId}
                      onClick={() => void test(p.partnerId)}
                    >
                      {testing === p.partnerId ? "Testing…" : "Test"}
                    </AdminButton>
                    {p.stats.total > 0 ? (
                      <Link
                        href={`/admin/fulfillment?partner=${p.partnerId}`}
                        className="flex items-center rounded-xl border border-neutral-200 px-3.5 py-2 font-display text-xs font-bold text-charcoal transition-colors hover:border-brand/40 hover:text-brand"
                      >
                        View splits
                      </Link>
                    ) : null}
                  </div>
                  {result ? (
                    <p
                      className={`rounded-xl px-3 py-2 text-[11px] font-medium ${
                        result.ok ? "bg-jade-tint text-jade-deep" : "bg-error-container text-error"
                      }`}
                    >
                      {result.ok ? "✓" : "✕"} {result.message}
                    </p>
                  ) : null}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
