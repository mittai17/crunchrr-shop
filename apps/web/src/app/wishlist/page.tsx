"use client";

/**
 * Wishlist screen — saved pieces with one-tap move to bag.
 * Snapshots mirror the bag store; the API re-validates stock/pricing at checkout.
 */
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { useCart, formatUsd, type CartItem } from "@/lib/cart";
import { useWishlist } from "@/lib/wishlist";

export default function WishlistPage() {
  const items = useWishlist((s) => s.items);
  const remove = useWishlist((s) => s.remove);
  const clear = useWishlist((s) => s.clear);
  const addFromSnapshot = useCart((s) => s.addFromSnapshot);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => setHydrated(true), []);

  const moveToBag = (item: (typeof items)[number]) => {
    const snapshot: Omit<CartItem, "quantity"> = {
      sku: item.sku,
      name: item.name,
      slug: item.slug,
      size: item.size,
      colorway: item.colorway,
      priceMinor: item.priceMinor,
      image: item.image,
      badge: item.badge,
      collectionLabel: item.collectionLabel,
      maxStock: item.maxStock,
    };
    addFromSnapshot(snapshot);
    remove(item.sku);
  };

  return (
    <div className="flex min-h-screen w-full flex-col bg-canvas">
      <SiteHeader />
      <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-12 lg:px-12">
        <div className="mb-10 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <span className="material-symbols-outlined filled text-xl text-brand">
                favorite
              </span>
              <span className="font-display text-[11px] font-bold uppercase tracking-[0.22em] text-charcoal-light">
                Saved Archive
              </span>
            </div>
            <h1 className="font-display text-4xl font-bold uppercase tracking-tight text-charcoal md:text-5xl">
              Your Wishlist
            </h1>
            <p className="mt-2 max-w-md text-sm text-charcoal-muted">
              {hydrated && items.length > 0
                ? `${items.length} piece${items.length === 1 ? "" : "s"} on hold. Stock is not reserved — claim before the batch closes.`
                : "Pin pieces you are hunting and claim them before the vault closes."}
            </p>
          </div>
          {hydrated && items.length > 0 ? (
            <button
              type="button"
              onClick={clear}
              className="flex items-center gap-2 rounded-full border border-neutral-200/80 bg-white px-5 py-2.5 font-display text-xs font-bold uppercase tracking-wider text-charcoal-muted transition-colors hover:border-brand hover:text-brand"
            >
              <span className="material-symbols-outlined text-base">delete_sweep</span>
              Clear All
            </button>
          ) : null}
        </div>

        {hydrated && items.length === 0 ? (
          <div className="flex flex-col items-center rounded-3xl border border-dashed border-neutral-300/70 bg-white/60 px-6 py-24 text-center">
            <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-surface-muted">
              <span className="material-symbols-outlined text-4xl text-charcoal-light">
                heart_plus
              </span>
            </div>
            <h2 className="mb-2 font-display text-2xl font-bold uppercase text-charcoal">
              Nothing saved yet
            </h2>
            <p className="mb-8 max-w-sm text-sm text-charcoal-muted">
              Tap the heart on any piece to pin it here while you keep hunting the
              archive.
            </p>
            <Link href="/shop" className="btn-pill-coral">
              Explore the Drop
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((item) => (
              <div
                key={item.sku}
                className="group flex flex-col overflow-hidden rounded-2xl border border-neutral-200/60 bg-white shadow-card transition-all hover:-translate-y-1 hover:shadow-float"
              >
                <Link
                  href={`/product/${item.slug}`}
                  className="relative block aspect-[4/5] overflow-hidden bg-surface-muted"
                >
                  {item.image ? (
                    <Image
                      src={item.image}
                      alt={item.name}
                      fill
                      sizes="(max-width: 640px) 92vw, 380px"
                      className="object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                  ) : null}
                  {item.badge ? (
                    <span className="absolute left-3 top-3 rounded-full bg-brand px-3 py-1 font-display text-[10px] font-bold uppercase tracking-wider text-white shadow-sm">
                      {item.badge}
                    </span>
                  ) : null}
                </Link>

                <div className="flex flex-1 flex-col gap-3 p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      {item.collectionLabel ? (
                        <span className="mb-1 block font-display text-[10px] font-bold uppercase tracking-[0.16em] text-charcoal-light">
                          {item.collectionLabel}
                        </span>
                      ) : null}
                      <Link
                        href={`/product/${item.slug}`}
                        className="block truncate font-display text-sm font-bold text-charcoal transition-colors hover:text-brand"
                      >
                        {item.name}
                      </Link>
                      <span className="mt-0.5 block text-xs text-charcoal-muted">
                        {item.colorway} • Size {item.size}
                      </span>
                    </div>
                    <span className="shrink-0 font-display text-base font-bold text-charcoal">
                      {formatUsd(item.priceMinor)}
                    </span>
                  </div>

                  {item.maxStock > 0 && item.maxStock <= 4 ? (
                    <span className="font-display text-[10px] font-bold uppercase tracking-wider text-brand">
                      Only {item.maxStock} left in {item.size}
                    </span>
                  ) : item.maxStock === 0 ? (
                    <span className="font-display text-[10px] font-bold uppercase tracking-wider text-charcoal-muted">
                      Sold out in {item.size} — watch for restock
                    </span>
                  ) : null}

                  <div className="mt-auto flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      disabled={item.maxStock === 0}
                      onClick={() => moveToBag(item)}
                      className="flex h-10 flex-1 items-center justify-center gap-2 rounded-full bg-charcoal font-display text-xs font-bold uppercase tracking-wider text-canvas transition-all hover:bg-brand active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <span className="material-symbols-outlined text-base">
                        shopping_bag
                      </span>
                      Add to Bag
                    </button>
                    <button
                      type="button"
                      aria-label="Remove from wishlist"
                      onClick={() => remove(item.sku)}
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-muted text-charcoal-muted transition-colors hover:bg-error-container hover:text-error"
                    >
                      <span className="material-symbols-outlined text-lg">close</span>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
