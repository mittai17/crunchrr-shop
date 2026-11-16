"use client";

/**
 * Bag & Checkout — mirrors the "crunchrr._shopping_bag_checkout" mockup:
 * express-pay row, bag lines, sticky summary, and the fast-checkout form.
 * Totals preview client-side; authoritative totals come from the API at
 * checkout (server never trusts client amounts).
 */
import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { CheckoutRequest } from "@crunchrr/shared";
import { useCart, type CartItem } from "@/lib/cart";
import { cn, formatMoney } from "@/lib/utils";
import { DROP } from "@/lib/drop";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4001";

type CheckoutSuccess = {
  orderNumber: string;
  totalMinor: number;
  currency: string;
  demo: boolean;
  splits: Array<{
    partnerId: string;
    partnerOrderId: string | null;
    status: string;
    lines: Array<{ sku: string; name: string; quantity: number }>;
  }>;
};

/* Server-shaped shipping zone (public projection of the admin zone table). */
type StoreZone = {
  countryCode: string;
  countryName: string;
  currency: string;
  fxFromUsd: number;
  shippingFeeMinor: number;
  priorityFeeMinor: number;
  freeThresholdMinor: number;
  taxBps: number;
  active: boolean;
};
type StorePromo = { code: string; percentOff: number; label: string; active: boolean };

/*
 * Client-side totals preview — mirrors the API's zone math (convert per
 * line, percent discount, zone fees/threshold, bps tax). The server
 * re-computes everything authoritatively at checkout.
 * FALLBACK_ZONE mirrors the seeded US zone so first paint is stable.
 */
const FALLBACK_ZONE: StoreZone = {
  countryCode: "US",
  countryName: "United States",
  currency: "USD",
  fxFromUsd: 1,
  shippingFeeMinor: 1200,
  priorityFeeMinor: 1200,
  freeThresholdMinor: 7500,
  taxBps: 700,
  active: true,
};
const convertToZone = (usdMinor: number, fx: number): number =>
  Math.round((usdMinor / 100) * fx * 100);

export default function BagPage() {
  const { items, promoCode, setPromoCode, remove, setQuantity, clear } = useCart();
  const [promoInput, setPromoInput] = useState("");
  const [promoError, setPromoError] = useState<string | null>(null);
  const [delivery, setDelivery] = useState<"STANDARD" | "PRIORITY">("STANDARD");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<CheckoutSuccess | null>(null);
  const [zones, setZones] = useState<StoreZone[] | null>(null);
  const [promos, setPromos] = useState<StorePromo[]>([]);
  const [country, setCountry] = useState("US");

  /* Load shipping zones + promo codes from the API. */
  useEffect(() => {
    const saved = window.localStorage.getItem("crunchrr.country");
    if (saved) setCountry(saved);
    void fetch(`${API_URL}/api/shipping/zones`)
      .then((r) => r.json())
      .then((d: { zones?: StoreZone[] }) => {
        if (d.zones?.length) {
          setZones(d.zones);
          // If the saved country is no longer served, snap back to the first.
          if (saved && !d.zones.some((z) => z.countryCode === saved && z.active)) {
            setCountry(d.zones[0]?.countryCode ?? "US");
          }
        }
      })
      .catch(() => undefined); // offline preview: fallback zone keeps math sane
    void fetch(`${API_URL}/api/promos`)
      .then((r) => r.json())
      .then((d: { promos?: StorePromo[] }) => {
        if (d.promos) setPromos(d.promos);
      })
      .catch(() => undefined);
  }, []);

  const pickCountry = (code: string) => {
    setCountry(code);
    window.localStorage.setItem("crunchrr.country", code);
  };

  /* Express wallets route through the same pipeline — they never skip the
   * form. When details are missing, point the buyer at the form instead of
   * silently doing nothing. */
  const expressPay = () => {
    if (!canSubmit) {
      document
        .getElementById("fast-checkout")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
      setError("Complete the fast checkout form — demo wallets pay through the same secure pipeline.");
      return;
    }
    void placeOrder();
  };

  // Fast-checkout form state
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    line1: "",
    line2: "",
    city: "",
    state: "",
    postalCode: "",
  });

  /* Destination zone + preview totals (mirrors API math, in zone currency). */
  const zone: StoreZone =
    (zones ?? []).find((z) => z.countryCode === country && z.active) ?? FALLBACK_ZONE;
  const zoneMinor = (usdMinor: number) => convertToZone(usdMinor, zone.fxFromUsd);

  const subtotalMinor = items.reduce(
    (sum, i) => sum + zoneMinor(i.priceMinor) * i.quantity,
    0,
  );
  const appliedPromo = useMemo(
    () => (promoCode ? promos.find((p) => p.code === promoCode && p.active) ?? null : null),
    [promoCode, promos],
  );
  const discountMinor = appliedPromo
    ? Math.round((subtotalMinor * appliedPromo.percentOff) / 100)
    : 0;
  const shippingMinor =
    delivery === "PRIORITY"
      ? zone.priorityFeeMinor
      : subtotalMinor - discountMinor >= zone.freeThresholdMinor
        ? 0
        : zone.shippingFeeMinor;
  const taxMinor = Math.round(
    (Math.max(subtotalMinor - discountMinor, 0) * zone.taxBps) / 10_000,
  );
  const totalMinor = Math.max(subtotalMinor - discountMinor, 0) + shippingMinor + taxMinor;

  const applyPromo = () => {
    const code = promoInput.trim().toUpperCase();
    if (!code) return;
    if (!promos.some((p) => p.code === code && p.active)) {
      setPromoError("Code not recognized for this drop");
      return;
    }
    setPromoError(null);
    setPromoCode(code);
    setPromoInput("");
  };

  const update = (key: keyof typeof form) => (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const canSubmit =
    items.length > 0 &&
    form.name.trim().length >= 2 &&
    /.+@.+\..+/.test(form.email) &&
    form.phone.trim().length >= 7 &&
    form.line1.trim().length >= 3 &&
    form.city.trim().length >= 2 &&
    form.state.trim().length >= 2 &&
    form.postalCode.trim().length >= 4;

  const placeOrder = async () => {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const payload: CheckoutRequest = {
        lines: items.map((i) => ({ variantSku: i.sku, quantity: i.quantity })),
        customer: {
          name: form.name.trim(),
          email: form.email.trim(),
          phone: form.phone.trim(),
        },
        shippingAddress: {
          line1: form.line1.trim(),
          ...(form.line2.trim() ? { line2: form.line2.trim() } : {}),
          city: form.city.trim(),
          state: form.state.trim(),
          postalCode: form.postalCode.trim(),
          country: zone.countryCode,
        },
        deliveryMethod: delivery,
        ...(promoCode && appliedPromo ? { promoCode } : {}),
        /* Truthful hint for the server; the zone's currency is authoritative. */
        clientCurrency: zone.currency as CheckoutRequest["clientCurrency"],
      };

      const res = await fetch(
        `${API_URL}/api/orders/checkout`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const json = (await res.json()) as {
        orderId?: string;
        orderNumber?: string;
        totals?: { grandTotalMinor: number; currency: string };
        payment?: { demoMode: boolean };
        error?: { message: string; details?: Array<{ message: string }> };
      };
      if (!res.ok || !json.orderId || !json.orderNumber || !json.totals) {
        const msg =
          json.error?.details?.[0]?.message ?? json.error?.message ?? "Checkout failed";
        throw new Error(msg);
      }

      /* Demo mode: confirm through the same pipeline a webhook would use. */
      let demo = false;
      let splits: CheckoutSuccess["splits"] = [];
      if (json.payment?.demoMode) {
        demo = true;
        try {
          const confirmRes = await fetch(
            `${API_URL}/api/orders/demo-confirm`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ orderId: json.orderId }),
            },
          );
          const confirmJson = (await confirmRes.json()) as {
            ok?: boolean;
            order?: {
              splits: Array<{
                partnerId: string;
                partnerOrderId: string | null;
                status: string;
                lines: Array<{ sku: string; name: string; quantity: number }>;
              }>;
            };
          };
          if (confirmJson.ok && confirmJson.order) {
            splits = confirmJson.order.splits;
          }
        } catch {
          /* demo confirm is best-effort; order still exists */
        }
      }

      setSuccess({
        orderNumber: json.orderNumber,
        totalMinor: json.totals.grandTotalMinor,
        currency: json.totals.currency,
        demo,
        splits,
      });
      clear();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Checkout failed");
    } finally {
      setSubmitting(false);
    }
  };

  /* ------------------------------- Success ------------------------------- */
  if (success) {
    return (
      <div className="flex min-h-screen flex-col bg-canvas">
        <SiteHeader />
        <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center px-6 py-24 text-center">
          <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-jade-tint">
            <span className="material-symbols-outlined filled text-4xl text-jade-deep">
              check_circle
            </span>
          </div>
          <span className="mb-2 font-display text-[11px] font-bold uppercase tracking-[0.22em] text-brand">
            {success.demo ? "Demo Payment Confirmed" : "Payment Confirmed"}
          </span>
          <h1 className="mb-3 font-display text-4xl font-bold uppercase tracking-tight text-charcoal">
            Vault Secured.
          </h1>
          <p className="mb-8 max-w-md text-sm leading-relaxed text-charcoal-muted">
            Order{" "}
            <span className="font-display font-bold text-charcoal">
              {success.orderNumber}
            </span>{" "}
            is locked for{" "}
            {formatMoney(success.totalMinor, success.currency)}. {DROP.batchLabel}{" "}
            pieces ship from the depot within 24h — tracking lands in your
            inbox.
          </p>

          {success.splits.length > 0 ? (
            <div className="mb-8 w-full space-y-2 rounded-2xl border border-neutral-200/70 bg-white p-6 text-left shadow-card">
              <span className="font-display text-[10px] font-bold uppercase tracking-[0.2em] text-charcoal-light">
                Partner Routing
              </span>
              {success.splits.map((s) => (
                <div
                  key={s.partnerId}
                  className="flex items-center justify-between gap-3 border-t border-neutral-100 pt-2 first:border-0 first:pt-0"
                >
                  <div className="min-w-0">
                    <span className="font-display text-xs font-bold uppercase text-charcoal">
                      {s.partnerId}
                    </span>
                    <span className="ml-2 text-xs text-charcoal-muted">
                      {s.lines.map((l) => `${l.quantity}× ${l.name}`).join(", ")}
                    </span>
                  </div>
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-2.5 py-1 font-display text-[10px] font-bold uppercase",
                      s.status === "ACCEPTED_BY_PARTNER"
                        ? "bg-jade-tint text-jade-deep"
                        : "bg-surface-muted text-charcoal-muted",
                    )}
                  >
                    {s.status.replace(/_/g, " ").toLowerCase()}
                  </span>
                </div>
              ))}
            </div>
          ) : null}

          <div className="flex flex-wrap items-center justify-center gap-4">
            <Link href="/shop" className="btn-pill-coral">
              Continue Browsing
            </Link>
            <Link href={`/track?order=${encodeURIComponent(success.orderNumber)}`} className="btn-pill-ghost">
              Track This Order
            </Link>
          </div>
        </div>
        <SiteFooter />
      </div>
    );
  }

  /* -------------------------------- Bag -------------------------------- */
  return (
    <div className="flex min-h-screen w-full flex-col bg-canvas">
      <SiteHeader />
      {/* Marquee */}
      <div className="w-full overflow-hidden bg-brand py-2 text-white">
        <div className="flex items-center justify-around gap-6 whitespace-nowrap font-display text-[11px] font-bold uppercase tracking-widest">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-sm">local_shipping</span>
            <span>
              Complimentary standard shipping over{" "}
              {formatMoney(zone.freeThresholdMinor, zone.currency)}
            </span>
          </div>
          <div className="hidden items-center gap-2 text-white/80 md:flex">
            <span className="material-symbols-outlined text-sm">verified_user</span>
            <span>Buyer protection — mint condition guarantee</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-sm">bolt</span>
            <span>Batch {DROP.number} allocated on checkout — no restocks</span>
          </div>
        </div>
      </div>

      <main className="mx-auto w-full max-w-7xl flex-1 px-6 pb-16 pt-8 lg:px-12">
        {/* Heading */}
        <div className="mb-6 flex flex-col justify-between gap-3 border-b border-neutral-200/60 pb-6 md:flex-row md:items-center">
          <div>
            <div className="eyebrow mb-1">
              <span className="material-symbols-outlined text-sm">shopping_bag</span>
              <span>Secure Checkout</span>
            </div>
            <h1 className="font-display text-3xl font-bold uppercase tracking-tight text-charcoal md:text-4xl">
              Your Shopping Bag
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/shop"
              className="flex items-center gap-2 rounded-full border border-neutral-200 bg-white px-4 py-2 font-display text-[11px] font-bold uppercase tracking-wider text-charcoal transition-colors hover:border-charcoal"
            >
              <span className="material-symbols-outlined text-sm">arrow_back</span>
              Continue Shopping
            </Link>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-jade-tint px-3 py-2 font-display text-[10px] font-bold uppercase tracking-wider text-jade-deep">
              <span className="material-symbols-outlined text-sm">lock</span>
              256-bit SSL
            </span>
          </div>
        </div>

        {/* Express pay */}
        <div className="mb-8 rounded-2xl border border-neutral-200/70 bg-white p-4 shadow-card">
          <div className="flex flex-col items-start justify-between gap-3 md:flex-row md:items-center">
            <div className="flex flex-col">
              <span className="font-display text-xs font-bold uppercase tracking-wider text-charcoal">
                Express Checkout
              </span>
              <span className="text-xs text-charcoal-muted">
                One-tap wallets — same secure pipeline, fewer keystrokes.
              </span>
            </div>
            <div className="grid w-full grid-cols-3 gap-2 md:w-auto md:grid-cols-4">
              <button
                type="button"
                onClick={expressPay}
                disabled={submitting}
                className={cn(
                  "flex h-11 items-center justify-center rounded-full font-display text-sm font-bold lowercase italic tracking-tight text-white shadow-md transition-all",
                  submitting
                    ? "cursor-not-allowed bg-neutral-200 text-neutral-400"
                    : "bg-[#5a31f4] hover:bg-[#4b27d4]",
                )}
              >
                ShopPay
              </button>
              <button
                type="button"
                onClick={expressPay}
                disabled={submitting}
                className={cn(
                  "flex h-11 items-center justify-center rounded-full font-display text-sm font-bold italic text-charcoal shadow-md transition-all",
                  submitting
                    ? "cursor-not-allowed bg-neutral-200 text-neutral-400"
                    : "bg-[#FFC439] hover:bg-[#f0b52f]",
                )}
              >
                PayPal
              </button>
              <button
                type="button"
                onClick={expressPay}
                disabled={submitting}
                className={cn(
                  "flex h-11 items-center justify-center gap-1 rounded-full font-display text-sm font-bold text-white shadow-md transition-all",
                  submitting
                    ? "cursor-not-allowed bg-neutral-200 text-neutral-400"
                    : "bg-charcoal hover:bg-charcoal-muted",
                )}
              >
                <span className="material-symbols-outlined text-base">language</span>
                GPay
              </button>
              <button
                type="button"
                onClick={expressPay}
                disabled={submitting}
                className={cn(
                  "hidden h-11 items-center justify-center gap-1 rounded-full font-display text-sm font-bold text-white shadow-md transition-all md:flex",
                  submitting
                    ? "cursor-not-allowed bg-neutral-200 text-neutral-400"
                    : "bg-charcoal hover:bg-charcoal-muted",
                )}
              >
                <span className="material-symbols-outlined text-base">apple</span>
                Pay
              </button>
            </div>
          </div>
        </div>

        {items.length === 0 ? (
          <div className="rounded-2xl border border-neutral-200/70 bg-white p-12 text-center shadow-card">
            <span className="material-symbols-outlined text-5xl text-charcoal-light">
              remove_shopping_cart
            </span>
            <h2 className="mt-3 font-display text-2xl font-bold uppercase text-charcoal">
              Your bag is empty
            </h2>
            <p className="mx-auto mt-2 max-w-sm text-sm text-charcoal-muted">
              Drop 004 pieces are allocated in real time — claim a batch slot
              before the vault closes.
            </p>
            <Link href="/shop" className="btn-pill-coral mt-6">
              Enter The Vault
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
            {/* ================= Bag lines ================= */}
            <div className="space-y-4 lg:col-span-7">
              {items.map((item) => (
                <BagLine
                  key={item.sku}
                  item={item}
                  currency={zone.currency}
                  fx={zone.fxFromUsd}
                  onRemove={() => remove(item.sku)}
                  onQty={(q) => setQuantity(item.sku, q)}
                />
              ))}

              {/* Promo */}
              <div className="rounded-2xl border border-neutral-200/70 bg-white p-4 shadow-card">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-lg text-brand">
                      local_activity
                    </span>
                    <span className="font-display text-xs font-bold uppercase tracking-wider text-charcoal">
                      Promotional Code
                    </span>
                  </div>
                  {appliedPromo ? (
                    <button
                      type="button"
                      onClick={() => {
                        setPromoCode(null);
                        setPromoError(null);
                      }}
                      className="font-display text-[10px] font-bold uppercase text-charcoal-muted transition-colors hover:text-error"
                    >
                      Remove
                    </button>
                  ) : null}
                </div>
                {appliedPromo ? (
                  <div className="mt-3 flex items-center justify-between rounded bg-jade-tint px-4 py-2.5">
                    <span className="font-display text-xs font-bold uppercase text-jade-deep">
                      {promoCode} — {appliedPromo.percentOff}% {appliedPromo.label}
                    </span>
                    <span className="font-display text-xs font-bold text-jade-deep">
                      −{formatMoney(discountMinor, zone.currency)}
                    </span>
                  </div>
                ) : (
                  <>
                    <div className="mt-3 flex gap-2">
                      <input
                        type="text"
                        value={promoInput}
                        onChange={(e) => setPromoInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") applyPromo();
                        }}
                        placeholder="e.g. TRIBE15 or DROP004"
                        aria-label="Promo code"
                        className="flex-1 rounded-full border border-neutral-200 bg-canvas px-4 py-2.5 text-xs uppercase tracking-wider text-charcoal outline-none transition-colors placeholder:normal-case placeholder:tracking-normal placeholder:text-charcoal-light focus:border-brand"
                      />
                      <button
                        type="button"
                        onClick={applyPromo}
                        className="rounded-full bg-charcoal px-5 py-2.5 font-display text-[11px] font-bold uppercase tracking-wider text-white transition-colors hover:bg-brand"
                      >
                        Apply
                      </button>
                    </div>
                    {promoError ? (
                      <p className="mt-2 text-xs text-error">{promoError}</p>
                    ) : (
                      <p className="mt-2 text-xs text-charcoal-muted">
                        Tribe codes unlock allocation priority at vault close.
                      </p>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* ================= Summary ================= */}
            <div className="sticky top-28 rounded-2xl bg-charcoal p-6 text-white shadow-float lg:col-span-5">
              <h2 className="mb-1 font-display text-lg font-bold uppercase tracking-tight text-white">
                Order Summary
              </h2>
              <p className="mb-4 text-xs text-white/60">
                {DROP.batchLabel} — allocations finalize at payment.
              </p>

              {/* Destination picker */}
              <div className="mb-4">
                <label
                  htmlFor="bag-country"
                  className="mb-1.5 flex items-center gap-1.5 font-display text-[10px] font-bold uppercase tracking-[0.2em] text-white/50"
                >
                  <span className="material-symbols-outlined text-sm">public</span>
                  Shipping to
                </label>
                <select
                  id="bag-country"
                  value={country}
                  onChange={(e) => pickCountry(e.target.value)}
                  className="w-full appearance-none rounded-full border border-white/15 bg-white/10 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-white outline-none transition-colors hover:border-white/30 focus:border-brand"
                >
                  {(zones ?? [FALLBACK_ZONE]).map((z) => (
                    <option key={z.countryCode} value={z.countryCode} className="text-charcoal">
                      {z.countryName} · {z.currency}
                    </option>
                  ))}
                </select>
                <p className="mt-1.5 text-[10px] text-white/60">
                  Prices convert to {zone.currency} at checkout · tax {zone.taxBps / 100}%
                </p>
              </div>

              <div className="space-y-2.5 border-t border-white/10 pt-4 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-white/70">Subtotal ({items.length} lines)</span>
                  <span className="font-display font-bold">
                    {formatMoney(subtotalMinor, zone.currency)}
                  </span>
                </div>
                {discountMinor > 0 ? (
                  <div className="flex items-center justify-between">
                    <span className="text-white/70">Promo {promoCode}</span>
                    <span className="font-display font-bold text-jade">
                      −{formatMoney(discountMinor, zone.currency)}
                    </span>
                  </div>
                ) : null}
                <div className="flex items-center justify-between">
                  <span className="text-white/70">
                    {delivery === "PRIORITY" ? "Priority shipping" : "Standard shipping"}
                  </span>
                  <span className="font-display font-bold">
                    {shippingMinor === 0
                      ? "Free"
                      : formatMoney(shippingMinor, zone.currency)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-white/70">
                    Estimated tax ({zone.taxBps / 100}%)
                  </span>
                  <span className="font-display font-bold">
                    {formatMoney(taxMinor, zone.currency)}
                  </span>
                </div>
              </div>

              <div className="mt-4 flex items-end justify-between border-t border-white/10 pt-4">
                <span className="font-display text-sm font-bold uppercase tracking-wider text-white/80">
                  Total
                </span>
                <span className="font-display text-3xl font-bold tracking-tight text-brand">
                  {formatMoney(totalMinor, zone.currency)}
                </span>
              </div>

              <button
                type="button"
                onClick={placeOrder}
                disabled={!canSubmit || submitting}
                className={cn(
                  "mt-4 flex h-14 w-full items-center justify-center gap-3 rounded-full font-display text-sm font-bold uppercase tracking-wider shadow-lg transition-all active:scale-[0.98]",
                  canSubmit && !submitting
                    ? "bg-brand text-white hover:bg-brand-dark"
                    : "cursor-not-allowed bg-white/10 text-white/40",
                )}
              >
                {submitting ? (
                  <>
                    <span className="material-symbols-outlined animate-spin text-lg">
                      progress_activity
                    </span>
                    Securing Batch…
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-lg">lock</span>
                    Place Order • {formatMoney(totalMinor, zone.currency)}
                  </>
                )}
              </button>

              {error ? (
                <p className="mt-3 rounded bg-error-container px-3 py-2 text-xs text-error">
                  {error}
                </p>
              ) : (
                <p className="mt-3 text-center text-[11px] text-white/50">
                  Encrypted & tokenized. Funds captured only when the batch
                  ships.
                </p>
              )}
            </div>

            {/* ================= Fast checkout form ================= */}
            <div
              id="fast-checkout"
              className="rounded-2xl border border-neutral-200/70 bg-white p-6 shadow-card lg:col-span-12 scroll-mt-28"
            >
              <div className="mb-6 flex items-center justify-between border-b border-neutral-100 pb-4">
                <div>
                  <h2 className="font-display text-xl font-bold uppercase tracking-tight text-charcoal">
                    Fast Checkout
                  </h2>
                  <p className="text-xs text-charcoal-muted">
                    Fill once — the vault keeps it encrypted for future drops.
                  </p>
                </div>
                <span className="hidden items-center gap-1.5 rounded-full bg-surface-muted px-3 py-1.5 font-display text-[10px] font-bold uppercase tracking-wider text-charcoal-muted sm:inline-flex">
                  <span className="material-symbols-outlined text-sm">shield</span>
                  PCI-DSS Tokenized
                </span>
              </div>

              <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
                {/* Contact */}
                <fieldset className="space-y-3">
                  <legend className="mb-2 flex items-center gap-2 font-display text-xs font-bold uppercase tracking-wider text-charcoal">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand text-[10px] font-bold text-white">
                      1
                    </span>
                    Contact
                  </legend>
                  <input
                    required
                    type="text"
                    value={form.name}
                    onChange={update("name")}
                    placeholder="Full name"
                    aria-label="Full name"
                    className="w-full rounded border border-neutral-200 px-3.5 py-2.5 text-sm outline-none transition-colors placeholder:text-charcoal-light focus:border-brand"
                  />
                  <input
                    required
                    type="email"
                    value={form.email}
                    onChange={update("email")}
                    placeholder="Email for tracking"
                    aria-label="Email"
                    className="w-full rounded border border-neutral-200 px-3.5 py-2.5 text-sm outline-none transition-colors placeholder:text-charcoal-light focus:border-brand"
                  />
                  <input
                    required
                    type="tel"
                    value={form.phone}
                    onChange={update("phone")}
                    placeholder="+91 / +1 phone"
                    aria-label="Phone"
                    className="w-full rounded border border-neutral-200 px-3.5 py-2.5 text-sm outline-none transition-colors placeholder:text-charcoal-light focus:border-brand"
                  />
                </fieldset>

                {/* Shipping */}
                <fieldset className="space-y-3">
                  <legend className="mb-2 flex items-center gap-2 font-display text-xs font-bold uppercase tracking-wider text-charcoal">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand text-[10px] font-bold text-white">
                      2
                    </span>
                    Shipping
                  </legend>
                  <input
                    required
                    type="text"
                    value={form.line1}
                    onChange={update("line1")}
                    placeholder="Street address"
                    aria-label="Street address"
                    className="w-full rounded border border-neutral-200 px-3.5 py-2.5 text-sm outline-none transition-colors placeholder:text-charcoal-light focus:border-brand"
                  />
                  <input
                    type="text"
                    value={form.line2}
                    onChange={update("line2")}
                    placeholder="Apt, suite (optional)"
                    aria-label="Address line 2"
                    className="w-full rounded border border-neutral-200 px-3.5 py-2.5 text-sm outline-none transition-colors placeholder:text-charcoal-light focus:border-brand"
                  />
                  <div className="grid grid-cols-3 gap-2">
                    <input
                      required
                      type="text"
                      value={form.city}
                      onChange={update("city")}
                      placeholder="City"
                      aria-label="City"
                      className="w-full rounded border border-neutral-200 px-3.5 py-2.5 text-sm outline-none transition-colors placeholder:text-charcoal-light focus:border-brand"
                    />
                    <input
                      required
                      type="text"
                      value={form.state}
                      onChange={update("state")}
                      placeholder="State"
                      aria-label="State"
                      className="w-full rounded border border-neutral-200 px-3.5 py-2.5 text-sm outline-none transition-colors placeholder:text-charcoal-light focus:border-brand"
                    />
                    <input
                      required
                      type="text"
                      value={form.postalCode}
                      onChange={update("postalCode")}
                      placeholder="Postal code"
                      aria-label="Postal code"
                      className="w-full rounded border border-neutral-200 px-3.5 py-2.5 text-sm outline-none transition-colors placeholder:text-charcoal-light focus:border-brand"
                    />
                  </div>
                  <p className="flex items-center gap-1.5 text-[11px] text-charcoal-muted">
                    <span className="material-symbols-outlined text-sm text-brand">public</span>
                    Delivering to{" "}
                    <span className="font-display font-bold uppercase text-charcoal">
                      {zone.countryName}
                    </span>{" "}
                    · change it in the order summary
                  </p>
                </fieldset>

                {/* Delivery */}
                <fieldset className="space-y-3">
                  <legend className="mb-2 flex items-center gap-2 font-display text-xs font-bold uppercase tracking-wider text-charcoal">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand text-[10px] font-bold text-white">
                      3
                    </span>
                    Delivery
                  </legend>
                  <button
                    type="button"
                    onClick={() => setDelivery("STANDARD")}
                    className={cn(
                      "flex w-full items-start gap-3 rounded border-2 p-3.5 text-left transition-all",
                      delivery === "STANDARD"
                        ? "border-brand bg-brand/5"
                        : "border-neutral-200 hover:border-neutral-300",
                    )}
                  >
                    <span
                      className={cn(
                        "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2",
                        delivery === "STANDARD"
                          ? "border-brand bg-brand text-white"
                          : "border-neutral-300",
                      )}
                    >
                      {delivery === "STANDARD" ? (
                        <span className="material-symbols-outlined text-[12px] leading-none">
                          check
                        </span>
                      ) : null}
                    </span>
                    <span className="flex-1">
                      <span className="flex items-center justify-between font-display text-xs font-bold uppercase text-charcoal">
                        Standard Drop
                        <span className="text-charcoal">
                          {subtotalMinor - discountMinor >= zone.freeThresholdMinor
                            ? "Free"
                            : formatMoney(zone.shippingFeeMinor, zone.currency)}
                        </span>
                      </span>
                      <span className="mt-0.5 block text-xs text-charcoal-muted">
                        Tracked freight • 3–5 business days
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setDelivery("PRIORITY")}
                    className={cn(
                      "flex w-full items-start gap-3 rounded border-2 p-3.5 text-left transition-all",
                      delivery === "PRIORITY"
                        ? "border-brand bg-brand/5"
                        : "border-neutral-200 hover:border-neutral-300",
                    )}
                  >
                    <span
                      className={cn(
                        "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2",
                        delivery === "PRIORITY"
                          ? "border-brand bg-brand text-white"
                          : "border-neutral-300",
                      )}
                    >
                      {delivery === "PRIORITY" ? (
                        <span className="material-symbols-outlined text-[12px] leading-none">
                          check
                        </span>
                      ) : null}
                    </span>
                    <span className="flex-1">
                      <span className="flex items-center justify-between font-display text-xs font-bold uppercase text-charcoal">
                        Priority Jet
                        <span className="font-bold text-brand">
                          {formatMoney(zone.priorityFeeMinor, zone.currency)}
                        </span>
                      </span>
                      <span className="mt-0.5 block text-xs text-charcoal-muted">
                        48h courier • batch-jump priority
                      </span>
                    </span>
                  </button>

                  <div className="flex items-center gap-3 rounded bg-surface-muted p-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-charcoal shadow-sm">
                      <span className="material-symbols-outlined text-base">
                        account_balance_wallet
                      </span>
                    </span>
                    <p className="text-xs leading-snug text-charcoal-muted">
                      Payment gateway activates at the final step — cards,
                      UPI, wallets via{" "}
                      <span className="font-display font-bold uppercase text-charcoal">
                        Razorpay / Cashfree
                      </span>
                      .
                    </p>
                  </div>
                </fieldset>
              </div>

              <div className="mt-6 flex items-center justify-between border-t border-neutral-100 pt-4">
                <p className="text-xs text-charcoal-muted">
                  By placing this order you agree to the Crunchrr drop terms —
                  final sale on allocated batches.
                </p>
                <button
                  type="button"
                  onClick={placeOrder}
                  disabled={!canSubmit || submitting}
                  className={cn(
                    "btn-pill-coral shrink-0",
                    (!canSubmit || submitting) && "pointer-events-none opacity-40",
                  )}
                >
                  <span className="material-symbols-outlined text-base">bolt</span>
                  <span>{submitting ? "Processing…" : "Place Order Now"}</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}

/* ------------------------------ Bag line ------------------------------ */

function BagLine({
  item,
  currency,
  fx,
  onRemove,
  onQty,
}: {
  item: CartItem;
  /** Destination currency + FX so the line shows what the buyer pays. */
  currency: string;
  fx: number;
  onRemove: () => void;
  onQty: (q: number) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const lineTotalMinor = convertToZone(item.priceMinor, fx) * item.quantity;

  return (
    <div className="group flex items-stretch gap-4 rounded-2xl border border-neutral-200/70 bg-white p-4 shadow-card">
      <div className="relative aspect-square w-24 shrink-0 overflow-hidden rounded-xl bg-neutral-100 sm:w-28">
        {item.image ? (
          <Image
            src={item.image}
            alt={item.name}
            fill
            sizes="112px"
            className="object-cover"
          />
        ) : null}
      </div>

      <div className="flex min-w-0 flex-1 flex-col justify-between py-0.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {item.badge ? (
              <span className="mb-1 inline-block rounded-full bg-surface-muted px-2 py-0.5 font-display text-[9px] font-bold uppercase tracking-widest text-charcoal-muted">
                {item.badge}
              </span>
            ) : null}
            <h3 className="truncate font-display text-base font-bold text-charcoal">
              <Link href={`/product/${item.slug}`} className="hover:text-brand">
                {item.name}
              </Link>
            </h3>
            <p className="text-xs text-charcoal-muted">
              {item.colorway} • Size {item.size}
            </p>
          </div>
          <span className="shrink-0 font-display text-base font-bold text-charcoal">
            {formatMoney(lineTotalMinor, currency)}
          </span>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {/* Qty stepper */}
            <div className="flex h-9 items-center rounded-full border border-neutral-200">
              <button
                type="button"
                aria-label="Decrease quantity"
                onClick={() => onQty(item.quantity - 1)}
                className="flex h-full w-8 items-center justify-center rounded-l-full text-charcoal transition-colors hover:bg-surface-muted"
              >
                <span className="material-symbols-outlined text-sm">remove</span>
              </button>
              <span className="w-7 text-center font-display text-xs font-bold text-charcoal">
                {item.quantity}
              </span>
              <button
                type="button"
                aria-label="Increase quantity"
                onClick={() => onQty(item.quantity + 1)}
                className="flex h-full w-8 items-center justify-center rounded-r-full text-charcoal transition-colors hover:bg-surface-muted"
              >
                <span className="material-symbols-outlined text-sm">add</span>
              </button>
            </div>
            {item.maxStock <= 5 ? (
              <span className="font-display text-[10px] font-bold uppercase text-brand">
                Only {item.maxStock} left
              </span>
            ) : null}
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => {
                if (confirming) {
                  onRemove();
                } else {
                  setConfirming(true);
                  window.setTimeout(() => setConfirming(false), 2500);
                }
              }}
              className={cn(
                "flex items-center gap-1 rounded-full px-3 py-1.5 font-display text-[10px] font-bold uppercase tracking-wider transition-colors",
                confirming
                  ? "bg-error-container text-error"
                  : "text-charcoal-muted hover:bg-error-container hover:text-error",
              )}
            >
              <span className="material-symbols-outlined text-sm">
                {confirming ? "delete_forever" : "delete"}
              </span>
              {confirming ? "Confirm?" : "Remove"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
