"use client";

/**
 * Catalog filter sidebar — URL-driven state (shareable, cacheable, SSR-safe).
 * Only real, API-backed filters live here (category + size). Decorative
 * widgets that looked interactive but did nothing have been removed.
 */
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { DROP } from "@/lib/drop";

const CATEGORIES = [
  { id: "", label: "All Pieces" },
  { id: "HOODIES", label: "Hoodies & Sweats" },
  { id: "TEES", label: "Oversized Tees" },
  { id: "BOTTOMS", label: "Bottoms & Cargos" },
  { id: "OUTERWEAR", label: "Outerwear & Shells" },
  { id: "HEADWEAR", label: "Headwear & Utility" },
];

const SIZES = ["XS", "S", "M", "L", "XL", "XXL"] as const;

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
                    selected ? "bg-surface-subtle" : "hover:bg-surface-muted",
                  )}
                >
                  <span className="flex items-center gap-2">
                    {selected ? (
                      <span className="h-2 w-2 rounded-full bg-brand" />
                    ) : null}
                    <span
                      className={cn(
                        "text-sm",
                        selected ? "font-bold text-charcoal" : "text-charcoal-muted",
                      )}
                    >
                      {c.label}
                    </span>
                  </span>
                  {selected ? (
                    <span className="material-symbols-outlined text-[16px] text-brand">
                      check
                    </span>
                  ) : null}
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
      </div>

      {/* Drop alerts — honest pointer, no fake form */}
      <div className="relative overflow-hidden rounded-lg bg-surface-subtle p-6 text-charcoal">
        <span className="font-display text-[10px] font-bold uppercase tracking-widest text-brand">
          Next Vault
        </span>
        <h5 className="mt-1 font-display text-lg font-bold uppercase tracking-tight">
          {DROP.batchLabel} Countdown
        </h5>
        <p className="mb-4 mt-1 text-xs text-charcoal-muted">
          Watch the live window on the drops page — allocations close when the
          timer hits zero.
        </p>
        <Link
          href="/drops"
          className="inline-flex items-center gap-1.5 rounded-full bg-brand px-4 py-2 font-display text-[10px] font-bold uppercase tracking-wider text-white transition-colors hover:bg-brand-dark"
        >
          Open Drops
          <span className="material-symbols-outlined text-sm">arrow_forward</span>
        </Link>
      </div>
    </aside>
  );
}
