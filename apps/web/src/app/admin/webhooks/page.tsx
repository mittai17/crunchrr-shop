"use client";

/**
 * Webhook audit — every delivery archived by the API, with outcome chips
 * and expandable raw payloads. The malformation-proofing record.
 */
import { useCallback, useEffect, useState, Fragment } from "react";
import { useAdminApi } from "@/components/admin/chrome";
import { AdminButton, ErrorNote, Spinner, StatusChip, Td, Th } from "@/components/admin/ui";
import type { WebhookList } from "@/lib/admin-client";

const TABS = ["ALL", "OK", "PROCESSED", "DUPLICATE", "IGNORED", "INVALID_SIGNATURE", "ERROR"] as const;

export default function AdminWebhooksPage() {
  const api = useAdminApi();
  const [data, setData] = useState<WebhookList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<string>("ALL");
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(() => {
    const params = new URLSearchParams();
    if (outcome !== "ALL") params.set("outcome", outcome);
    void api
      .get<WebhookList>(`/api/admin/webhooks?${params}`)
      .then(setData)
      .catch((e: Error) => setError(e.message));
  }, [api, outcome]);

  useEffect(() => {
    load();
  }, [load]);

  const rowById = (id: string) => data?.rows.find((r) => r.id === id);

  return (
    <div className="space-y-5">
      <header>
        <div className="mb-1 flex items-center gap-2">
          <span className="material-symbols-outlined text-lg text-brand">webhook</span>
          <span className="font-display text-[10px] font-bold uppercase tracking-[0.22em] text-charcoal-light">
            Payment gates
          </span>
        </div>
        <h1 className="font-display text-3xl font-bold tracking-tight text-charcoal">
          Webhook Audit
        </h1>
        <p className="mt-1 max-w-xl text-xs text-charcoal-muted">
          Persist-first ingest: every payload is archived before processing, so
          this is the source of truth for disputed deliveries.
        </p>
      </header>

      <div className="flex flex-wrap gap-1.5">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setOutcome(t)}
            className={`rounded-full border px-3 py-1.5 font-display text-[10px] font-bold uppercase tracking-wider transition-colors ${
              outcome === t
                ? "border-charcoal bg-charcoal text-canvas"
                : "border-neutral-200/60 bg-white text-charcoal-muted hover:text-charcoal"
            }`}
          >
            {t === "ALL" ? "All" : t.replace(/_/g, " ").toLowerCase()}
          </button>
        ))}
      </div>

      {error ? <ErrorNote message={error} /> : null}
      {!data && !error ? <Spinner label="Loading audit log" /> : null}

      {data ? (
        <div className="overflow-hidden rounded-2xl border border-neutral-200/60 bg-white">
          <table className="w-full">
            <thead className="border-b border-neutral-100 bg-surface-muted/60">
              <tr>
                <Th>Provider</Th>
                <Th>Event</Th>
                <Th>Outcome</Th>
                <Th>Received</Th>
                <Th className="text-right">Payload</Th>
              </tr>
            </thead>
            <tbody>
              {data.webhooks.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-10 text-center text-xs text-charcoal-muted">
                    No deliveries match this filter.
                  </td>
                </tr>
              ) : (
                data.webhooks.map((w) => {
                  const row = rowById(w.id);
                  const open = openId === w.id;
                  return (
                    <Fragment key={w.id}>
                      <tr className="border-b border-neutral-50 hover:bg-surface-muted/40">
                        <Td>
                          <span className="font-display text-[11px] font-bold uppercase text-charcoal">
                            {w.provider.toLowerCase()}
                          </span>
                        </Td>
                        <Td>
                          <span className="text-xs text-charcoal">{w.event ?? "—"}</span>
                        </Td>
                        <Td>
                          <StatusChip label={w.outcome} />
                        </Td>
                        <Td>
                          <span className="text-[11px] text-charcoal-muted">
                            {new Date(w.createdAt).toLocaleString()}
                          </span>
                        </Td>
                        <Td className="text-right">
                          {row ? (
                            <AdminButton variant="ghost" onClick={() => setOpenId(open ? null : w.id)}>
                              {open ? "Hide" : "View"}
                            </AdminButton>
                          ) : null}
                        </Td>
                      </tr>
                      {open && row ? (
                        <tr className="bg-charcoal/95">
                          <td colSpan={5} className="px-4 py-3">
                            <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all font-mono text-[10px] leading-relaxed text-canvas/80">
                              {JSON.stringify(row.payload, null, 2)}
                              {row.errorText ? `\n\nERROR: ${row.errorText}` : ""}
                            </pre>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
