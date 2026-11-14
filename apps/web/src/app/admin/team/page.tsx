"use client";

/**
 * Team — RBAC roster (OWNER/OPS/SUPPORT) + the admin action audit trail.
 * Role changes are OWNER-only (enforced server-side too).
 */
import { useCallback, useEffect, useState } from "react";
import { useAdminApi } from "@/components/admin/chrome";
import { AdminButton, ErrorNote, Spinner, StatusChip, Td, Th } from "@/components/admin/ui";
import type { TeamData } from "@/lib/admin-client";

const ROLES = ["OWNER", "OPS", "SUPPORT"] as const;

const ROLE_HELP: Record<string, string> = {
  OWNER: "Everything — credentials, zones, promos, team",
  OPS: "Fulfillment, catalog, discounts, refunds",
  SUPPORT: "Read-only + webhook inspection",
};

export default function AdminTeamPage() {
  const api = useAdminApi();
  const [data, setData] = useState<TeamData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(() => {
    void api
      .get<TeamData>("/api/admin/team")
      .then(setData)
      .catch((e: Error) => setError(e.message));
  }, [api]);
  useEffect(() => {
    load();
  }, [load]);

  const setRole = async (id: string, role: string) => {
    setError(null);
    setNote(null);
    try {
      await api.patch(`/api/admin/team/${id}`, { role });
      setNote(`Role updated to ${role}.`);
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="space-y-5">
      <header>
        <div className="mb-1 flex items-center gap-2">
          <span className="material-symbols-outlined text-lg text-brand">group</span>
          <span className="font-display text-[10px] font-bold uppercase tracking-[0.22em] text-charcoal-light">
            Access Control
          </span>
        </div>
        <h1 className="font-display text-3xl font-bold tracking-tight text-charcoal">Team & Audit</h1>
      </header>

      {error ? <ErrorNote message={error} /> : null}
      {note ? (
        <p className="rounded-xl border border-jade/30 bg-jade/10 px-3 py-2 text-xs font-bold text-jade">{note}</p>
      ) : null}
      {!data && !error ? <Spinner label="Loading roster" /> : null}

      {data ? (
        <>
          <section className="overflow-x-auto rounded-2xl border border-neutral-200/60 bg-white shadow-card">
            <table className="w-full min-w-[640px]">
              <thead className="border-b border-neutral-100 bg-surface-muted/60">
                <tr>
                  <Th>Member</Th>
                  <Th>Clerk id</Th>
                  <Th>Role</Th>
                  <Th>Status</Th>
                  <Th>Joined</Th>
                </tr>
              </thead>
              <tbody>
                {data.admins.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-8 text-center text-xs text-charcoal-muted">
                      No team rows yet — the allowlisted owner row is created on first admin request.
                    </td>
                  </tr>
                ) : (
                  data.admins.map((a) => (
                    <tr key={a.id} className="border-b border-neutral-50 last:border-0">
                      <Td>
                        <span className="font-display text-xs font-bold text-charcoal">{a.name}</span>
                        <span className="block text-[10px] text-charcoal-muted">{a.email}</span>
                      </Td>
                      <Td>
                        <span className="text-[10px] text-charcoal-muted">{a.clerkUserId.slice(0, 18)}…</span>
                      </Td>
                      <Td>
                        <select
                          value={a.role}
                          onChange={(e) => void setRole(a.id, e.target.value)}
                          className="rounded-full border border-neutral-200/80 bg-white px-2 py-1 font-display text-[10px] font-bold uppercase text-charcoal focus:border-brand focus:outline-none"
                        >
                          {ROLES.map((r) => (
                            <option key={r} value={r}>
                              {r}
                            </option>
                          ))}
                        </select>
                        <span className="mt-0.5 block text-[9px] text-charcoal-light">{ROLE_HELP[a.role]}</span>
                      </Td>
                      <Td>
                        <StatusChip label={a.active ? "ACTIVE" : "DISABLED"} />
                      </Td>
                      <Td>{new Date(a.createdAt).toLocaleDateString()}</Td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </section>

          <section className="overflow-x-auto rounded-2xl border border-neutral-200/60 bg-white shadow-card">
            <h2 className="border-b border-neutral-100 bg-surface-muted/60 px-3 py-2 font-display text-xs font-bold uppercase tracking-wider text-charcoal-light">
              Audit trail — every admin write, append-only
            </h2>
            <table className="w-full min-w-[640px]">
              <thead className="border-b border-neutral-100">
                <tr>
                  <Th>When</Th>
                  <Th>Actor</Th>
                  <Th>Action</Th>
                  <Th>Target</Th>
                  <Th>Detail</Th>
                </tr>
              </thead>
              <tbody>
                {data.audit.length === 0 ? (
                  <tr><td colSpan={6} className="px-3 py-8 text-center text-xs text-charcoal-muted">No admin actions recorded yet.</td></tr>
                ) : (
                  data.audit.map((row) => (
                    <tr key={row.id} className="border-b border-neutral-50 last:border-0">
                      <Td>{new Date(row.createdAt).toLocaleString()}</Td>
                      <Td className="font-display text-xs font-bold">{row.actorName}</Td>
                      <Td>
                        <StatusChip label={row.action} />
                      </Td>
                      <Td className="max-w-40 truncate text-[10px]">{row.target}</Td>
                      <Td className="max-w-52 truncate text-[10px] text-charcoal-muted">
                        {row.detail ? JSON.stringify(row.detail) : "—"}
                      </Td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </section>
        </>
      ) : null}
    </div>
  );
}
