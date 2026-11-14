"use client";

/**
 * Product card — matches the mockup's catalog card:
 * white rounded-2xl, 4:5 image, floating badge chip, wishlist heart,
 * meta row, title, one-liner, price + Add pill.
 */
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import type { Product, ProductVariant } from "@crunchrr/shared";
import { useCart } from "@/lib/cart";
import { useWishlist } from "@/lib/wishlist";
import { cn, formatUsd } from "@/lib/utils";

const BADGE_TONES: Record<string, string> = {
  coral: "bg-brand text-white",
  charcoal: "bg-charcoal text-white",
  jade: "bg-jade-tint text-jade-deep",
  error: "bg-error-container text-error",
};

type Props = {
  product: Product;
  /** Pre-selected variant (e.g. first in stock). */
  variant?: ProductVariant;
  className?: string;
};

export function ProductCard({ product, variant, className }: Props) {
  const add = useCart((s) => s.add);
  const [added, setAdded] = useState(false);
  const wishlistItems = useWishlist((s) => s.items);
  const wishlistToggle = useWishlist((s) => s.toggle);

  const inStock = product.variants.filter((v) => v.stock > 0);
  const chosen = variant ?? inStock[0] ?? product.variants[0];

  if (!chosen) return null;
  const wish = wishlistItems.some((i) => i.sku === chosen.sku);

  const image = product.images[0];
  const metaLabel = product.gsmLabel
    ? product.fabricLabel || `${product.collection} • ${product.gsmLabel}`
    : product.fabricLabel || product.collection;

  const handleAdd = () => {
    if (!chosen || chosen.stock === 0) return;
    add(product, chosen);
    setAdded(true);
    window.setTimeout(() => setAdded(false), 1500);
  };

  return (
    <div className={cn("group card-product flex flex-col justify-between p-4", className)}>
      <div>
        <div className="relative mb-4 aspect-[4/5] w-full overflow-hidden rounded-xl bg-neutral-100">
          <Link href={`/product/${product.slug}`} aria-label={product.name}>
            <Image
              src={image?.url ?? ""}
              alt={image?.alt ?? product.name}
              fill
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
              className="object-cover transition-transform duration-700 ease-out group-hover:scale-105"
            />
          </Link>

          {product.badge ? (
            <span
              className={cn(
                "absolute left-3 top-3 rounded-full px-2.5 py-1 font-display text-[9px] font-bold uppercase tracking-[0.14em] shadow-sm",
                BADGE_TONES[product.badge.tone] ?? BADGE_TONES.charcoal,
              )}
            >
              {product.badge.text}
            </span>
          ) : null}

          <button
            type="button"
            title="Save to Wishlist"
            aria-label="Save to wishlist"
            onClick={() => wishlistToggle(product, chosen)}
            className={cn(
              "absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full border border-white/60 bg-white/90 shadow-sm backdrop-blur-md transition-colors hover:bg-white",
              wish ? "text-brand" : "text-charcoal hover:text-brand",
            )}
          >
            <span
              className={cn("material-symbols-outlined text-[16px]", wish && "filled")}
            >
              favorite
            </span>
          </button>
        </div>

        <div className="mb-1 flex items-center justify-between text-[11px]">
          <span className="font-display font-medium uppercase tracking-[0.16em] text-charcoal-light">
            {metaLabel}
          </span>
          {product.unitsLeftLabel ? (
            <span
              className={cn(
                "font-display text-[10px] font-bold uppercase tracking-wider",
                product.unitsLeftLabel.toLowerCase().includes("left") ? "text-brand" : "text-charcoal-light",
              )}
            >
              {product.unitsLeftLabel}
            </span>
          ) : null}
        </div>

        <h4 className="mb-1 line-clamp-1 font-display text-sm font-bold text-charcoal transition-colors group-hover:text-brand">
          <Link href={`/product/${product.slug}`}>{product.name}</Link>
        </h4>
        <p className="mb-4 line-clamp-1 text-xs font-light text-charcoal-muted">
          {product.tagline}
        </p>
      </div>

      <div className="flex items-center justify-between border-t border-neutral-100 pt-3">
        <span className="font-display text-base font-bold text-charcoal">
          {formatUsd(chosen.priceMinor)}
        </span>
        <button
          type="button"
          onClick={handleAdd}
          disabled={chosen.stock === 0}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 font-display text-[10px] font-semibold uppercase tracking-wider transition-all",
            added
              ? "bg-jade text-white"
              : chosen.stock === 0
                ? "cursor-not-allowed bg-neutral-100 text-charcoal-light"
                : "bg-neutral-100 text-charcoal hover:bg-brand hover:text-white",
          )}
        >
          <span className="material-symbols-outlined text-[14px]">
            {added ? "done" : chosen.stock === 0 ? "block" : "add"}
          </span>
          <span>{added ? "Added" : chosen.stock === 0 ? "Sold" : "Add"}</span>
        </button>
      </div>
    </div>
  );
}
