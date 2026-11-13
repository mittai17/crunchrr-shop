"use client";

/** URL-driven sort select — extracted so the shop page stays a server component. */
export function SortSelect({
  value,
  options,
}: {
  value: string;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div className="flex items-center gap-1.5 rounded-full bg-surface-muted px-4 py-2 shadow-inner">
      <span className="material-symbols-outlined text-sm text-charcoal-muted">sort</span>
      <span className="font-display text-[10px] font-bold uppercase tracking-wider text-charcoal-muted">
        Sort:
      </span>
      <select
        aria-label="Sort catalog"
        value={value}
        className="cursor-pointer border-0 bg-transparent pr-1 font-display text-xs font-bold uppercase tracking-wider text-charcoal outline-none"
        onChange={(e) => {
          const params = new URLSearchParams(window.location.search);
          params.set("sort", e.target.value);
          window.location.href = `/shop?${params.toString()}`;
        }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
