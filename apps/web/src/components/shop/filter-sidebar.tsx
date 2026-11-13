"use client";

/**
 * Catalog filter sidebar — URL-driven state (shareable, cacheable, SSR-safe).
 */
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

const CATEGORIES = [
  { id: "", label: "All Pieces", count: 48 },
  { id: "HOODIES", label: "Hoodies & Sweats", count: 14 },
  { id: "TEES", label: "Oversized Tees", count: 12 },
  { id: "BOTTOMS", label: "Bottoms & Cargos", count: 9 },
  { id: "OUTERWEAR", label: "Outerwear & Shells", count: 7 },
  { id: "HEADWEAR", label: "Headwear & Utility", count: 6 },
];

const SIZES = ["XS", "S", "M", "L", "XL", "XXL"] as const;

const SWATCHES = [
  { hex: "#F45B50", title: "Coral Punch" },
  { hex: "#F5F3F0", title: "Raw Cream" },
  { hex: "#151515", title: "Onyx Black" },
  { hex: "#3E5241", title: "Moss Green" },
  { hex: "#4A4846", title: "Acid Wash" },
];

export function FilterSidebar() {
  const pathname = usePathname();
  const params = useSearchParams();
  const category = params.get("category") ?? "";
  const size = params.get("size") ?? "";

  const buildHref = (updates: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value === null || value === "") {
        next.delete(key);
      } else {
        next.set(key, value);
      }
    }
    const qs = next.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  };

  return (
    <aside className="sticky top-28 hidden space-y-6 lg:col-span-3 lg:block">
      <div className="space-y-6 rounded-lg bg-white p-6 shadow-sm">
        {/* Header */}
        <div className="flex items-center justify-between pb-1">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-brand">tune</span>
            <span className="font-display text-sm font-bold uppercase tracking-tight text-charcoal">
              Filters
            </span>
          </div>
          <Link
            href={pathname}
            className="font-display text-[10px] font-bold uppercase tracking-wider text-brand transition-colors hover:text-brand-dark"
          >
            Reset All
          </Link>
        </div>

        {/* Category */}
        <div className="space-y-2">
          <span className="block font-display text-xs font-bold uppercase tracking-wider text-charcoal">
            Category
          </span>
          <div className="space-y-1">
            {CATEGORIES.map((c) => {
              const selected = category === c.id;
              return (
                <Link
                  key={c.label}
                  href={buildHref({ category: c.id || null })}
                  className={cn(
                    "flex items-center justify-between rounded-md p-2 transition-colors",
                    selected
                      ? "bg-surface-subtle"
                      : "hover:bg-surface-muted",
                  )}
                >
                  <span className="flex items-center gap-2">
                    {selected ? (
                      <span className="h-2 w-2 rounded-full bg-brand" />
                    ) : null}
                    <span
                      className={cn(
                        "text-sm",
                        selected
                          ? "font-bold text-charcoal"
                          : "text-charcoal-muted group-hover:text-charcoal",
                      )}
                    >
                      {c.label}
                    </span>
                  </span>
                  <span
                    className={cn(
                      "font-display text-[10px] font-bold",
                      selected ? "text-brand" : "text-charcoal-light",
                    )}
                  >
                    {c.count}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>

        {/* Size pills */}
        <div className="space-y-2 pt-1">
          <span className="block font-display text-xs font-bold uppercase tracking-wider text-charcoal">
            Size Fit
          </span>
          <div className="grid grid-cols-3 gap-2">
            {SIZES.map((s) => {
              const selected = size === s;
              return (
                <Link
                  key={s}
                  href={buildHref({ size: selected ? null : s })}
                  className={cn(
                    "rounded-full py-2 text-center font-display text-xs font-bold uppercase tracking-wider transition-colors",
                    selected
                      ? "bg-charcoal text-white shadow-sm"
                      : "bg-surface-muted text-charcoal-muted hover:bg-surface-subtle",
                  )}
                >
                  {s}
                </Link>
              );
            })}
          </div>
        </div>

        {/* Colorway swatches */}
        <div className="space-y-2 pt-1">
          <span className="block font-display text-xs font-bold uppercase tracking-wider text-charcoal">
            Drop Palette
          </span>
          <div className="flex flex-wrap items-center gap-2">
            {SWATCHES.map((s) => (
              <button
                key={s.title}
                type="button"
                title={s.title}
                aria-label={`Filter by ${s.title}`}
                className="h-8 w-8 rounded-full transition-transform hover:scale-105"
                style={{ backgroundColor: s.hex }}
              />
            ))}
          </div>
        </div>

        {/* Price scope */}
        <div className="space-y-2 pt-1">
          <div className="flex items-center justify-between">
            <span className="font-display text-xs font-bold uppercase tracking-wider text-charcoal">
              Price Scope
            </span>
            <span className="font-display text-[10px] font-bold text-brand">
              $25 – $150
            </span>
          </div>
          <div className="flex justify-between font-display text-[10px] text-charcoal-light">
            <span>$20</span>
            <span>$200</span>
          </div>
        </div>

        {/* Vault status */}
        <div className="flex items-center justify-between rounded bg-surface-muted p-4 pt-1">
          <div className="flex flex-col pt-1">
            <span className="font-display text-xs font-bold uppercase tracking-wider text-charcoal">
              Vault Status
            </span>
            <span className="text-xs text-charcoal-muted">In stock ready to ship</span>
          </div>
          <span className="relative inline-flex h-6 w-11 items-center rounded-full bg-brand">
            <span className="ml-[26px] h-5 w-5 rounded-full bg-white shadow" />
          </span>
        </div>
      </div>

      {/* SMS banner */}
      <div className="relative overflow-hidden rounded-lg bg-surface-subtle p-6 text-charcoal">
        <span className="font-display text-[10px] font-bold uppercase tracking-widest text-brand">
          Secret Drop 005
        </span>
        <h5 className="mt-1 font-display text-lg font-bold uppercase tracking-tight">
          Get SMS Ping
        </h5>
        <p className="mb-3 mt-1 text-xs text-charcoal-muted">
          Never miss a 60-second sellout release.
        </p>
        <div className="flex gap-1">
          <input
            type="tel"
            placeholder="+1 (555) 000-0000"
            aria-label="Phone number"
            className="w-full rounded-full bg-white px-3 py-1.5 text-xs outline-none"
          />
          <Link
            href="/drops"
            className="rounded-full bg-brand px-4 font-display text-[10px] font-bold uppercase tracking-wider text-white transition-colors hover:bg-brand-dark"
          >
            Join
          </Link>
        </div>
      </div>
    </aside>
  );
}
