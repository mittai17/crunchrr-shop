"use client";

/**
 * Catalog — product table with stock/vendor coverage; edit → detail page.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useAdminApi } from "@/components/admin/chrome";
import { AdminButton, ErrorNote, Spinner, StatusChip, Td, Th } from "@/components/admin/ui";
import { formatUsd } from "@/lib/utils";
import type { AdminProductRow } from "@/lib/admin-client";

export default function AdminProductsPage() {
  const api = useAdminApi();
  const router = useRouter();
  const [rows, setRows] = useState<AdminProductRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(() => {
    void api
      .get<{ products: AdminProductRow[] }>(`/api/admin/products${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ""}`)
      .then((r) => setRows(r.products))
      .catch((e: Error) => setError(e.message));
  }, [api, q]);

  useEffect(() => {
    const t = setTimeout(load, q ? 250 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  const toggle = async (p: AdminProductRow, field: "active" | "featured") => {
    setBusyId(p.id);
    try {
      await api.patch(`/api/admin/products/${p.id}`, { [field]: !p[field] });
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <span className="material-symbols-outlined text-lg text-brand">checkroom</span>
            <span className="font-display text-[10px] font-bold uppercase tracking-[0.22em] text-charcoal-light">
              Catalog
            </span>
          </div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-charcoal">Products</h1>
        </div>
        <div className="flex items-center gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search products…"
            className="w-52 rounded-xl border border-neutral-200/80 bg-white px-3 py-2 text-sm outline-none focus:border-charcoal/40"
          />
          <a
            href={`${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4001"}/api/admin/export/products.csv`}
            target="_blank"
            rel="noreferrer"
            className="rounded-xl border border-neutral-200/80 bg-white px-3 py-2 font-display text-[10px] font-bold uppercase tracking-wider text-charcoal hover:border-brand hover:text-brand"
          >
            CSV
          </a>
          <AdminButton variant="coral" onClick={() => router.push("/admin/products/new")}>
            + New product
          </AdminButton>
        </div>
      </header>

      {error ? <ErrorNote message={error} /> : null}
      {!rows && !error ? <Spinner label="Loading catalog" /> : null}

      {rows ? (
        <div className="overflow-x-auto rounded-2xl border border-neutral-200/60 bg-white">
          <table className="w-full min-w-[820px]">
            <thead className="border-b border-neutral-100 bg-surface-muted/60">
              <tr>
                <Th>Product</Th>
                <Th>Vendors</Th>
                <Th className="text-right">Price</Th>
                <Th className="text-right">Stock</Th>
                <Th className="text-center">Live</Th>
                <Th className="text-center">Featured</Th>
                <Th className="text-right">Edit</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id} className="border-b border-neutral-50 last:border-0 hover:bg-surface-muted/40">
                  <Td>
                    <div className="flex items-center gap-3">
                      <span className="h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-surface-muted">
                        {p.image ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={p.image} alt={p.name} className="h-full w-full object-cover" />
                        ) : null}
                      </span>
                      <span className="min-w-0">
                        <Link
                          href={`/admin/products/${p.id}`}
                          className="block max-w-52 truncate font-display text-xs font-bold text-charcoal hover:text-brand"
                        >
                          {p.name}
                        </Link>
                        <span className="block text-[10px] text-charcoal-muted">
                          {p.category} · {p.collection} · {p.variantCount} SKUs
                        </span>
                      </span>
                    </div>
                  </Td>
                  <Td>
                    <span className="text-[10px] uppercase tracking-wider text-charcoal-muted">
                      {p.partners.join(" · ") || "—"}
                    </span>
                  </Td>
                  <Td className="text-right font-display text-xs font-bold text-charcoal">
                    {formatUsd(p.priceMinMinor)}
                    {p.priceMaxMinor !== p.priceMinMinor ? `–${formatUsd(p.priceMaxMinor)}` : ""}
                  </Td>
                  <Td className="text-right">
                    <StatusChip
                      label={`${p.totalStock}`}
                      tone={p.totalStock === 0 ? "bg-error-container text-error" : p.totalStock <= 8 ? "bg-brand/10 text-brand" : "bg-jade-tint text-jade-deep"}
                    />
                  </Td>
                  <Td className="text-center">
                    <input
                      type="checkbox"
                      checked={p.active}
                      disabled={busyId === p.id}
                      onChange={() => void toggle(p, "active")}
                      className="h-4 w-4 accent-[#F45B50]"
                    />
                  </Td>
                  <Td className="text-center">
                    <input
                      type="checkbox"
                      checked={p.featured}
                      disabled={busyId === p.id}
                      onChange={() => void toggle(p, "featured")}
                      className="h-4 w-4 accent-[#F45B50]"
                    />
                  </Td>
                  <Td className="text-right">
                    <Link
                      href={`/admin/products/${p.id}`}
                      className="inline-flex items-center gap-1 rounded-full bg-charcoal px-3 py-1.5 font-display text-[10px] font-bold uppercase tracking-wider text-canvas hover:bg-brand"
                    >
                      Edit
                    </Link>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
