"use client";

/**
 * Order detail — items, partner splits, audit events, and status controls.
 */
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useAdminApi } from "@/components/admin/chrome";
import { AdminButton, ErrorNote, Spinner, StatusChip } from "@/components/admin/ui";
import { formatMoney } from "@/lib/utils";
import type { AdminOrderDetail } from "@/lib/admin-client";

const TARGET_STATUSES = [
  "PAYMENT_CONFIRMED",
  "PARTNER_DISPATCHED",
  "SHIPPED",
  "DELIVERED",
  "CANCELLED",
  "REFUNDED",
] as const;

export default function AdminOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const api = useAdminApi();
  const [data, setData] = useState<AdminOrderDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  const load = () => {
    void api
      .get<AdminOrderDetail>(`/api/admin/orders/${id}`)
      .then(setData)
      .catch((e: Error) => setError(e.message));
  };
  useEffect(load, [api, id]);

  const setStatus = async (status: string) => {
    setBusy(true);
    try {
      if (status === "REFUNDED") {
        // Proper refund: restocks inventory + cancels open splits + audit.
        const reason = note.trim() || "Customer refund issued from admin panel";
        await api.post(`/api/admin/orders/${id}/refund`, { reason });
      } else {
        await api.patch(`/api/admin/orders/${id}/status`, { status, note: note.trim() || undefined });
      }
      setNote("");
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (error && !data) return <ErrorNote message={error} />;
  if (!data) return <Spinner label="Loading order" />;

  const { order, events } = data;
  const o = order;

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link
            href="/admin/orders"
            className="mb-1 inline-flex items-center gap-1 font-display text-[10px] font-bold uppercase tracking-wider text-charcoal-light hover:text-brand"
          >
            <span className="material-symbols-outlined text-sm">arrow_back</span> Orders
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="font-display text-2xl font-bold tracking-tight text-charcoal">
              {o.orderNumber}
            </h1>
            <StatusChip label={o.status} />
          </div>
        </div>
        <div className="text-right">
          <span className="block font-display text-2xl font-bold text-charcoal">
            {formatMoney(o.totals.grandTotalMinor, o.totals.currency)}
          </span>
          <span className="text-[11px] text-charcoal-muted">
            {o.paymentProvider?.toLowerCase() ?? "—"}
            {o.paymentRef ? ` · ${o.paymentRef}` : ""}
          </span>
        </div>
      </header>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Left: items + splits + events */}
        <div className="space-y-5 lg:col-span-2">
          {/* Items */}
          <section className="rounded-2xl border border-neutral-200/60 bg-white p-5">
            <h2 className="mb-3 font-display text-xs font-bold uppercase tracking-[0.16em] text-charcoal-light">
              Pieces
            </h2>
            <ul className="space-y-2">
              {o.splits.flatMap((s) =>
                s.lines.map((l) => (
                  <li key={l.sku} className="flex items-center justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate text-charcoal">
                      <span className="font-display font-bold">{l.quantity}×</span> {l.name}
                    </span>
                    <span className="shrink-0 font-display text-[10px] font-bold uppercase tracking-wider text-charcoal-light">
                      {l.sku}
                    </span>
                  </li>
                )),
              )}
            </ul>
            <dl className="mt-4 space-y-1 border-t border-neutral-100 pt-3 text-xs">
              {[
                ["Subtotal", formatMoney(o.totals.itemsSubtotalMinor, o.totals.currency)],
                ...(o.totals.discountMinor
                  ? [["Discount", `−${formatMoney(o.totals.discountMinor, o.totals.currency)}`]]
                  : []),
                ["Shipping", formatMoney(o.totals.shippingMinor, o.totals.currency)],
                ["Tax", formatMoney(o.totals.taxMinor, o.totals.currency)],
              ].map(([k, v]) => (
                <div key={k as string} className="flex justify-between text-charcoal-muted">
                  <dt>{k}</dt>
                  <dd className="font-medium text-charcoal">{v}</dd>
                </div>
              ))}
            </dl>
          </section>

          {/* Splits */}
          <section className="rounded-2xl border border-neutral-200/60 bg-white p-5">
            <h2 className="mb-3 font-display text-xs font-bold uppercase tracking-[0.16em] text-charcoal-light">
              Vendor routing
            </h2>
            <div className="space-y-2">
              {o.splits.map((s) => (
                <div
                  key={s.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-surface-muted px-4 py-3"
                >
                  <span className="font-display text-xs font-bold uppercase text-charcoal">
                    {s.partnerId}
                    {s.partnerOrderId ? (
                      <span className="ml-2 font-normal normal-case text-charcoal-muted">
                        #{s.partnerOrderId}
                      </span>
                    ) : null}
                  </span>
                  <StatusChip label={s.status} />
                </div>
              ))}
            </div>
          </section>

          {/* Events */}
          <section className="rounded-2xl border border-neutral-200/60 bg-white p-5">
            <h2 className="mb-3 font-display text-xs font-bold uppercase tracking-[0.16em] text-charcoal-light">
              Audit trail
            </h2>
            <ol className="space-y-2.5">
              {events.map((e, i) => (
                <li key={i} className="flex items-start gap-3 text-xs">
                  <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
                  <div className="min-w-0 flex-1">
                    <span className="block font-display font-bold text-charcoal">
                      {e.kind.replace(/_/g, " ").toLowerCase()}
                    </span>
                    <span className="block text-[10px] text-charcoal-muted">
                      {new Date(e.createdAt).toLocaleString()}
                      {e.detail && typeof e.detail === "object" ? ` · ${JSON.stringify(e.detail).slice(0, 120)}` : ""}
                    </span>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        </div>

        {/* Right: customer + actions */}
        <div className="space-y-5">
          <section className="rounded-2xl border border-neutral-200/60 bg-white p-5">
            <h2 className="mb-3 font-display text-xs font-bold uppercase tracking-[0.16em] text-charcoal-light">
              Customer
            </h2>
            <p className="font-display text-sm font-bold text-charcoal">
              {data.customer?.customerName ?? o.email}
            </p>
            <p className="text-xs text-charcoal-muted">{o.email}</p>
            {data.customer?.phone ? (
              <p className="text-xs text-charcoal-muted">{data.customer.phone}</p>
            ) : null}
            {data.customer ? (
              <address className="mt-2 text-xs not-italic leading-relaxed text-charcoal-muted">
                {[
                  data.customer.shipLine1,
                  data.customer.shipLine2,
                  `${data.customer.shipCity}, ${data.customer.shipState} ${data.customer.shipPostalCode}`,
                  data.customer.shipCountry,
                ]
                  .filter(Boolean)
                  .map((line, i) => (
                    <span key={i} className="block">
                      {line}
                    </span>
                  ))}
              </address>
            ) : null}
            <p className="mt-2 text-xs text-charcoal-muted">
              {new Date(o.createdAt).toLocaleString()}
              {data.customer ? ` · ${data.customer.deliveryMethod.toLowerCase()}` : ""}
            </p>
          </section>

          {/* Status controls */}
          <section className="rounded-2xl border border-neutral-200/60 bg-white p-5">
            <h2 className="mb-3 font-display text-xs font-bold uppercase tracking-[0.16em] text-charcoal-light">
              Set status
            </h2>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Internal note (optional)…"
              className="mb-3 w-full rounded-xl border border-neutral-200/80 px-3 py-2 text-xs outline-none focus:border-charcoal/40"
            />
            <div className="flex flex-wrap gap-2">
              {TARGET_STATUSES.map((s) => (
                <AdminButton
                  key={s}
                  variant={s === "CANCELLED" || s === "REFUNDED" ? "ghost" : "dark"}
                  disabled={busy || s === o.status}
                  onClick={() => void setStatus(s)}
                >
                  {s.replace(/_/g, " ").toLowerCase()}
                </AdminButton>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
