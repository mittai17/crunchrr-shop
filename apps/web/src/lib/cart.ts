"use client";

/**
 * Client cart store — persisted to localStorage.
 * Lines reference SKUs; authoritative pricing always happens on the API.
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Product, ProductVariant } from "@crunchrr/shared";

export type CartItem = {
  sku: string;
  quantity: number;
  /** Display snapshot for instant UI rendering. */
  name: string;
  slug: string;
  size: string;
  colorway: string;
  priceMinor: number;
  image: string;
  badge?: string;
  collectionLabel?: string;
  maxStock: number;
};

type CartState = {
  items: CartItem[];
  promoCode: string | null;
  add: (
    product: Product,
    variant: ProductVariant,
    options?: { quantity?: number },
  ) => void;
  /** Add a pre-built display snapshot (wishlist → bag move). */
  addFromSnapshot: (item: Omit<CartItem, "quantity">) => void;
  remove: (sku: string) => void;
  setQuantity: (sku: string, quantity: number) => void;
  setPromoCode: (code: string | null) => void;
  clear: () => void;
  totalItems: () => number;
};

export const useCart = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      promoCode: null,

      add: (product, variant, options) => {
        const quantity = Math.max(1, options?.quantity ?? 1);
        set((state) => {
          const existing = state.items.find((i) => i.sku === variant.sku);
          if (existing) {
            return {
              ...state,
              items: state.items.map((i) =>
                i.sku === variant.sku
                  ? {
                      ...i,
                      quantity: Math.min(i.quantity + quantity, Math.max(variant.stock, 1), 10),
                    }
                  : i,
              ),
            };
          }
          const item: CartItem = {
            sku: variant.sku,
            quantity: Math.min(quantity, Math.max(variant.stock, 1), 10),
            name: product.name,
            slug: product.slug,
            size: variant.size === "ONE_SIZE" ? "One Size" : variant.size,
            colorway: variant.colorway,
            priceMinor: variant.priceMinor,
            image: product.images[0]?.url ?? "",
            badge: product.badge?.text ?? (product.collection ?? "Drop 004"),
            collectionLabel: product.gsmLabel || product.fabricLabel,
            maxStock: variant.stock,
          };
          return { ...state, items: [...state.items, item] };
        });
      },

      addFromSnapshot: (item) =>
        set((state) => {
          const existing = state.items.find((i) => i.sku === item.sku);
          if (existing) {
            return {
              ...state,
              items: state.items.map((i) =>
                i.sku === item.sku
                  ? { ...i, quantity: Math.min(i.quantity + 1, Math.min(i.maxStock, 10)) }
                  : i,
              ),
            };
          }
          return {
            ...state,
            items: [
              ...state.items,
              { ...item, quantity: Math.min(Math.max(item.maxStock, 1), 10) },
            ],
          };
        }),

      remove: (sku) =>
        set((state) => ({
          ...state,
          items: state.items.filter((i) => i.sku !== sku),
        })),

      setQuantity: (sku, quantity) =>
        set((state) => ({
          ...state,
          items: state.items.map((i) =>
            i.sku === sku
              ? { ...i, quantity: Math.max(1, Math.min(quantity, Math.min(i.maxStock, 10))) }
              : i,
          ),
        })),

      setPromoCode: (code) => set((state) => ({ ...state, promoCode: code })),
      clear: () => set((state) => ({ ...state, items: [], promoCode: null })),

      totalItems: () => get().items.reduce((sum, i) => sum + i.quantity, 0),
    }),
    {
      name: "crunchrr-bag",
      version: 1,
    },
  ),
);

/** USD display helper (storefront currency; API re-validates server-side). */
export function formatUsd(minor: number): string {
  return `$${(minor / 100).toFixed(2)}`;
}
