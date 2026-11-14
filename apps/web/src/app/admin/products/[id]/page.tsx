"use client";

/**
 * Product editor — copy fields, live/featured toggles, and the full
 * variant matrix (price, stock, partner routing, cost).
 */
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useAdminApi } from "@/components/admin/chrome";
import { AdminButton, ErrorNote, Field, inputCls, Spinner, StatusChip } from "@/components/admin/ui";
import { formatUsd } from "@/lib/utils";

import { PARTNER_IDS, type AdminProductDetail } from "@/lib/admin-client";

export default function AdminProductEditPage() {
  const { id } = useParams<{ id: string }>();
  const api = useAdminApi();
  const [data, setData] = useState<AdminProductDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [form, setForm] = useState({
    name: "",
    tagline: "",
    description: "",
    gsmLabel: "",
    fabricLabel: "",
    badgeText: "",
    active: false,
    featured: false,
  });

  useEffect(() => {
    void api
      .get<AdminProductDetail>(`/api/admin/products/${id}`)
      .then((d) => {
        setData(d);
        setForm({
          name: d.product.name,
          tagline: d.product.tagline ?? "",
          description: d.product.description ?? "",
          gsmLabel: d.product.gsmLabel ?? "",
          fabricLabel: d.product.fabricLabel ?? "",
          badgeText: d.product.badgeText ?? "",
          active: d.product.active,
          featured: d.product.featured,
        });
      })
      .catch((e: Error) => setError(e.message));
  }, [api, id]);

  const saveProduct = async () => {
    setBusy(true);
    setError(null);
    setSavedMsg(null);
    try {
      await api.patch(`/api/admin/products/${id}`, {
        name: form.name,
        tagline: form.tagline,
        description: form.description,
        gsmLabel: form.gsmLabel,
        fabricLabel: form.fabricLabel,
        badgeText: form.badgeText || null,
        active: form.active,
        featured: form.featured,
      });
      setSavedMsg("Product saved.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const saveVariant = async (
    variantId: string,
    patch: { priceMinor?: number; stock?: number; partnerId?: string; active?: boolean },
  ) => {
    setBusy(true);
    setError(null);
    setSavedMsg(null);
    try {
      await api.patch(`/api/admin/variants/${variantId}`, patch);
      const d = await api.get<AdminProductDetail>(`/api/admin/products/${id}`);
      setData(d);
      setSavedMsg("Variant updated.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (error && !data) return <ErrorNote message={error} />;
  if (!data) return <Spinner label="Loading product" />;

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link
            href="/admin/products"
            className="mb-1 inline-flex items-center gap-1 font-display text-[10px] font-bold uppercase tracking-wider text-charcoal-light hover:text-brand"
          >
            <span className="material-symbols-outlined text-sm">arrow_back</span> Catalog
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="font-display text-2xl font-bold tracking-tight text-charcoal">
              {data.product.name}
            </h1>
            <StatusChip label={data.product.active ? "Live" : "Draft"} tone={data.product.active ? "bg-jade-tint text-jade-deep" : "bg-surface-muted text-charcoal-muted"} />
          </div>
          <span className="text-[11px] text-charcoal-muted">
            /{data.product.slug} · {data.variants.length} SKUs · {data.product.totalStock} units
          </span>
        </div>
        {savedMsg ? (
          <span className="rounded-full bg-jade-tint px-3 py-1.5 font-display text-[10px] font-bold uppercase tracking-wider text-jade-deep">
            {savedMsg}
          </span>
        ) : null}
      </header>

      {error ? <ErrorNote message={error} /> : null}

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Copy */}
        <section className="rounded-2xl border border-neutral-200/60 bg-white p-5">
          <h2 className="mb-4 font-display text-xs font-bold uppercase tracking-[0.16em] text-charcoal-light">
            Product copy
          </h2>
          <div className="space-y-3">
            <Field label="Name">
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputCls} />
            </Field>
            <Field label="Tagline">
              <input value={form.tagline} onChange={(e) => setForm({ ...form, tagline: e.target.value })} className={inputCls} />
            </Field>
            <Field label="Description">
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={4}
                className={inputCls}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="GSM label">
                <input value={form.gsmLabel} onChange={(e) => setForm({ ...form, gsmLabel: e.target.value })} className={inputCls} />
              </Field>
              <Field label="Fabric label">
                <input value={form.fabricLabel} onChange={(e) => setForm({ ...form, fabricLabel: e.target.value })} className={inputCls} />
              </Field>
            </div>
            <Field label="Badge" hint="Empty = no badge. Renders as a coral chip.">
              <input value={form.badgeText} onChange={(e) => setForm({ ...form, badgeText: e.target.value })} className={inputCls} placeholder="Drop Exclusive" />
            </Field>
            <div className="flex gap-6">
              <label className="flex items-center gap-2 text-xs text-charcoal">
                <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} className="h-4 w-4 accent-[#F45B50]" />
                Live on storefront
              </label>
              <label className="flex items-center gap-2 text-xs text-charcoal">
                <input type="checkbox" checked={form.featured} onChange={(e) => setForm({ ...form, featured: e.target.checked })} className="h-4 w-4 accent-[#F45B50]" />
                Featured
              </label>
            </div>
            <AdminButton variant="coral" disabled={busy} onClick={() => void saveProduct()}>
              Save product
            </AdminButton>
          </div>
        </section>

        {/* Variants */}
        <section className="rounded-2xl border border-neutral-200/60 bg-white p-5">
          <h2 className="mb-4 font-display text-xs font-bold uppercase tracking-[0.16em] text-charcoal-light">
            Variant matrix
          </h2>
          <div className="space-y-3">
            {data.variants.map((v) => (
              <VariantRow key={v.id} v={v} busy={busy} onSave={saveVariant} />
            ))}
          </div>
          <p className="mt-4 text-[10px] leading-relaxed text-charcoal-light">
            Prices are base USD (converted per country at checkout). Partner cost
            stays in the vendor&apos;s billing currency.
          </p>
        </section>
      </div>
    </div>
  );
}

function VariantRow({
  v,
  busy,
  onSave,
}: {
  v: AdminProductDetail["variants"][number];
  busy: boolean;
  onSave: (id: string, patch: { priceMinor?: number; stock?: number; partnerId?: string; active?: boolean }) => Promise<void>;
}) {
  const [price, setPrice] = useState(String(v.priceMinor / 100));
  const [stock, setStock] = useState(String(v.stock));
  const [partner, setPartner] = useState(v.partnerId);
  const dirty = Number(price) * 100 !== v.priceMinor || Number(stock) !== v.stock || partner !== v.partnerId;

  return (
    <div className="rounded-xl border border-neutral-100 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="h-4 w-4 shrink-0 rounded-full border border-neutral-200" style={{ backgroundColor: v.colorHex }} />
          <span className="truncate font-display text-xs font-bold text-charcoal">
            {v.colorway} · {v.size}
          </span>
        </div>
        <span className="shrink-0 font-display text-[9px] font-bold uppercase tracking-wider text-charcoal-light">
          {v.sku}
        </span>
      </div>
      <div className="grid grid-cols-[1fr_1fr_1.2fr_auto] items-end gap-2">
        <Field label="Price $">
          <input
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            inputMode="decimal"
            className={`${inputCls} px-2 py-1.5 text-xs`}
          />
        </Field>
        <Field label="Stock">
          <input
            value={stock}
            onChange={(e) => setStock(e.target.value)}
            inputMode="numeric"
            className={`${inputCls} px-2 py-1.5 text-xs`}
          />
        </Field>
        <Field label="Vendor">
          <select
            value={partner}
            onChange={(e) => setPartner(e.target.value)}
            className={`${inputCls} px-2 py-1.5 text-xs`}
          >
            {PARTNER_IDS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </Field>
        <AdminButton
          disabled={busy || !dirty}
          onClick={() =>
            void onSave(v.id, {
              priceMinor: Math.round(Number(price) * 100),
              stock: Math.max(0, Number(stock) || 0),
              partnerId: partner,
            })
          }
        >
          Save
        </AdminButton>
      </div>
      <p className="mt-1 text-[10px] text-charcoal-light">
        Cost {formatUsd(v.partnerCostMinor)} · {v.active ? "active" : "inactive"}
      </p>
    </div>
  );
}
