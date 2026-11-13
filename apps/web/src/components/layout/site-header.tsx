"use client";

/**
 * Site header — charcoal announcement rail + glass nav bar.
 * Cart count reacts live to the zustand bag store.
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import { UserButton } from "@clerk/nextjs";
import { useCart } from "@/lib/cart";
import { useWishlist } from "@/lib/wishlist";
import { CrunchrrLogo } from "@/components/brand/logo";
import { SearchOverlay } from "@/components/layout/search-overlay";

const NAV: Array<{ href: string; label: string; pulse?: boolean }> = [
  { href: "/shop", label: "Shop" },
  { href: "/shop?category=HOODIES", label: "Collections" },
  { href: "/drops", label: "Drops", pulse: true },
  { href: "/lookbook", label: "Lookbook" },
  { href: "/manifesto", label: "Manifesto" },
] as const;

export function SiteHeader() {
  const items = useCart((s) => s.items);
  const wishItems = useWishlist((s) => s.items);
  const [count, setCount] = useState<number | null>(null);
  const [wishCount, setWishCount] = useState<number | null>(null);
  const [active, setActive] = useState<string>("");
  const [searchOpen, setSearchOpen] = useState(false);

  // Hydration-safe badges: render empty server-side, then live values.
  useEffect(() => {
    setCount(items.reduce((sum, i) => sum + i.quantity, 0));
  }, [items]);

  useEffect(() => {
    setWishCount(wishItems.length);
  }, [wishItems]);

  useEffect(() => {
    setActive(window.location.pathname);
  }, []);

  // ⌘K / Ctrl+K opens catalog search.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      {/* Announcement rail */}
      <div className="flex items-center justify-between gap-4 border-b border-white/10 bg-charcoal px-6 py-2 text-center font-display text-[11px] uppercase tracking-overline text-white">
        <div className="hidden items-center gap-4 text-[10px] text-charcoal-light md:flex">
          <span>Paris / Tokyo / New York</span>
          <span className="h-1 w-1 rounded-full bg-brand" />
          <span>Limited Archival Production</span>
        </div>
        <div className="mx-auto flex items-center gap-2 md:mx-0">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand" />
          <span className="font-medium tracking-[0.18em]">
            Drop 004 : Cyber Pastel is live now
          </span>
          <Link
            href="/drops"
            className="ml-2 text-[10px] underline decoration-brand/60 underline-offset-4 transition-colors hover:text-brand"
          >
            Explore Capsule
          </Link>
        </div>
        <div className="hidden items-center gap-4 text-[10px] text-white/70 md:flex">
          <span>Complimentary worldwide delivery over $200</span>
        </div>
      </div>

      {/* Main nav */}
      <header className="glass-bar sticky top-0 z-50 transition-all duration-300">
        <div className="mx-auto flex h-20 max-w-7xl items-center justify-between gap-8 px-6 lg:px-12">
          <div className="flex items-center gap-10">
            <Link href="/" aria-label="Crunchrr home">
              <CrunchrrLogo />
            </Link>
            <div className="hidden h-4 w-px bg-neutral-300/60 xl:block" />
            <nav className="hidden items-center gap-8 xl:flex" aria-label="Primary">
              {NAV.map((item) => {
                const isActive = active === item.href.split("?")[0];
                return (
                  <Link
                    key={item.label}
                    href={item.href}
                    className={`font-display text-xs uppercase tracking-[0.14em] transition-colors ${
                      isActive
                        ? "font-semibold text-charcoal"
                        : "text-charcoal-muted hover:text-charcoal"
                    } flex items-center gap-1.5`}
                  >
                    <span>{item.label}</span>
                    {item.pulse ? (
                      <span className="inline-block h-1.5 w-1.5 rounded-full bg-brand" />
                    ) : null}
                  </Link>
                );
              })}
            </nav>
          </div>

          <div className="flex items-center gap-4 lg:gap-6">
            {/* Search — desktop pill (opens ⌘K palette) */}
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              aria-label="Search catalog"
              className="hidden items-center gap-2.5 rounded-full border border-neutral-200/80 bg-white/80 px-4 py-2 text-left shadow-[0_2px_8px_rgba(0,0,0,0.02)] transition-all hover:border-charcoal/40 lg:flex"
            >
              <span className="material-symbols-outlined text-[17px] text-charcoal-light">
                search
              </span>
              <span className="w-36 bg-transparent text-xs font-normal text-charcoal-light xl:w-44">
                Search archive...
              </span>
              <kbd className="hidden rounded bg-neutral-100 px-1.5 py-0.5 font-display text-[9px] font-medium tracking-wider text-charcoal-light xl:inline-block">
                ⌘K
              </kbd>
            </button>

            {/* Search — mobile icon */}
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              aria-label="Search catalog"
              className="flex h-9 w-9 items-center justify-center rounded-full border border-transparent text-charcoal-muted transition-all hover:border-neutral-200/60 hover:bg-white hover:text-charcoal lg:hidden"
            >
              <span className="material-symbols-outlined text-[20px]">search</span>
            </button>

            {/* Wishlist */}
            <Link
              href="/wishlist"
              title="Saved Items"
              className="relative flex h-9 w-9 items-center justify-center rounded-full border border-transparent text-charcoal-muted transition-all hover:border-neutral-200/60 hover:bg-white hover:text-charcoal"
            >
              <span className="material-symbols-outlined text-[20px]">favorite</span>
              <span
                className={`absolute -right-0.5 -top-0.5 min-w-[16px] rounded-full bg-charcoal px-1 py-px text-center font-display text-[9px] font-bold leading-3 text-white shadow-sm transition-opacity ${
                  wishCount === null || wishCount === 0 ? "opacity-0" : "opacity-100"
                }`}
              >
                {wishCount !== null && wishCount > 9 ? "9+" : wishCount ?? ""}
              </span>
            </Link>

            {/* Bag */}
            <Link
              href="/bag"
              className="group flex items-center gap-2.5 rounded-full border border-neutral-200/80 bg-white py-1.5 pl-3.5 pr-2 shadow-[0_2px_10px_rgba(0,0,0,0.03)] transition-all hover:border-neutral-300"
            >
              <span className="material-symbols-outlined text-[18px] text-charcoal">
                shopping_bag
              </span>
              <span className="hidden font-display text-xs font-semibold uppercase tracking-wider text-charcoal sm:inline">
                Bag
              </span>
              <span className="min-w-[20px] rounded-full bg-brand px-2 py-0.5 text-center font-display text-[11px] font-bold text-white shadow-sm">
                {count === null ? "" : count > 99 ? "99+" : count}
              </span>
            </Link>

            <div className="hidden h-4 w-px bg-neutral-300/60 sm:block" />

            {/* Clerk avatar */}
            <div className="flex items-center">
              <UserButton
                afterSignOutUrl="/"
                appearance={{
                  elements: {
                    avatarBox: "w-8 h-8 ring-2 ring-neutral-200/80 hover:ring-brand rounded-full",
                  },
                }}
              />
              <Link
                href="/sign-in"
                className="ml-2 hidden font-display text-xs uppercase tracking-wider text-charcoal-muted hover:text-charcoal sm:block"
              >
                Sign in
              </Link>
            </div>
          </div>
        </div>
      </header>
      <SearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} />
    </>
  );
}
