import Link from "next/link";
import { CrunchrrLogo } from "@/components/brand/logo";

const CATALOG_LINKS = [
  { href: "/shop?category=OUTERWEAR", label: "Outerwear" },
  { href: "/shop?category=HOODIES", label: "Heavy Fleece" },
  { href: "/shop?category=BOTTOMS", label: "Pants & Cargos" },
  { href: "/shop?category=HEADWEAR", label: "Headwear" },
  { href: "/drops", label: "Archival Drops" },
];

const PROTOCOL_LINKS = [
  { href: "/manifesto#faq", label: "Drop FAQ" },
  { href: "/manifesto#shipping", label: "Global Freight" },
  { href: "/manifesto#authenticity", label: "Authenticity Guarantee" },
  { href: "/manifesto#returns", label: "Returns & Exchanges" },
  { href: "/manifesto#concierge", label: "Client Concierge" },
];

export function SiteFooter() {
  return (
    <footer className="w-full border-t border-neutral-200/70 bg-white pb-12 pt-16">
      <div className="mx-auto max-w-7xl px-6 lg:px-12">
        <div className="mb-16 grid grid-cols-1 gap-12 md:grid-cols-2 lg:grid-cols-12">
          {/* Brand */}
          <div className="lg:col-span-4">
            <div className="mb-4 flex items-center gap-2.5">
              <CrunchrrLogo />
            </div>
            <p className="mb-6 max-w-sm text-xs font-light leading-relaxed text-charcoal-muted">
              High-impact contemporary streetwear engineered for kinetic
              lifestyles, hype drops, and rebellious urban culture worldwide.
            </p>
            <div className="flex items-center gap-3">
              <span className="font-display text-[10px] font-medium uppercase tracking-[0.18em] text-charcoal-light">
                Connect:
              </span>
              <a
                href="https://instagram.com"
                target="_blank"
                rel="noreferrer noopener"
                className="font-display text-xs font-semibold text-charcoal transition-colors hover:text-brand"
              >
                @crunchrr.archive
              </a>
            </div>
          </div>

          {/* Catalog */}
          <div className="lg:col-span-2">
            <h4 className="mb-4 font-display text-xs font-bold uppercase tracking-[0.16em] text-charcoal">
              Catalog
            </h4>
            <ul className="space-y-2.5 text-xs font-light text-charcoal-muted">
              {CATALOG_LINKS.map((l) => (
                <li key={l.label}>
                  <Link href={l.href} className="transition-colors hover:text-charcoal">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Protocol */}
          <div className="lg:col-span-2">
            <h4 className="mb-4 font-display text-xs font-bold uppercase tracking-[0.16em] text-charcoal">
              Protocol
            </h4>
            <ul className="space-y-2.5 text-xs font-light text-charcoal-muted">
              {PROTOCOL_LINKS.map((l) => (
                <li key={l.label}>
                  <Link href={l.href} className="transition-colors hover:text-charcoal">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Collector's Circle */}
          <div className="lg:col-span-4">
            <div className="rounded-2xl border border-neutral-200/80 bg-canvas p-6">
              <h4 className="mb-1 font-display text-sm font-bold uppercase tracking-tight text-charcoal">
                The Collector&apos;s Circle
              </h4>
              <p className="mb-4 text-xs font-light leading-relaxed text-charcoal-muted">
                Receive priority allocation codes, early access lookbooks, and
                private invites.
              </p>
              <form
                className="flex items-center gap-2"
                action="/manifesto#circle"
                method="get"
              >
                <input
                  type="email"
                  required
                  placeholder="Enter your email..."
                  aria-label="Email address"
                  className="flex-1 rounded-full border border-neutral-200 bg-white px-4 py-2.5 text-xs text-charcoal outline-none transition-colors placeholder:text-charcoal-light focus:border-brand"
                />
                <button
                  type="submit"
                  className="rounded-full bg-charcoal px-4 py-2.5 font-display text-[11px] font-bold uppercase tracking-wider text-white transition-colors hover:bg-brand"
                >
                  Join
                </button>
              </form>
            </div>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="flex flex-col items-center justify-between gap-4 border-t border-neutral-200/60 pt-8 text-xs text-charcoal-light md:flex-row">
          <div className="flex items-center gap-3">
            <span>© 2026 crunchrr. studio inc.</span>
            <span>•</span>
            <span>Tokyo / NYC / London / Paris</span>
          </div>
          <div className="flex items-center gap-2 text-charcoal">
            <span className="material-symbols-outlined text-[16px] text-charcoal-light">
              language
            </span>
            <span className="font-display text-[11px] font-semibold uppercase tracking-wider">
              USD ($) / United States Edition
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}
