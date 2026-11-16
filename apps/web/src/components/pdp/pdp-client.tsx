"use client";

/**
 * PDP interactive panel — gallery rail, colorway swatches, size grid with
 * per-size stock, quantity stepper, add-to-bag, accordions, size guide modal.
 * All state derived from the server-fetched Product payload.
 */
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import type { Product } from "@crunchrr/shared";
import { useCart } from "@/lib/cart";
import { useWishlist } from "@/lib/wishlist";
import { cn, formatUsd } from "@/lib/utils";
import { DROP } from "@/lib/drop";

type Props = { product: Product };

const ACCORDIONS = [
  { id: "specs", icon: "texture", label: "Fit & Material Specs" },
  { id: "shipping", icon: "local_shipping", label: "Drop & Shipping Details" },
  { id: "sustainability", icon: "eco", label: "Sustainability & Craft" },
] as const;

export function PdpClient({ product }: Props) {
  const add = useCart((s) => s.add);
  const wishlistItems = useWishlist((s) => s.items);
  const wishlistToggle = useWishlist((s) => s.toggle);
  const [activeImage, setActiveImage] = useState(0);
  const [openAcc, setOpenAcc] = useState<string | null>("specs");
  const [sizeGuideOpen, setSizeGuideOpen] = useState(false);
  const [zoomOpen, setZoomOpen] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);

  /* Colorways = unique colorway groups; sizes from variants of that colorway */
  const colorways = useMemo(() => {
    const map = new Map<string, typeof product.variants>();
    for (const v of product.variants) {
      const arr = map.get(v.colorway) ?? [];
      arr.push(v);
      map.set(v.colorway, arr);
    }
    return Array.from(map.entries()).map(([name, variants]) => ({
      name,
      hex: variants[0]?.colorHex ?? "#121212",
      variants,
    }));
  }, [product]);

  const [colorIndex, setColorIndex] = useState(0);
  const colorway = colorways[colorIndex] ?? colorways[0];

  const sizes = colorway?.variants ?? [];
  const [sizeSku, setSizeSku] = useState<string | null>(null);
  const selectedVariant =
    sizes.find((v) => v.sku === sizeSku) ??
    sizes.find((v) => v.stock > 0) ??
    sizes[0];

  const compare = selectedVariant?.comparePriceMinor ?? null;
  const savePct =
    compare && compare > (selectedVariant?.priceMinor ?? 0)
      ? Math.round(100 - ((selectedVariant?.priceMinor ?? 0) / compare) * 100)
      : null;

  const skuLabel = selectedVariant
    ? `SKU: ${selectedVariant.sku}`
    : "SKU: pending";

  const handleAdd = () => {
    if (!product || !selectedVariant || selectedVariant.stock === 0) return;
    add(product, selectedVariant, { quantity });
    setAdded(true);
    window.setTimeout(() => setAdded(false), 2000);
  };

  const wishActive = selectedVariant
    ? wishlistItems.some((i) => i.sku === selectedVariant.sku)
    : false;

  /* Real stock-derived limit badge — no hardcoded "300 Pcs". */
  const totalStock = useMemo(
    () => product.variants.reduce((sum, v) => sum + Math.max(v.stock, 0), 0),
    [product],
  );
  const limitLabel =
    totalStock > 0 ? `Limited ${Math.min(totalStock, 500)} Pcs` : "Archival Run";

  /* Size-guide title follows the product category. */
  const guideTitle = /hoodie|fleece|sweat/i.test(product.category)
    ? "Hoodie Size Guide"
    : /tee|shirt|top/i.test(product.category)
      ? "Tee Size Guide"
      : /pant|cargo|bottom|short/i.test(product.category)
        ? "Bottoms Size Guide"
        : "Size Guide";

  /* Modal hygiene: Escape closes, page scroll locks while open. */
  useEffect(() => {
    if (!sizeGuideOpen && !zoomOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSizeGuideOpen(false);
        setZoomOpen(false);
      }
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [sizeGuideOpen, zoomOpen]);

  const ctaLabel = added
    ? "Added to Bag"
    : selectedVariant
      ? "Add to Bag"
      : "Sold Out";

  return (
    <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
      {/* ============================ GALLERY ============================ */}
      <div className="flex flex-col-reverse gap-4 lg:col-span-7 md:flex-row">
        {/* Thumb rail */}
        <div className="no-scrollbar flex shrink-0 gap-2 overflow-x-auto pb-2 md:flex-col md:overflow-visible md:pb-0">
          {product.images.map((img, i) => (
            <button
              key={img.id}
              type="button"
              onClick={() => setActiveImage(i)}
              aria-label={`View ${img.label ?? `image ${i + 1}`}`}
              className={cn(
                "relative h-24 w-20 shrink-0 overflow-hidden rounded bg-surface-muted transition-all duration-300",
                activeImage === i
                  ? "opacity-100 ring-2 ring-brand"
                  : "opacity-60 hover:opacity-100",
              )}
            >
              <Image
                src={img.url}
                alt={img.alt}
                fill
                sizes="80px"
                className="object-cover"
              />
              {img.label ? (
                <span className="absolute bottom-1 left-1 rounded bg-charcoal/80 px-1 text-[10px] font-bold text-canvas">
                  {img.label}
                </span>
              ) : null}
            </button>
          ))}
        </div>

        {/* Main frame */}
        <div className="relative min-h-[520px] flex-1 overflow-hidden rounded-lg bg-surface-muted shadow-sm md:min-h-[640px]">
          <div className="relative h-full min-h-[520px] w-full md:min-h-[640px]">
            {product.images[activeImage] ? (
              <Image
                key={product.images[activeImage].id}
                src={product.images[activeImage].url}
                alt={product.images[activeImage].alt}
                fill
                priority
                sizes="(max-width: 1024px) 100vw, 55vw"
                className="object-cover object-top transition-opacity duration-300"
              />
            ) : null}
          </div>

          {/* Badges */}
          <div className="absolute left-4 top-4 z-10 flex flex-col gap-1.5">
            <div className="flex items-center gap-1.5 rounded-full bg-brand px-4 py-1.5 font-display text-sm font-bold uppercase text-white shadow-md">
              <span className="material-symbols-outlined text-base">
                local_fire_department
              </span>
              <span>{limitLabel}</span>
            </div>
            <div className="rounded-full bg-white/90 px-3 py-1.5 font-display text-[10px] font-bold uppercase tracking-wider text-charcoal backdrop-blur-md">
              {product.gsmLabel} Heavy Cotton
            </div>
          </div>

          <div className="absolute bottom-4 right-4 z-10 hidden max-w-[210px] items-center gap-3 rounded bg-white/95 p-4 shadow-xl backdrop-blur-lg sm:flex">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand">
              <span className="material-symbols-outlined text-lg">check_circle</span>
            </div>
            <div>
              <p className="text-xs font-bold uppercase leading-tight text-charcoal">
                Authentic Batch
              </p>
              <p className="text-xs text-charcoal-muted">NFC chip verified & sealed</p>
            </div>
          </div>

          <button
            type="button"
            aria-label="Zoom image"
            onClick={() => setZoomOpen(true)}
            className="absolute right-4 top-4 flex h-11 w-11 items-center justify-center rounded-full bg-white/80 text-charcoal shadow-md backdrop-blur-md transition-colors hover:bg-white"
          >
            <span className="material-symbols-outlined text-xl">zoom_in</span>
          </button>
        </div>
      </div>

      {/* ========================= PURCHASE PANEL ========================= */}
      <div className="flex flex-col rounded-lg bg-white p-6 shadow-sm md:p-8 lg:col-span-5">
        {/* Reviews */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <div className="flex text-brand">
              {Array.from({ length: 5 }).map((_, i) => (
                <span key={i} className="material-symbols-outlined filled text-base">
                  star
                </span>
              ))}
            </div>
            <span className="text-sm font-bold text-charcoal">
              {product.rating.toFixed(1)}
            </span>
            <span className="text-xs text-charcoal-muted">
              ({product.reviewCount} reviews)
            </span>
          </div>
          <div className="inline-flex items-center gap-1.5 rounded-full bg-surface-muted px-2.5 py-1">
            <span className="material-symbols-outlined text-sm text-jade-deep">shield</span>
            <span className="text-[11px] font-bold uppercase tracking-wider text-charcoal">
              The Vybe Tribe Verified
            </span>
          </div>
        </div>

        <h1 className="pt-2 font-display text-3xl font-bold uppercase leading-none tracking-tight text-charcoal md:text-4xl">
          {product.name}
        </h1>

        {/* Price block */}
        <div className="pb-2 pt-3">
          <div className="flex items-baseline gap-3">
            <span className="font-display text-3xl font-bold tracking-tight leading-none text-brand md:text-4xl">
              {formatUsd(selectedVariant?.priceMinor ?? 0)}
            </span>
            {compare ? (
              <span className="text-base text-charcoal-muted line-through">
                {formatUsd(compare)}
              </span>
            ) : null}
            {savePct ? (
              <span className="rounded-full bg-jade-tint px-2 py-0.5 font-display text-[10px] font-bold uppercase text-jade-deep">
                Save {savePct}%
              </span>
            ) : null}
          </div>
          <div className="mt-1.5 flex items-center gap-1 text-xs text-charcoal-muted">
            <span>or 4 interest-free payments of</span>
            <span className="font-display text-xs font-bold text-charcoal">
              {formatUsd(Math.round((selectedVariant?.priceMinor ?? 0) / 4))}
            </span>
            <span>with</span>
            <span className="rounded bg-surface-muted px-1.5 py-0.5 font-display text-[10px] font-bold text-charcoal">
              Klarna
            </span>
          </div>
        </div>

        <div className="my-4 h-px w-full bg-surface-subtle" />

        {/* Colorways */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-display text-xs font-bold uppercase tracking-wider text-charcoal-muted">
              Colorway:
            </span>
            <span className="font-display text-xs font-bold uppercase tracking-wider text-charcoal">
              {colorway?.name}
            </span>
          </div>
          <div className="flex items-center gap-3">
            {colorways.map((c, i) => (
              <button
                key={c.name}
                type="button"
                aria-label={`Select ${c.name}`}
                onClick={() => {
                  setColorIndex(i);
                  setSizeSku(null);
                }}
                className={cn(
                  "flex items-center rounded-full p-1 transition-all",
                  colorIndex === i
                    ? "ring-2 ring-brand"
                    : "ring-1 ring-surface-subtle hover:ring-brand",
                )}
              >
                <span
                  className="flex h-9 w-9 items-center justify-center rounded-full shadow-inner"
                  style={{ backgroundColor: c.hex }}
                >
                  {colorIndex === i ? (
                    <span className="material-symbols-outlined text-sm text-white drop-shadow">
                      check
                    </span>
                  ) : null}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Sizes */}
        <div className="mt-5 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="font-display text-xs font-bold uppercase tracking-wider text-charcoal-muted">
                Select Size
              </span>
              {selectedVariant && selectedVariant.stock <= 5 && selectedVariant.stock > 0 ? (
                <span className="inline-flex items-center gap-1 font-display text-[10px] font-bold uppercase text-brand">
                  <span className="h-1.5 w-1.5 rounded-full bg-brand" />
                  Only {selectedVariant.stock} left in {selectedVariant.size}
                </span>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => setSizeGuideOpen(true)}
              className="inline-flex items-center gap-1 font-display text-[10px] font-bold uppercase tracking-wider text-charcoal transition-colors hover:text-brand"
            >
              <span className="material-symbols-outlined text-base">straighten</span>
              <span>Find Your Size</span>
            </button>
          </div>
          <div className="grid grid-cols-5 gap-2">
            {sizes.map((v) => {
              const sold = v.stock === 0;
              const active = selectedVariant?.sku === v.sku;
              return (
                <button
                  key={v.sku}
                  type="button"
                  disabled={sold}
                  onClick={() => {
                    setSizeSku(v.sku);
                    setQuantity(1);
                  }}
                  className={cn(
                    "rounded-full py-3 text-center font-display text-xs font-bold uppercase tracking-wider transition-colors",
                    sold
                      ? "cursor-not-allowed bg-surface-muted text-charcoal-light line-through"
                      : active
                        ? "bg-charcoal text-white shadow-md"
                        : "bg-surface-muted text-charcoal hover:bg-surface-subtle",
                  )}
                >
                  {v.size === "ONE_SIZE" ? "OS" : v.size}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-charcoal-muted">
            *{product.specs.fit || "Relaxed boxy cut. Size down for true-to-body street fit."}
          </p>
        </div>

        {/* Quantity + CTA */}
        <div className="mt-5 space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex h-12 items-center rounded-full bg-surface-muted px-1.5 py-1.5">
              <button
                type="button"
                aria-label="Decrease quantity"
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                className="flex h-8 w-8 items-center justify-center rounded-full text-charcoal transition-colors hover:bg-surface-subtle"
              >
                <span className="material-symbols-outlined text-base">remove</span>
              </button>
              <span className="w-10 text-center font-display text-base font-bold text-charcoal">
                {quantity}
              </span>
              <button
                type="button"
                aria-label="Increase quantity"
                onClick={() =>
                  setQuantity((q) =>
                    Math.min(q + 1, Math.min(selectedVariant?.stock ?? 1, 10)),
                  )
                }
                className="flex h-8 w-8 items-center justify-center rounded-full text-charcoal transition-colors hover:bg-surface-subtle"
              >
                <span className="material-symbols-outlined text-base">add</span>
              </button>
            </div>

            <button
              type="button"
              onClick={handleAdd}
              disabled={!selectedVariant || selectedVariant.stock === 0}
              className={cn(
                "order-3 flex h-12 w-full min-w-0 items-center justify-center gap-3 rounded-full px-6 font-display text-sm font-bold uppercase tracking-wider shadow-lg transition-all active:scale-[0.98] sm:order-2 sm:w-auto sm:flex-1",                !selectedVariant || selectedVariant.stock === 0
                  ? "cursor-not-allowed bg-surface-subtle text-charcoal-light"
                  : added
                    ? "bg-jade-deep text-white"
                    : "bg-brand text-white hover:bg-brand-dark",
              )}
            >
              <span className="material-symbols-outlined text-xl">
                {added ? "check_circle" : "shopping_bag"}
              </span>
              <span className="truncate">{ctaLabel}</span>
              {added ? null : (
                <span className="material-symbols-outlined text-lg">arrow_forward</span>
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                if (selectedVariant) wishlistToggle(product, selectedVariant);
              }}
              aria-label="Toggle wishlist"
              className="order-2 ml-auto flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-surface-muted text-charcoal transition-colors hover:bg-surface-subtle sm:order-3 sm:ml-0"
            >
              <span
                className={cn(
                  "material-symbols-outlined text-xl transition-transform active:scale-125",
                  wishActive ? "filled text-brand" : "text-charcoal-muted",
                )}
              >
                {wishActive ? "favorite" : "favorite_border"}
              </span>
            </button>
          </div>

          {/* Express buy */}
          <button
            type="button"
            onClick={handleAdd}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[#5a31f4] font-display text-sm font-bold uppercase tracking-wider text-white shadow-md transition-all hover:bg-[#4b27d4]"
          >
            <span>Buy with</span>
            <span className="text-base font-bold lowercase italic tracking-tight">
              ShopPay
            </span>
          </button>
        </div>

        {/* Trust mini-grid */}
        <div className="grid grid-cols-3 gap-2 pt-6 text-center">
          {[
            { icon: "electric_bolt", tone: "text-brand", title: "Ships in 24H", sub: "From our depot" },
            { icon: "lock", tone: "text-jade-deep", title: "Secure Drops", sub: "Anti-Bot Shield" },
            { icon: "sync", tone: "text-brand", title: "30-Day Free", sub: "Size Swaps" },
          ].map((t) => (
            <div
              key={t.title}
              className="flex flex-col items-center rounded bg-surface-muted p-2"
            >
              <span className={cn("material-symbols-outlined mb-1 text-lg", t.tone)}>
                {t.icon}
              </span>
              <span className="text-[11px] font-bold uppercase text-charcoal">{t.title}</span>
              <span className="text-[11px] text-charcoal-muted">{t.sub}</span>
            </div>
          ))}
        </div>

        {/* Accordions */}
        <div className="mt-5 space-y-1.5">
          {ACCORDIONS.map((acc) => {
            const body =
              acc.id === "specs"
                ? product.specs.material
                : acc.id === "shipping"
                  ? product.specs.shipping
                  : product.specs.sustainability;
            const open = openAcc === acc.id;
            return (
              <div key={acc.id} className="overflow-hidden rounded bg-surface-muted">
                <button
                  type="button"
                  onClick={() => setOpenAcc(open ? null : acc.id)}
                  className="flex w-full items-center justify-between px-4 py-3 text-left font-display text-sm font-bold uppercase text-charcoal"
                  aria-expanded={open}
                >
                  <span className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-base text-brand">
                      {acc.icon}
                    </span>
                    {acc.label}
                  </span>
                  <span
                    className={cn(
                      "material-symbols-outlined transition-transform duration-200",
                      open && "rotate-180",
                    )}
                  >
                    expand_more
                  </span>
                </button>
                {open ? (
                  <div className="px-4 pb-4 text-sm leading-relaxed text-charcoal-muted">
                    {body || "Details coming soon."}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>

        <span className="mt-4 inline-block self-start rounded-full bg-surface-muted px-3 py-1.5 font-display text-[10px] font-bold uppercase tracking-widest text-charcoal-muted">
          {skuLabel}
        </span>
      </div>

      {/* ======================= SIZE GUIDE MODAL ======================= */}
      {sizeGuideOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-charcoal/60 p-4 backdrop-blur-md"
          role="dialog"
          aria-modal="true"
          aria-label={guideTitle}
          onClick={() => setSizeGuideOpen(false)}
        >
          <div
            className="relative w-full max-w-2xl rounded-xl bg-white p-8 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between pb-2">
              <div>
                <span className="font-display text-[10px] font-bold uppercase text-brand">
                  Fit Architecture
                </span>
                <h3 className="font-display text-2xl font-bold uppercase text-charcoal">
                  {guideTitle}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSizeGuideOpen(false)}
                aria-label="Close size guide"
                className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-muted text-charcoal transition-colors hover:bg-surface-subtle"
              >
                <span className="material-symbols-outlined text-xl">close</span>
              </button>
            </div>
            <p className="mb-6 text-sm text-charcoal-muted">
              Measurements are taken in inches with the garment laid flat. This
              silhouette is engineered with an aggressive dropped shoulder and
              boxy chest.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-surface-muted font-display text-xs uppercase text-charcoal">
                    <th className="p-2">Size</th>
                    <th className="p-2">Chest (Pit-to-Pit)</th>
                    <th className="p-2">Length</th>
                    <th className="p-2">Sleeve</th>
                    <th className="p-2">Recommended Height</th>
                  </tr>
                </thead>
                <tbody className="text-charcoal">
                  {[
                    ["S", "24.5 in", "26.0 in", "34.0 in", `5'4" – 5'8"`],
                    ["M", "26.0 in", "27.0 in", "35.5 in", `5'8" – 5'11"`],
                    ["L", "27.5 in", "28.0 in", "36.5 in", `5'11" – 6'2"`],
                    ["XL", "29.0 in", "29.0 in", "37.5 in", `6'1" – 6'4"`],
                    ["XXL", "30.5 in", "30.0 in", "38.0 in", `6'3"+`],
                  ].map((row) => (
                    <tr key={row[0]} className="transition-colors hover:bg-surface-muted">
                      <td className="p-2 font-bold">{row[0]}</td>
                      <td className="p-2">{row[1]}</td>
                      <td className="p-2">{row[2]}</td>
                      <td className="p-2">{row[3]}</td>
                      <td className="p-2">{row[4]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={() => setSizeGuideOpen(false)}
                className="rounded-full bg-charcoal px-6 py-2.5 font-display text-xs font-bold uppercase tracking-wider text-white transition-colors hover:bg-charcoal-muted"
              >
                Got It, Back to Product
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* ========================= ZOOM LIGHTBOX ========================= */}
      {zoomOpen && product.images[activeImage] ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-charcoal/80 p-6 backdrop-blur-md"
          role="dialog"
          aria-modal="true"
          aria-label="Zoomed product image"
          onClick={() => setZoomOpen(false)}
        >
          <div className="relative h-full max-h-[86vh] w-full max-w-4xl overflow-hidden rounded-2xl bg-surface-muted shadow-2xl">
            <Image
              src={product.images[activeImage].url}
              alt={product.images[activeImage].alt}
              fill
              sizes="(max-width: 1024px) 100vw, 60vw"
              className="object-contain"
            />
          </div>
          <button
            type="button"
            onClick={() => setZoomOpen(false)}
            aria-label="Close zoom"
            className="absolute right-6 top-6 flex h-11 w-11 items-center justify-center rounded-full bg-white/90 text-charcoal shadow-lg transition-colors hover:bg-white"
          >
            <span className="material-symbols-outlined text-xl">close</span>
          </button>
        </div>
      ) : null}
    </div>
  );
}
