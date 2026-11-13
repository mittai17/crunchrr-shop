"use client";

/**
 * Wishlist store — persisted to localStorage, mirrors the bag store's shape.
 * Stores display snapshots; authoritative stock/pricing re-validate on the API.
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Product, ProductVariant } from "@crunchrr/shared";
import type { CartItem } from "./cart";

export type WishlistItem = Omit<CartItem, "quantity">;

type WishlistState = {
  items: WishlistItem[];
  toggle: (product: Product, variant: ProductVariant) => void;
  remove: (sku: string) => void;
  clear: () => void;
  has: (sku: string) => boolean;
};

export const useWishlist = create<WishlistState>()(
  persist(
    (set, get) => ({
      items: [],

      toggle: (product, variant) => {
        const sku = variant.sku;
        if (get().has(sku)) {
          set((state) => ({ ...state, items: state.items.filter((i) => i.sku !== sku) }));
          return;
        }
        const item: WishlistItem = {
          sku,
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
        set((state) => ({ ...state, items: [item, ...state.items] }));
      },

      remove: (sku) =>
        set((state) => ({ ...state, items: state.items.filter((i) => i.sku !== sku) })),

      clear: () => set((state) => ({ ...state, items: [] })),

      has: (sku) => get().items.some((i) => i.sku === sku),
    }),
    {
      name: "crunchrr-wishlist",
      version: 1,
    },
  ),
);
