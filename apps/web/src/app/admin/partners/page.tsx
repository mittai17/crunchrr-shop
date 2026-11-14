"use client";

/**
 * Partners (multi-vendor) — credentials, reachability tests, per-vendor
 * split stats. Secrets are masked; the API never echoes them back.
 */
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
  IN_HOUSE: { desc: "Manual fulfillment. No adapter — dispatch is a human step.", docs: "" },
};

export default function AdminPartnersPage() {
  const api = useAdminApi();
  const [data, setData] = useState<PartnerList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<{ apiBaseUrl: string; clientId: string; clientSecret: string; active: boolean }>({
    apiBaseUrl: "",
    clientId: "",
    clientSecret: "",
    active: true,
  });
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
    setForm({ apiBaseUrl: p.apiBaseUrl, clientId: "", clientSecret: "", active: p.active });
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
                  {p.configured ? (
                    <StatusChip label="Live" tone="bg-charcoal text-canvas" />
                  ) : (
                    <StatusChip label="Simulated" tone="bg-surface-muted text-charcoal-muted" />
                  )}
                </div>
              </div>
              <p className="mb-3 text-[11px] leading-relaxed text-charcoal-muted">{meta?.desc}</p>

              {/* Stats */}
              <div className="mb-4 grid grid-cols-4 gap-2 text-center">
                {[
                  ["Total", p.stats.total],
                  ["Open", p.stats.open],
                  ["Rejected", p.stats.rejected],
                  ["Shipped", p.stats.shipped],
                ].map(([label, n]) => (
                  <div key={label as string} className="rounded-xl bg-surface-muted py-2">
                    <span className="block font-display text-base font-bold text-charcoal">{n}</span>
                    <span className="block text-[9px] uppercase tracking-wider text-charcoal-light">{label}</span>
                  </div>
                ))}
              </div>

              {isEditing ? (
                <div className="space-y-3">
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
