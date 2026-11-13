import Link from "next/link";

/**
 * Brand-styled 404 — dead links stay on-brand.
 */
export default function NotFound() {
  return (
    <div className="flex min-h-screen w-full flex-col bg-canvas">
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center px-6 py-24 text-center">
        {/* Ghost number */}
        <div className="relative mb-6 flex select-none items-center justify-center py-6">
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 flex items-center justify-center font-display text-[130px] font-bold leading-none tracking-tighter text-charcoal/5 md:text-[170px]"
          >
            404
          </span>
          <h1 className="relative font-display text-3xl font-bold uppercase leading-tight tracking-tight text-charcoal md:text-4xl">
            Lost in the
            <br />
            Archive
          </h1>
        </div>

        <p className="mb-2 font-display text-[11px] font-bold uppercase tracking-[0.22em] text-brand">
          Error 404 • Piece Not Found
        </p>
        <p className="mb-10 max-w-md text-sm leading-relaxed text-charcoal-muted">
          This page isn't part of the current drop. It may have sold through,
          moved to the archive, or never existed — the vault keeps no squatters.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-4">
          <Link
            href="/shop"
            className="flex h-12 items-center justify-center gap-2 rounded-full bg-brand px-7 font-display text-sm font-bold uppercase tracking-wider text-white shadow-lg transition-all hover:bg-brand-dark active:scale-[0.98]"
          >
            <span className="material-symbols-outlined text-base">storefront</span>
            Shop the Drop
          </Link>
          <Link
            href="/"
            className="flex h-12 items-center justify-center gap-2 rounded-full border border-neutral-300/80 bg-white px-7 font-display text-sm font-bold uppercase tracking-wider text-charcoal transition-colors hover:border-charcoal"
          >
            Back Home
          </Link>
        </div>
      </div>
      {/* Footer-less: keep 404s lightweight */}
    </div>
  );
}
