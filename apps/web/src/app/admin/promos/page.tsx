"use client";

/**
 * Promos — admin CRUD for the storefront's discount codes.
 */
import { useCallback, useEffect, useState } from "react";
import { useAdminApi } from "@/components/admin/chrome";
import { AdminButton, ErrorNote, Field, inputCls, Spinner, StatusChip } from "@/components/admin/ui";
import type { PromoList } from "@/lib/admin-client";

export default function AdminPromosPage() {
  const api = useAdminApi();
  const [promos, setPromos] = useState<PromoList["promos"] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null); // code | "NEW"
  const [form, setForm] = useState({ code: "", percentOff: "10", label: "", active: true });
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    void api
      .get<PromoList>("/api/admin/promos")
      .then((r) => setPromos(r.promos))
      .catch((e: Error) => setError(e.message));
  }, [api]);
  useEffect(() => {
    load();
  }, [load]);

  const startEdit = (code?: string, p?: PromoList["promos"][number]) => {
    setEditing(code ?? "NEW");
    setForm(
      p
        ? { code: p.code, percentOff: String(p.percentOff), label: p.label, active: p.active }
        : { code: "", percentOff: "10", label: "", active: true },
    );
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await api.put(`/api/admin/promos/${form.code.trim().toUpperCase()}`, {
        code: form.code.trim().toUpperCase(),
        percentOff: Number(form.percentOff),
        label: form.label.trim(),
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

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <span className="material-symbols-outlined text-lg text-brand">sell</span>
            <span className="font-display text-[10px] font-bold uppercase tracking-[0.22em] text-charcoal-light">
              Discounts
            </span>
          </div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-charcoal">Promo Codes</h1>
          <p className="mt-1 max-w-lg text-xs text-charcoal-muted">
            Percent-off codes validated against the database at checkout — the
            old hardcoded map is gone. Usage counts update automatically.
          </p>
        </div>
        <AdminButton variant="coral" onClick={() => startEdit()}>
          New code
        </AdminButton>
      </header>

      {error ? <ErrorNote message={error} /> : null}

      {editing ? (
        <section className="rounded-2xl border border-brand/30 bg-white p-5">
          <h2 className="mb-4 font-display text-xs font-bold uppercase tracking-[0.16em] text-charcoal">
            {editing === "NEW" ? "New promo code" : `Edit ${editing}`}
          </h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Code" hint="Uppercase, e.g. TRIBE15">
              <input
                value={form.code}
                disabled={editing !== "NEW"}
                onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                className={`${inputCls} uppercase font-display font-bold`}
                maxLength={40}
              />
            </Field>
            <Field label="% off" hint="1–90">
              <input value={form.percentOff} onChange={(e) => setForm({ ...form, percentOff: e.target.value })} inputMode="numeric" className={inputCls} />
            </Field>
            <Field label="Label" hint="Shown on the bag & order">
              <input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} className={inputCls} />
            </Field>
          </div>
          <label className="mt-3 flex items-center gap-2 text-xs text-charcoal">
            <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} className="h-4 w-4 accent-[#F45B50]" />
            Active (honored at checkout)
          </label>
          <div className="mt-4 flex gap-2">
            <AdminButton variant="coral" disabled={saving || !form.code.trim() || !form.label.trim()} onClick={() => void save()}>
              Save
            </AdminButton>
            <AdminButton variant="ghost" onClick={() => setEditing(null)}>
              Cancel
            </AdminButton>
          </div>
        </section>
      ) : null}

      {promos ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {promos.map((p) => (
            <div key={p.code} className="flex items-center justify-between gap-3 rounded-2xl border border-neutral-200/60 bg-white p-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-display text-base font-bold tracking-tight text-charcoal">{p.code}</span>
                  <StatusChip label={`${p.percentOff}% off`} tone="bg-brand/10 text-brand" />
                  {p.active ? (
                    <StatusChip label="Active" tone="bg-jade-tint text-jade-deep" />
                  ) : (
                    <StatusChip label="Paused" tone="bg-surface-muted text-charcoal-muted" />
                  )}
                </div>
                <span className="block text-xs text-charcoal-muted">
                  {p.label} · used {p.usedCount}×
                </span>
              </div>
              <AdminButton variant="ghost" onClick={() => startEdit(p.code, p)}>
                Edit
              </AdminButton>
            </div>
          ))}
        </div>
      ) : (
        <Spinner label="Loading codes" />
      )}
    </div>
  );
}
