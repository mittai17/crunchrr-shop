"use client";

/**
 * Inventory — every SKU's stock at a glance: low-stock triage, inline
 * restock, vendor assignment. Reads GET /api/admin/variants, edits via
 * PATCH /api/admin/variants/:id.
 */
import { useCallback, useEffect, useState } from "react";
import { useAdminApi } from "@/components/admin/chrome";
import { AdminButton, ErrorNote, Spinner, StatusChip, Td, Th } from "@/components/admin/ui";
import { PARTNER_IDS } from "@/lib/admin-client";

type VariantRow = {
  id: string;
  sku: string;
  productName: string;
  colorway: string;
  size: string;
  stock: number;
  priceMinor: number;
  partnerId: string;
  active: boolean;
};

type VariantsData = {
  variants: VariantRow[];
  stats: { skus: number; totalStock: number; lowCount: number; outOfStock: number };
};

export default function AdminInventoryPage() {
  const api = useAdminApi();
  const [data, setData] = useState<VariantsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [lowOnly, setLowOnly] = useState(false);
  const [restock, setRestock] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(() => {
    void api
      .get<VariantsData>(`/api/admin/variants?q=${encodeURIComponent(q)}&lowStock=${lowOnly}`)
      .then(setData)
      .catch((e: Error) => setError(e.message));
  }, [api, q, lowOnly]);
  useEffect(() => {
    load();
  }, [load]);

  const patch = async (id: string, body: Record<string, unknown>, label: string) => {
    setBusyId(id);
    setError(null);
    setNote(null);
    try {
      await api.patch(`/api/admin/variants/${id}`, body);
      setNote(label);
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  const setVendor = (id: string, partnerId: string) => void patch(id, { partnerId }, `Vendor set to ${partnerId}.`);

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <span className="material-symbols-outlined text-lg text-brand">inventory_2</span>
            <span className="font-display text-[10px] font-bold uppercase tracking-[0.22em] text-charcoal-light">
              Stock Control
            </span>
          </div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-charcoal">Inventory</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search SKU, product, colorway…"
            className="w-56 rounded-xl border border-neutral-200/80 bg-white px-3 py-2 text-sm outline-none focus:border-charcoal/40"
          />
          <button
            type="button"
            onClick={() => setLowOnly((v) => !v)}
            className={`flex items-center gap-2 rounded-full border px-4 py-2 font-display text-[10px] font-bold uppercase tracking-wider transition-colors ${
              lowOnly ? "border-coral bg-coral/10 text-coral" : "border-neutral-200/60 bg-white text-charcoal-muted"
            }`}
          >
            <span className={`h-2 w-2 rounded-full ${lowOnly ? "bg-coral" : "bg-neutral-300"}`} />
            Low stock ≤ 5
          </button>
        </div>
      </header>

      {error ? <ErrorNote message={error} /> : null}
      {note ? (
        <p className="rounded-xl border border-jade/30 bg-jade/10 px-3 py-2 text-xs font-bold text-jade">{note}</p>
      ) : null}
      {!data && !error ? <Spinner label="Weighing the stockroom" /> : null}

      {data ? (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <div className="card3d rounded-2xl border border-neutral-200/60 bg-white p-4 shadow-card">
              <p className="font-display text-[10px] font-bold uppercase tracking-wider text-charcoal-light">SKUs tracked</p>
              <p className="mt-1 font-display text-2xl font-bold text-charcoal">{data.stats.skus}</p>
            </div>
            <div className="card3d rounded-2xl border border-neutral-200/60 bg-white p-4 shadow-card">
              <p className="font-display text-[10px] font-bold uppercase tracking-wider text-charcoal-light">Units on hand</p>
              <p className="mt-1 font-display text-2xl font-bold text-charcoal">{data.stats.totalStock}</p>
            </div>
            <div className="card3d rounded-2xl border border-neutral-200/60 bg-white p-4 shadow-card">
              <p className="font-display text-[10px] font-bold uppercase tracking-wider text-charcoal-light">Low stock</p>
              <p className={`mt-1 font-display text-2xl font-bold ${data.stats.lowCount > 0 ? "text-coral" : "text-charcoal"}`}>
                {data.stats.lowCount}
              </p>
            </div>
            <div className="card3d rounded-2xl border border-neutral-200/60 bg-white p-4 shadow-card">
              <p className="font-display text-[10px] font-bold uppercase tracking-wider text-charcoal-light">Out of stock</p>
              <p className={`mt-1 font-display text-2xl font-bold ${data.stats.outOfStock > 0 ? "text-coral" : "text-charcoal"}`}>
                {data.stats.outOfStock}
              </p>
            </div>
          </div>

          <section className="overflow-x-auto rounded-2xl border border-neutral-200/60 bg-white shadow-card">
            <table className="w-full min-w-[820px]">
              <thead className="border-b border-neutral-100 bg-surface-muted/60">
                <tr>
                  <Th>SKU</Th>
                  <Th>Vendor</Th>
                  <Th>Stock</Th>
                  <Th>Price</Th>
                  <Th>Status</Th>
                  <Th className="text-right">Restock</Th>
                </tr>
              </thead>
              <tbody>
                {data.variants.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-8 text-center text-xs text-charcoal-muted">
                      No SKUs match.
                    </td>
                  </tr>
                ) : (
                  data.variants.map((v) => {
                    const low = v.stock <= 5;
                    return (
                      <tr key={v.id} className="border-b border-neutral-50 last:border-0 transition-colors hover:bg-surface-muted/40">
                        <Td>
                          <span className="font-display text-xs font-bold text-charcoal">{v.sku}</span>
                          <span className="block text-[10px] text-charcoal-muted">
                            {v.productName} · {v.colorway} · {v.size}
                          </span>
                        </Td>
                        <Td>
                          <select
                            value={v.partnerId}
                            onChange={(e) => setVendor(v.id, e.target.value)}
                            className="rounded-full border border-neutral-200/80 bg-white px-2 py-1 font-display text-[10px] font-bold text-charcoal focus:border-brand focus:outline-none"
                          >
                            {PARTNER_IDS.map((p) => (
                              <option key={p} value={p}>
                                {p}
                              </option>
                            ))}
                          </select>
                        </Td>
                        <Td>
                          <span className={`font-display text-sm font-bold ${low ? "text-coral" : "text-charcoal"}`}>
                            {v.stock}
                          </span>
                          {low && v.stock > 0 ? <span className="ml-1 text-[10px] text-coral">low</span> : null}
                        </Td>
                        <Td>{formatUsd(v.priceMinor)}</Td>
                        <Td>
                          <StatusChip label={v.active ? "ACTIVE" : "PAUSED"} />
                        </Td>
                        <Td className="text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <input
                              value={restock[v.id] ?? ""}
                              onChange={(e) => setRestock((d) => ({ ...d, [v.id]: e.target.value }))}
                              inputMode="numeric"
                              placeholder={`+qty`}
                              className="w-16 rounded-full border border-neutral-200/80 px-2 py-1 text-xs outline-none focus:border-charcoal/40"
                            />
                            <AdminButton
                              disabled={busyId === v.id || !restock[v.id]}
                              onClick={() =>
                                void patch(
                                  v.id,
                                  { stock: v.stock + Math.max(0, Number(restock[v.id] || 0)) },
                                  `Restocked ${v.sku} → ${v.stock + Number(restock[v.id] || 0)} units.`,
                                )
                              }
                            >
                              {busyId === v.id ? "…" : "Add"}
                            </AdminButton>
                          </div>
                        </Td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </section>
        </>
      ) : null}
    </div>
  );
}

function formatUsd(minor: number): string {
  return `$${(minor / 100).toFixed(2)}`;
}
