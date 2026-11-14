/**
 * Money helpers — everything is minor units (integers).
 *
 * Multi-country model:
 *  - Catalog prices are stored in BASE USD minor units.
 *  - Each shipping zone carries fxFromUsd (per major USD unit), its own
 *    fees/threshold in zone minor units, and tax in basis points.
 *  - Checkout converts once per line into the zone currency; totals are
 *    computed entirely in zone currency.
 */
import { CURRENCY_DECIMALS, CURRENCY_SYMBOLS, type Currency } from "@crunchrr/shared";

export type ZoneMoney = {
  currency: Currency;
  fxFromUsd: number;
  shippingFeeMinor: number;
  priorityFeeMinor: number;
  freeThresholdMinor: number;
  taxBps: number;
};

/** Convert a base-USD minor amount into zone minor units (per-line). */
export function convertUsdMinorToZone(usdMinor: number, zone: Pick<ZoneMoney, "currency" | "fxFromUsd">): number {
  const decimals = CURRENCY_DECIMALS[zone.currency];
  const majorUsd = usdMinor / 100;
  const majorZone = majorUsd * zone.fxFromUsd;
  return Math.round(majorZone * 10 ** decimals);
}

export type Totals = {
  currency: Currency;
  itemsSubtotalMinor: number;
  discountMinor: number;
  shippingMinor: number;
  taxMinor: number;
  grandTotalMinor: number;
};

/**
 * Compute authoritative totals in the zone's currency from server-known
 * prices. Never trusts client-sent amounts.
 */
export function computeZoneTotals(args: {
  zone: ZoneMoney;
  itemsSubtotalMinor: number; // already in zone currency
  deliveryMethod: "STANDARD" | "PRIORITY";
  percentOff?: number | null;
}): Totals {
  const { zone, itemsSubtotalMinor, deliveryMethod } = args;
  const percentOff = args.percentOff ?? 0;

  const discountMinor = percentOff
    ? Math.round((itemsSubtotalMinor * percentOff) / 100)
    : 0;

  let shippingMinor: number;
  if (deliveryMethod === "PRIORITY") {
    shippingMinor = zone.priorityFeeMinor;
  } else {
    const freeEligible = itemsSubtotalMinor - discountMinor >= zone.freeThresholdMinor;
    shippingMinor = freeEligible ? 0 : zone.shippingFeeMinor;
  }

  const taxable = Math.max(itemsSubtotalMinor - discountMinor, 0);
  const taxMinor = Math.round((taxable * zone.taxBps) / 10_000);

  const grandTotalMinor = taxable + shippingMinor + taxMinor;
  return {
    currency: zone.currency,
    itemsSubtotalMinor,
    discountMinor,
    shippingMinor,
    taxMinor,
    grandTotalMinor,
  };
}

/** "141.37" style display string from minor units (currency-aware). */
export function formatMinor(minor: number, currency: Currency): string {
  const decimals = CURRENCY_DECIMALS[currency] ?? 2;
  const symbol = CURRENCY_SYMBOLS[currency] ?? `${currency} `;
  return `${symbol}${(minor / 10 ** decimals).toFixed(decimals)}`;
}
