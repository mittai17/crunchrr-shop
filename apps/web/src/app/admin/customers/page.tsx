"use client";

/**
 * Customers — everyone who has ever ordered, grouped by email, with
 * order counts, countries and LTV (fx-normalized USD). Read-only.
 */
import { useCallback, useEffect, useState } from "react";
import { useAdminApi } from "@/components/admin/chrome";
import { ErrorNote, Spinner, Td, Th } from "@/components/admin/ui";

type CustomerRow = {
  email: string;
  name: string;
  orders: number;
  grandMinor: number;
  currency: string;
  country: string;
  firstAt: string;
  lastAt: string;
  ltvUsd: number;
};

function timeAgo(iso: string): string {
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 2_592_000) return `${Math.floor(s / 86400)}d ago`;
  return new Date(iso).toLocaleDateString();
}

export default function AdminCustomersPage() {
  const api = useAdminApi();
  const [rows, setRows] = useState<CustomerRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");

  const load = useCallback(() => {
    void api
      .get<{ customers: CustomerRow[] }>("/api/admin/customers")
      .then((r) => setRows(r.customers))
      .catch((e: Error) => setError(e.message));
  }, [api]);
  useEffect(() => {
    load();
  }, [load]);

  const filtered = (rows ?? []).filter((r) =>
    q ? r.email.toLowerCase().includes(q.toLowerCase()) || r.name.toLowerCase().includes(q.toLowerCase()) : true,
  );
  const topLtv = (rows ?? []).reduce((m, r) => Math.max(m, r.ltvUsd), 0);

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <span className="material-symbols-outlined text-lg text-brand">diversity_3</span>
            <span className="font-display text-[10px] font-bold uppercase tracking-[0.22em] text-charcoal-light">
              Customer Book
            </span>
          </div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-charcoal">Customers</h1>
        </div>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name or email…"
          className="w-56 rounded-xl border border-neutral-200/80 bg-white px-3 py-2 text-sm outline-none focus:border-charcoal/40"
        />
      </header>

      {error ? <ErrorNote message={error} /> : null}
      {!rows && !error ? <Spinner label="Opening the ledger" /> : null}

      {rows ? (
        <section className="overflow-x-auto rounded-2xl border border-neutral-200/60 bg-white shadow-card">
          <table className="w-full min-w-[760px]">
            <thead className="border-b border-neutral-100 bg-surface-muted/60">
              <tr>
                <Th>Customer</Th>
                <Th>Country</Th>
                <Th>Orders</Th>
                <Th>Lifetime value</Th>
                <Th>Last order</Th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-center text-xs text-charcoal-muted">
                    No customers yet.
                  </td>
                </tr>
              ) : (
                filtered.map((c) => (
                  <tr key={c.email} className="border-b border-neutral-50 last:border-0 transition-colors hover:bg-surface-muted/40">
                    <Td>
                      <span className="font-display text-xs font-bold text-charcoal">{c.name}</span>
                      <span className="block text-[10px] text-charcoal-muted">{c.email}</span>
                    </Td>
                    <Td>{c.country}</Td>
                    <Td className="font-display text-xs font-bold">×{c.orders}</Td>
                    <Td>
                      <div className="flex items-center gap-2">
                        <span className="font-display text-xs font-bold text-jade">${(c.ltvUsd / 100).toFixed(2)}</span>
                        <span className="text-[10px] text-charcoal-light">({c.currency} {c.grandMinor})</span>
                        <span
                          className="h-1.5 rounded-full bg-brand"
                          style={{ width: `${Math.max((c.ltvUsd / Math.max(topLtv, 1)) * 72, 4)}px` }}
                        />
                      </div>
                    </Td>
                    <Td>{timeAgo(c.lastAt)}</Td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </section>
      ) : null}
    </div>
  );
}
