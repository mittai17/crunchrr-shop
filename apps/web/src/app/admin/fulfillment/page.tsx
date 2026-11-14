"use client";

/**
 * Fulfillment queue — every partner split with dispatch/retry controls.
 */
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useAdminApi } from "@/components/admin/chrome";
import { AdminButton, ErrorNote, Spinner, StatusChip, Td, Th } from "@/components/admin/ui";
import type { SplitList } from "@/lib/admin-client";

const TABS = [
  "ALL",
  "PENDING",
  "SENT_TO_PARTNER",
  "ACCEPTED_BY_PARTNER",
  "REJECTED_BY_PARTNER",
  "SHIPPED",
  "DELIVERED",
  "CANCELLED",
] as const;

export default function AdminFulfillmentPage() {
  const api = useAdminApi();
  const [data, setData] = useState<SplitList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("ALL");
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(() => {
    const params = new URLSearchParams();
    if (status !== "ALL") params.set("status", status);
    void api
      .get<SplitList>(`/api/admin/splits?${params}`)
      .then(setData)
      .catch((e: Error) => setError(e.message));
  }, [api, status]);

  useEffect(() => {
    load();
  }, [load]);

  const redispatch = async (id: string) => {
    setBusyId(id);
    setError(null);
    try {
      await api.post(`/api/admin/splits/${id}/dispatch`);
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  const markStatus = async (id: string, next: string) => {
    setBusyId(id);
    setError(null);
    try {
      await api.patch(`/api/admin/splits/${id}/status`, { status: next });
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-5">
      <header>
        <div className="mb-1 flex items-center gap-2">
          <span className="material-symbols-outlined text-lg text-brand">local_shipping</span>
          <span className="font-display text-[10px] font-bold uppercase tracking-[0.22em] text-charcoal-light">
            Multi-vendor ops
          </span>
        </div>
        <h1 className="font-display text-3xl font-bold tracking-tight text-charcoal">
          Fulfillment Queue
        </h1>
      </header>

      <div className="flex flex-wrap gap-1.5">
        {TABS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatus(s)}
            className={`rounded-full border px-3 py-1.5 font-display text-[10px] font-bold uppercase tracking-wider transition-colors ${
              status === s
                ? "border-charcoal bg-charcoal text-canvas"
                : "border-neutral-200/60 bg-white text-charcoal-muted hover:text-charcoal"
            }`}
          >
            {s === "ALL" ? "All" : s.replace(/_/g, " ").toLowerCase()}
          </button>
        ))}
      </div>

      {error ? <ErrorNote message={error} /> : null}
      {!data && !error ? <Spinner label="Loading splits" /> : null}

      {data ? (
        <div className="overflow-x-auto rounded-2xl border border-neutral-200/60 bg-white">
          <table className="w-full min-w-[760px]">
            <thead className="border-b border-neutral-100 bg-surface-muted/60">
              <tr>
                <Th>Order</Th>
                <Th>Vendor</Th>
                <Th>Status</Th>
                <Th>Partner ref</Th>
                <Th>Items</Th>
                <Th className="text-right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {data.splits.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-10 text-center text-xs text-charcoal-muted">
                    Nothing in this bucket.
                  </td>
                </tr>
              ) : (
                data.splits.map((s) => (
                  <tr key={s.id} className="border-b border-neutral-50 last:border-0 hover:bg-surface-muted/40">
                    <Td>
                      <Link
                        href={`/admin/orders/${s.orderId}`}
                        className="font-display text-xs font-bold text-charcoal hover:text-brand"
                      >
                        {s.orderNumber}
                      </Link>
                      <span className="block text-[10px] text-charcoal-muted">
                        {new Date(s.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                      </span>
                    </Td>
                    <Td>
                      <span className="font-display text-[11px] font-bold uppercase text-charcoal">
                        {s.partnerId.toLowerCase()}
                      </span>
                    </Td>
                    <Td>
                      <StatusChip label={s.status} />
                    </Td>
                    <Td>
                      <span className="text-[10px] text-charcoal-muted">
                        {s.partnerOrderId ? `#${s.partnerOrderId}` : "—"}
                      </span>
                    </Td>
                    <Td>
                      <span className="text-xs text-charcoal">{s.previewLine}</span>
                      <span className="block text-[10px] text-charcoal-muted">×{s.itemCount} units</span>
                    </Td>
                    <Td className="text-right">
                      <div className="flex justify-end gap-1.5">
                        {s.status === "REJECTED_BY_PARTNER" || s.status === "PENDING" ? (
                          <AdminButton
                            variant="coral"
                            disabled={busyId === s.id}
                            onClick={() => void redispatch(s.id)}
                          >
                            {busyId === s.id ? "…" : "Dispatch"}
                          </AdminButton>
                        ) : null}
                        {s.status === "ACCEPTED_BY_PARTNER" || s.status === "SENT_TO_PARTNER" ? (
                          <AdminButton disabled={busyId === s.id} onClick={() => void markStatus(s.id, "SHIPPED")}>
                            Mark shipped
                          </AdminButton>
                        ) : null}
                        {s.status === "SHIPPED" ? (
                          <AdminButton disabled={busyId === s.id} onClick={() => void markStatus(s.id, "DELIVERED")}>
                            Delivered
                          </AdminButton>
                        ) : null}
                      </div>
                    </Td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
