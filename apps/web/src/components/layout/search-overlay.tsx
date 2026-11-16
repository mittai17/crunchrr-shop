"use client";

/**
 * Command-palette style catalog search (⌘K / header icon).
 * Live results from the products API; Enter jumps to /shop?search=….
 */
import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { formatUsd } from "@/lib/utils";

type SearchHit = {
  id: string;
  slug: string;
  name: string;
  category: string;
  badge?: { text: string; tone?: string } | null;
  images: Array<{ url: string }>;
  variants: Array<{ priceMinor: number }>;
};

/* API returns images[] + variants[]; derive thumbnail + cheapest price. */
function hitImage(h: SearchHit): string | null {
  return h.images?.[0]?.url ?? null;
}

function hitPriceMinor(h: SearchHit): number | null {
  const prices = (h.variants ?? [])
    .map((v) => v.priceMinor)
    .filter((p): p is number => typeof p === "number");
  return prices.length ? Math.min(...prices) : null;
}

type SearchOverlayProps = {
  open: boolean;
  onClose: () => void;
};

export function SearchOverlay({ open, onClose }: SearchOverlayProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* Autofocus + escape-to-close + scroll lock. */
  useEffect(() => {
    if (!open) return;
    setQuery("");
    setHits([]);
    const t = window.setTimeout(() => inputRef.current?.focus(), 60);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.documentElement.style.overflow = "hidden";
    return () => {
      window.clearTimeout(t);
      document.removeEventListener("keydown", onKey);
      document.documentElement.style.overflow = "";
    };
  }, [open, onClose]);

  const runSearch = useCallback((value: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = value.trim();
    if (q.length < 2) {
      setHits([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const base = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4001";
        const res = await fetch(`${base}/api/products?search=${encodeURIComponent(q)}&limit=8`);
        const json = (await res.json()) as { items?: SearchHit[]; total?: number };
        setHits(Array.isArray(json.items) ? json.items : []);
        setTotal(typeof json.total === "number" ? json.total : null);
      } catch {
        setHits([]);
      } finally {
        setLoading(false);
      }
    }, 250);
  }, []);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-start justify-center px-4 pt-[12vh]"
      role="dialog"
      aria-modal="true"
      aria-label="Search catalog"
    >
      {/* Scrim */}
      <button
        type="button"
        aria-label="Close search"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-charcoal/50 backdrop-blur-sm"
      />

      {/* Panel */}
      <div className="relative z-10 w-full max-w-xl overflow-hidden rounded-3xl bg-white shadow-float">
        <div className="flex items-center gap-3 border-b border-neutral-100 px-5 py-4">
          <span className="material-symbols-outlined text-xl text-charcoal-light">search</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              runSearch(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && query.trim()) {
                onClose();
                router.push(`/shop?search=${encodeURIComponent(query.trim())}`);
              }
            }}
            placeholder="Search the archive — hoodies, tees, drops…"
            aria-label="Search catalog"
            className="w-full bg-transparent text-sm font-medium text-charcoal outline-none placeholder:text-charcoal-light"
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-7 w-7 items-center justify-center rounded-full bg-surface-muted text-charcoal-muted transition-colors hover:bg-surface-subtle"
          >
            <span className="material-symbols-outlined text-base">close</span>
          </button>
        </div>

        <div className="max-h-[52vh] overflow-y-auto p-2">
          {loading ? (
            <div className="flex items-center justify-center gap-2 px-4 py-10 text-xs font-bold uppercase tracking-wider text-charcoal-light">
              <span className="material-symbols-outlined animate-spin text-base">
                progress_activity
              </span>
              Searching vault…
            </div>
          ) : query.trim().length >= 2 && hits.length === 0 ? (
            <div className="px-4 py-10 text-center">
              <span className="material-symbols-outlined mb-2 text-3xl text-charcoal-light">
                search_off
              </span>
              <p className="text-sm text-charcoal-muted">
                No pieces match “<span className="font-bold text-charcoal">{query}</span>”.
              </p>
              <Link
                href="/shop"
                onClick={onClose}
                className="mt-3 inline-flex items-center gap-1 font-display text-[11px] font-bold uppercase tracking-wider text-brand hover:underline"
              >
                Browse all{total ? ` ${total}` : ""} pieces
                <span className="material-symbols-outlined text-sm">arrow_forward</span>
              </Link>
            </div>
          ) : hits.length > 0 ? (
            <ul>
              {hits.map((h) => (
                <li key={h.id}>
                  <Link
                    href={`/product/${h.slug}`}
                    onClick={onClose}
                    className="flex items-center gap-4 rounded-2xl px-3 py-2.5 transition-colors hover:bg-surface-muted"
                  >
                    <span className="h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-surface-muted">
                      {hitImage(h) ? (
                        <Image
                          src={hitImage(h) as string}
                          alt={h.name}
                          width={96}
                          height={96}
                          className="h-full w-full object-cover"
                        />
                      ) : null}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-display text-sm font-bold text-charcoal">
                        {h.name}
                      </span>
                      <span className="block text-xs text-charcoal-muted">
                        {h.category}
                        {h.badge?.text ? ` • ${h.badge.text}` : ""}
                      </span>
                    </span>
                    {hitPriceMinor(h) !== null ? (
                      <span className="shrink-0 font-display text-sm font-bold text-charcoal">
                        {formatUsd(hitPriceMinor(h) as number)}
                      </span>
                    ) : null}
                    <span className="material-symbols-outlined text-base text-charcoal-muted">
                      arrow_forward
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="px-4 py-8 text-center">
              <p className="mb-3 font-display text-[10px] font-bold uppercase tracking-[0.2em] text-charcoal-light">
                Quick hunt
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                {["Hoodie", "Graphic Tee", "Cargo", "Heavy Fleece", "Drop Exclusive"].map(
                  (term) => (
                    <button
                      key={term}
                      type="button"
                      onClick={() => {
                        setQuery(term);
                        runSearch(term);
                      }}
                      className="rounded-full border border-neutral-200/80 px-4 py-1.5 font-display text-[11px] font-bold uppercase tracking-wider text-charcoal-muted transition-colors hover:border-brand hover:text-brand"
                    >
                      {term}
                    </button>
                  ),
                )}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-neutral-100 bg-surface-muted/60 px-5 py-2.5">
          <span className="font-display text-[10px] font-bold uppercase tracking-[0.2em] text-charcoal-muted">
            Crunchrr Vault Search
          </span>
          <span className="flex items-center gap-1 text-[10px] text-charcoal-muted">
            <kbd className="rounded bg-white px-1.5 py-0.5 font-display text-[10px] shadow-sm">
              ↵
            </kbd>
            all results
            <kbd className="ml-1 rounded bg-white px-1.5 py-0.5 font-display text-[10px] shadow-sm">
              esc
            </kbd>
            close
          </span>
        </div>
      </div>
    </div>
  );
}
