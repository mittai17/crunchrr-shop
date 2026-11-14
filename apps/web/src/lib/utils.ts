import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { CURRENCY_SYMBOLS, type Currency } from "@crunchrr/shared";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function formatUsd(minor: number): string {
  return `$${(minor / 100).toFixed(2)}`;
}

/** Currency-aware display (all seeded currencies are 2-decimal minor units). */
export function formatMoney(minor: number, currency: string): string {
  const symbol = CURRENCY_SYMBOLS[currency as Currency] ?? `${currency} `;
  return `${symbol}${(minor / 100).toFixed(2)}`;
}

export function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}
