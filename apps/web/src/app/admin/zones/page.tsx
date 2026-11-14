"use client";

/**
 * Countries — multi-country control center: currency, FX, fees, tax,
 * free-shipping threshold, enable/disable per destination.
 */
import { useCallback, useEffect, useState } from "react";
import { useAdminApi } from "@/components/admin/chrome";
import { AdminButton, ErrorNote, Field, inputCls, Spinner, StatusChip, Td, Th } from "@/components/admin/ui";
import { formatMoney } from "@/lib/utils";
import type { Zone, ZoneList } from "@/lib/admin-client";

const CURRENCIES = ["USD", "INR", "GBP", "EUR", "AED", "AUD", "CAD", "SGD"] as const;

export default function AdminZonesPage() {
  const api = useAdminApi();
  const [zones, setZones] = useState<Zone[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null); // countryCode | "NEW"
  const [form, setForm] = useState({
    countryCode: "",
    countryName: "",
    currency: "USD",
    fx: "1",
    shippingFee: "12",
    priorityFee: "12",
    freeThreshold: "75",
    taxPct: "7",
    active: true,
  });
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    void api
      .get<ZoneList>("/api/admin/zones")
      .then((r) => setZones(r.zones))
      .catch((e: Error) => setError(e.message));
  }, [api]);
  useEffect(() => {
    load();
  }, [load]);

  const startEdit = (z?: Zone) => {
    if (z) {
      setEditing(z.countryCode);
      setForm({
        countryCode: z.countryCode,
        countryName: z.countryName,
        currency: z.currency,
        fx: String(z.fxFromUsd),
        shippingFee: String(z.shippingFeeMinor / 100),
        priorityFee: String(z.priorityFeeMinor / 100),
        freeThreshold: String(z.freeThresholdMinor / 100),
        taxPct: String(z.taxBps / 100),
        active: z.active,
      });
    } else {
      setEditing("NEW");
      setForm({ countryCode: "", countryName: "", currency: "USD", fx: "1", shippingFee: "12", priorityFee: "12", freeThreshold: "75", taxPct: "7", active: true });
    }
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const payload = {
        countryName: form.countryName.trim(),
        currency: form.currency,
        fxFromUsd: Number(form.fx),
        shippingFeeMinor: Math.round(Number(form.shippingFee) * 100),
        priorityFeeMinor: Math.round(Number(form.priorityFee) * 100),
        freeThresholdMinor: Math.round(Number(form.freeThreshold) * 100),
        taxBps: Math.round(Number(form.taxPct) * 100),
        active: form.active,
        sortOrder: 100,
      };
      await api.put(`/api/admin/zones/${form.countryCode.trim().toUpperCase()}`, payload);
      setEditing(null);
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (z: Zone) => {
    setError(null);
    try {
      await api.patch(`/api/admin/zones/${z.countryCode}`, { active: !z.active });
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <span className="material-symbols-outlined text-lg text-brand">public</span>
            <span className="font-display text-[10px] font-bold uppercase tracking-[0.22em] text-charcoal-light">
              Multi-country
            </span>
          </div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-charcoal">
            Countries & Currency
          </h1>
          <p className="mt-1 max-w-xl text-xs text-charcoal-muted">
            Catalog prices are stored in USD; each zone converts at its FX rate
            and applies its own fees, free-shipping threshold and tax at
            checkout.
          </p>
        </div>
        <AdminButton variant="coral" onClick={() => startEdit()}>
          Add country
        </AdminButton>
      </header>

      {error ? <ErrorNote message={error} /> : null}

      {editing ? (
        <section className="rounded-2xl border border-brand/30 bg-white p-5">
          <h2 className="mb-4 font-display text-xs font-bold uppercase tracking-[0.16em] text-charcoal">
            {editing === "NEW" ? "New shipping zone" : `Edit ${editing}`}
          </h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="ISO code" hint="Two letters, e.g. JP">
              <input
                value={form.countryCode}
                disabled={editing !== "NEW"}
                onChange={(e) => setForm({ ...form, countryCode: e.target.value.toUpperCase() })}
                className={`${inputCls} uppercase`}
                maxLength={2}
              />
            </Field>
            <Field label="Country name">
              <input value={form.countryName} onChange={(e) => setForm({ ...form, countryName: e.target.value })} className={inputCls} />
            </Field>
            <Field label="Currency">
              <select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} className={inputCls}>
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="FX per 1 USD" hint="1 USD = this many major units">
              <input value={form.fx} onChange={(e) => setForm({ ...form, fx: e.target.value })} inputMode="decimal" className={inputCls} />
            </Field>
            <Field label="Standard fee" hint="Charged below threshold">
              <input value={form.shippingFee} onChange={(e) => setForm({ ...form, shippingFee: e.target.value })} inputMode="decimal" className={inputCls} />
            </Field>
            <Field label="Priority fee">
              <input value={form.priorityFee} onChange={(e) => setForm({ ...form, priorityFee: e.target.value })} inputMode="decimal" className={inputCls} />
            </Field>
            <Field label="Free threshold" hint="Subtotal after discount">
              <input value={form.freeThreshold} onChange={(e) => setForm({ ...form, freeThreshold: e.target.value })} inputMode="decimal" className={inputCls} />
            </Field>
            <Field label="Tax %" >
              <input value={form.taxPct} onChange={(e) => setForm({ ...form, taxPct: e.target.value })} inputMode="decimal" className={inputCls} />
            </Field>
            <label className="flex items-end gap-2 pb-2 text-xs text-charcoal">
              <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} className="h-4 w-4 accent-[#F45B50]" />
              Accepting orders
            </label>
          </div>
          <div className="mt-4 flex gap-2">
            <AdminButton variant="coral" disabled={saving || !form.countryCode.trim() || !form.countryName.trim()} onClick={() => void save()}>
              Save zone
            </AdminButton>
            <AdminButton variant="ghost" onClick={() => setEditing(null)}>
              Cancel
            </AdminButton>
          </div>
        </section>
      ) : null}

      {zones ? (
        <div className="overflow-x-auto rounded-2xl border border-neutral-200/60 bg-white">
          <table className="w-full min-w-[860px]">
            <thead className="border-b border-neutral-100 bg-surface-muted/60">
              <tr>
                <Th>Country</Th>
                <Th>Currency</Th>
                <Th className="text-right">FX / USD</Th>
                <Th className="text-right">Std fee</Th>
                <Th className="text-right">Priority</Th>
                <Th className="text-right">Free over</Th>
                <Th className="text-right">Tax</Th>
                <Th className="text-center">State</Th>
                <Th className="text-right">Edit</Th>
              </tr>
            </thead>
            <tbody>
              {zones.map((z) => (
                <tr key={z.countryCode} className="border-b border-neutral-50 last:border-0 hover:bg-surface-muted/40">
                  <Td>
                    <span className="font-display text-xs font-bold text-charcoal">{z.countryName}</span>
                    <span className="ml-2 rounded bg-surface-muted px-1.5 py-0.5 font-display text-[9px] font-bold text-charcoal-muted">
                      {z.countryCode}
                    </span>
                  </Td>
                  <Td>
                    <span className="font-display text-xs font-bold text-charcoal">{z.currency}</span>
                  </Td>
                  <Td className="text-right text-xs text-charcoal-muted">{z.fxFromUsd}</Td>
                  <Td className="text-right text-xs">{formatMoney(z.shippingFeeMinor, z.currency)}</Td>
                  <Td className="text-right text-xs">{formatMoney(z.priorityFeeMinor, z.currency)}</Td>
                  <Td className="text-right text-xs">{formatMoney(z.freeThresholdMinor, z.currency)}</Td>
                  <Td className="text-right text-xs">{z.taxBps / 100}%</Td>
                  <Td className="text-center">
                    <button type="button" onClick={() => void toggleActive(z)}>
                      <StatusChip
                        label={z.active ? "Active" : "Off"}
                        tone={z.active ? "bg-jade-tint text-jade-deep" : "bg-surface-muted text-charcoal-muted"}
                      />
                    </button>
                  </Td>
                  <Td className="text-right">
                    <AdminButton variant="ghost" onClick={() => startEdit(z)}>
                      Edit
                    </AdminButton>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Spinner label="Loading zones" />
      )}
    </div>
  );
}
