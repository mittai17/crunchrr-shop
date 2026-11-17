"use client";

/**
 * Product card — the most repeated surface in the storefront (catalog grid,
 * drops page, wishlist mirror). Built on a size table so every measurement
 * in the card scales from one switch instead of hand-tuned padding, and on a
 * touch-aware image well so a tap gets the same affordance a hover does.
 *
 * Structure follows the 21st.dev compound-card pattern: one root that owns
 * geometry, an image well that owns the hover/press treatment, real
 * <a>/<button> controls (never a fake role="button" wrapper) and a badge
 * anchored with size-aware offsets.
 */
import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
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

/* ------------------------------------------------------------------ */
/* Size tables — every dimension in the card derives from one switch.   */
/* ------------------------------------------------------------------ */

export type ProductCardSize = "sm" | "default" | "lg";

const cardPadding: Record<ProductCardSize, string> = {
  sm: "p-3",
  default: "p-4",
  lg: "p-6",
};

const imageGap: Record<ProductCardSize, string> = {
  sm: "mb-3",
  default: "mb-4",
  lg: "mb-6",
};

const titleSize: Record<ProductCardSize, string> = {
  sm: "text-[13px]",
  default: "text-sm",
  lg: "text-base",
};

const priceSize: Record<ProductCardSize, string> = {
  sm: "text-sm",
  default: "text-base",
  lg: "text-lg",
};

const badgeOffset: Record<ProductCardSize, string> = {
  sm: "left-2 top-2",
  default: "left-3 top-3",
  lg: "left-4 top-4",
};

const wishlistOffset: Record<ProductCardSize, string> = {
  sm: "right-2 top-2 h-7 w-7",
  default: "right-3 top-3 h-8 w-8",
  lg: "right-4 top-4 h-9 w-9",
};

const addSize: Record<ProductCardSize, string> = {
  sm: "px-3 py-1 text-[9px]",
  default: "px-3.5 py-1.5 text-[10px]",
  lg: "px-5 py-2 text-[11px]",
};

type Props = {
  product: Product;
  /** Pre-selected variant (e.g. first in stock). */
  variant?: ProductVariant;
  className?: string;
  /** Card scale — drives padding, type and control sizes together. */
  size?: ProductCardSize;
};

export function ProductCard({
  product,
  variant,
  className,
  size = "default",
}: Props) {
  const add = useCart((s) => s.add);
  const [added, setAdded] = useState(false);
  const wishlistItems = useWishlist((s) => s.items);
  const wishlistToggle = useWishlist((s) => s.toggle);

  /* Touch parity: a tap has no hover, and :active is too brief to read, so
   * a touch press pins the image lift until the next press elsewhere. */
  const wellRef = useRef<HTMLDivElement>(null);
  const [pressed, setPressed] = useState(false);
  useEffect(() => {
    if (!pressed) return;
    const release = (event: PointerEvent) => {
      if (!wellRef.current?.contains(event.target as Node)) setPressed(false);
    };
    document.addEventListener("pointerdown", release);
    return () => document.removeEventListener("pointerdown", release);
  }, [pressed]);

  const inStock = product.variants.filter((v) => v.stock > 0);
  const chosen = variant ?? inStock[0] ?? product.variants[0];

  if (!chosen) return null;
  const wish = wishlistItems.some((i) => i.sku === chosen.sku);

  const image = product.images[0];
  const metaLabel = product.gsmLabel
    ? product.fabricLabel || `${product.collection} • ${product.gsmLabel}`
    : product.fabricLabel || product.collection;

  const handleAdd = () => {
    if (chosen.stock === 0) return;
    add(product, chosen);
    setAdded(true);
    window.setTimeout(() => setAdded(false), 1500);
  };

  return (
    <article
      className={cn(
        "group card-product relative flex flex-col justify-between",
        cardPadding[size],
        className,
      )}
    >
      <div>
        {/* Image well */}
        <div
          ref={wellRef}
          className={cn(
            "relative w-full overflow-hidden rounded-xl bg-neutral-100",
            imageGap[size],
            "aspect-[4/5]",
          )}
          onPointerDown={(e) => {
            if (e.pointerType === "touch") setPressed(true);
          }}
        >
          <Link
            href={`/product/${product.slug}`}
            aria-label={product.name}
            className="block h-full w-full"
          >
            <Image
              src={image?.url ?? ""}
              alt={image?.alt ?? product.name}
              fill
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
              className={cn(
                "object-cover transition-transform duration-700 ease-out group-hover:scale-105",
                pressed && "scale-105",
              )}
            />
          </Link>

          {product.badge ? (
            <span
              className={cn(
                "absolute rounded-full px-2.5 py-1 font-display text-[10px] font-bold uppercase tracking-[0.14em] shadow-sm",
                badgeOffset[size],
                BADGE_TONES[product.badge.tone] ?? BADGE_TONES.charcoal,
              )}
            >
              {product.badge.text}
            </span>
          ) : null}

          <button
            type="button"
            title="Save to Wishlist"
            aria-label={wish ? "Remove from wishlist" : "Save to wishlist"}
            aria-pressed={wish}
            onClick={() => wishlistToggle(product, chosen)}
            className={cn(
              "absolute z-10 flex items-center justify-center rounded-full border border-white/60 bg-white/90 shadow-sm backdrop-blur-md transition-colors hover:bg-white",
              wishlistOffset[size],
              wish ? "text-brand" : "text-charcoal hover:text-brand",
            )}
          >
            <span
              className={cn(
                "material-symbols-outlined",
                size === "sm" ? "text-[14px]" : "text-[16px]",
                wish && "filled",
              )}
            >
              favorite
            </span>
          </button>
        </div>

        {/* Meta row */}
        <div className="mb-1 flex items-center justify-between gap-2 text-[11px]">
          <span className="truncate font-display font-medium uppercase tracking-[0.16em] text-charcoal-muted">
            {metaLabel}
          </span>
          {product.unitsLeftLabel ? (
            <span
              className={cn(
                "shrink-0 font-display text-[10px] font-bold uppercase tracking-wider",
                product.unitsLeftLabel.toLowerCase().includes("left")
                  ? "text-brand"
                  : "text-charcoal-muted",
              )}
            >
              {product.unitsLeftLabel}
            </span>
          ) : null}
        </div>

        <h3
          className={cn(
            "mb-1 line-clamp-1 font-display font-bold text-charcoal",
            titleSize[size],
          )}
        >
          <Link
            href={`/product/${product.slug}`}
            className="transition-colors after:absolute after:inset-0 hover:text-brand"
          >
            {product.name}
          </Link>
        </h3>
        <p className="mb-4 line-clamp-1 text-xs font-light text-charcoal-muted">
          {product.tagline}
        </p>
      </div>

      {/* Price + add */}
      <div className="flex items-center justify-between border-t border-neutral-100 pt-3">
        <span
          className={cn(
            "font-display font-bold text-charcoal",
            priceSize[size],
          )}
        >
          {formatUsd(chosen.priceMinor)}
        </span>
        <button
          type="button"
          onClick={handleAdd}
          disabled={chosen.stock === 0}
          aria-label={
            chosen.stock === 0
              ? `${product.name} is sold out`
              : `Add ${product.name} to bag`
          }
          className={cn(
            "relative z-10 inline-flex items-center gap-1.5 rounded-full font-display font-semibold uppercase tracking-wider transition-colors",
            addSize[size],
            added
              ? "bg-jade text-white"
              : chosen.stock === 0
                ? "cursor-not-allowed bg-neutral-100 text-charcoal-muted"
                : "bg-neutral-100 text-charcoal hover:bg-brand hover:text-white",
          )}
        >
          <span className="material-symbols-outlined text-[14px]">
            {added ? "done" : chosen.stock === 0 ? "block" : "add"}
          </span>
          <span>{added ? "Added" : chosen.stock === 0 ? "Sold" : "Add"}</span>
        </button>
      </div>
    </article>
  );
}
