/**
 * Money helpers — everything is minor units (integers).
 * Currency-aware tax & shipping rules for the storefront.
 */
export const TAX_RATE = {
  USD: 0.07, // storefront display tax (sales tax estimate)
  INR: 0.18, // GST-inclusive display estimate
} as const;

export const FREE_SHIPPING_THRESHOLD_MINOR = {
  USD: 7_500, // $75.00 — matches PDP copy "over $75.00"
  INR: 500_000,
} as const;

export const SHIPPING_FEE_MINOR = {
  USD: {
    STANDARD: 0, // free standard over threshold; flat $12 under
    PRIORITY: 1_200,
  },
  INR: {
    STANDARD: 0,
    PRIORITY: 25_000,
  },
} as const;

export const STANDARD_FALLBACK_FEE_MINOR = {
  USD: 1_200,
  INR: 20_000,
} as const;

/** Promo codes honored by the storefront (percent off). */
const PROMOS: Record<string, { percentOff: number; label: string }> = {
  TRIBE15: { percentOff: 15, label: "Drop Privilege" },
  DROP004: { percentOff: 10, label: "Batch 004" },
};

export function promoFor(code?: string | null): { percentOff: number; label: string } | null {
  if (!code) return null;
  const promo = PROMOS[code.toUpperCase().trim()];
  return promo ?? null;
}

export type Totals = {
  currency: "USD" | "INR";
  itemsSubtotalMinor: number;
  discountMinor: number;
  shippingMinor: number;
  taxMinor: number;
  grandTotalMinor: number;
};

/**
 * Compute authoritative totals from server-known prices.
 * Never trusts client-sent amounts.
 */
export function computeTotals(args: {
  currency: "USD" | "INR";
  itemsSubtotalMinor: number;
  deliveryMethod: "STANDARD" | "PRIORITY";
  promoCode?: string | null;
}): Totals {
  const { currency, itemsSubtotalMinor, deliveryMethod } = args;
  const promo = promoFor(args.promoCode);

  const discountMinor = promo
    ? Math.round((itemsSubtotalMinor * promo.percentOff) / 100)
    : 0;

  let shippingMinor: number;
  if (deliveryMethod === "PRIORITY") {
    shippingMinor = SHIPPING_FEE_MINOR[currency].PRIORITY;
  } else {
    const freeEligible =
      itemsSubtotalMinor - discountMinor >= FREE_SHIPPING_THRESHOLD_MINOR[currency];
    shippingMinor = freeEligible ? 0 : STANDARD_FALLBACK_FEE_MINOR[currency];
  }

  const taxable = Math.max(itemsSubtotalMinor - discountMinor, 0);
  const taxMinor = Math.round(taxable * TAX_RATE[currency]);

  const grandTotalMinor = taxable + shippingMinor + taxMinor;
  return {
    currency,
    itemsSubtotalMinor,
    discountMinor,
    shippingMinor,
    taxMinor,
    grandTotalMinor,
  };
}

/** "141.37" style display string from minor units. */
export function formatMinor(minor: number, currency: "USD" | "INR"): string {
  const symbols = { USD: "$", INR: "₹" } as const;
  return `${symbols[currency]}${(minor / 100).toFixed(2)}`;
}
