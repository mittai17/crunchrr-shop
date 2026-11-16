import Image from "next/image";
import Link from "next/link";
import { api, type Product } from "@crunchrr/shared";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { ProductCard } from "@/components/shop/product-card";
import { DropCountdown } from "@/components/drops/drop-countdown";

// Revalidate every 5 minutes; catalog API responses are also tagged for on-demand refresh.
export const revalidate = 300;

type HomeData = {
  featured: Product[];
  hero: Product | null;
};

async function getHomeData(): Promise<HomeData> {
  try {
    const { items } = await api.listProducts({ sort: "featured", limit: 8 });
    const featured = items.slice(0, 4);
    const hero =
      items.find((p) => p.slug === "urban-vanguard-heavyweight-hoodie") ?? items[0] ?? null;
    return { featured, hero };
  } catch {
    return { featured: [], hero: null };
  }
}

/** Server-computed countdown seed (matches mockup cadence). */
function countdownSeed(): number {
  const base = 4 * 3600 + 18 * 60;
  const jitter = Math.floor(Date.now() / 60_000) % 3600; // per-minute drift
  return base - jitter;
}

export default async function HomePage() {
  const { featured, hero } = await getHomeData();
  const heroImage = hero?.images.find((i) => i.label?.startsWith("05")) ?? hero?.images[0];
  const heroThumb = hero?.images[1] ?? hero?.images[0];

  return (
    <div className="flex min-h-screen w-full flex-col bg-canvas">
      <SiteHeader />

      <main className="w-full">
        {/* ============================== HERO ============================== */}
        <section className="mx-auto w-full max-w-7xl px-6 pb-16 pt-10 lg:px-12">
          <div className="relative w-full">
            {/* Running headline */}
            <div className="mb-8 flex select-none flex-col justify-between gap-4 border-b border-neutral-200/60 pb-5 sm:flex-row sm:items-end">
              <div className="flex items-baseline gap-3">
                <span className="font-display text-sm font-medium uppercase tracking-[0.25em] text-charcoal-light md:text-base">
                  Archival Vol. 04
                </span>
                <span className="hidden text-neutral-300 sm:inline">—</span>
                <h1 className="font-display text-3xl font-bold uppercase tracking-tight text-charcoal sm:text-4xl lg:text-5xl">
                  Own the Edge
                </h1>
              </div>
              <div className="flex items-baseline gap-3 sm:text-right">
                <span className="font-display text-sm font-medium uppercase tracking-[0.25em] text-charcoal-light md:text-base">
                  Aesthetic System
                </span>
                <span className="hidden text-neutral-300 sm:inline">—</span>
                <span className="font-display text-3xl font-bold uppercase tracking-tight text-brand sm:text-4xl lg:text-5xl">
                  Keep the Vibe
                </span>
              </div>
            </div>

            {/* Coral hero stage */}
            <div className="relative flex min-h-[580px] w-full flex-col justify-between overflow-hidden rounded-3xl bg-brand p-8 shadow-hero lg:h-[620px] lg:p-12">
              {/* Ambient glows */}
              <div className="pointer-events-none absolute -left-24 -top-24 h-96 w-96 rounded-full bg-white/20 blur-3xl" />
              <div className="pointer-events-none absolute bottom-0 right-10 h-96 w-96 rounded-full bg-black/15 blur-3xl" />
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_70%_30%,rgba(255,255,255,0.18)_0%,transparent_60%)]" />

              {/* Top row: micro-tags + floating product card */}
              <div className="relative z-20 flex flex-wrap items-start justify-between gap-6">
                <div className="inline-flex items-center gap-3 rounded-full border border-white/25 bg-white/15 px-5 py-2.5 text-white shadow-sm backdrop-blur-md">
                  <div className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-white" />
                    <span className="font-display text-[11px] font-semibold uppercase tracking-[0.18em]">
                      Future Threads
                    </span>
                  </div>
                  <span className="text-xs text-white/60">/</span>
                  <div className="flex items-center gap-2">
                    <span className="font-display text-[11px] font-semibold uppercase tracking-[0.18em]">
                      Unique Designs
                    </span>
                  </div>
                  <span className="hidden text-xs text-white/60 sm:inline">/</span>
                  <div className="hidden items-center gap-2 sm:flex">
                    <span className="font-display text-[11px] font-semibold uppercase tracking-[0.18em]">
                      Limited Drops
                    </span>
                  </div>
                </div>

                {/* Floating featured card */}
                {hero ? (
                  <div className="z-30 flex w-full max-w-[310px] items-center gap-4 rounded-2xl border border-white/80 bg-white/95 p-3.5 shadow-float backdrop-blur-xl transition-transform duration-300 hover:-translate-y-1 sm:w-auto">
                    <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-neutral-200/50 bg-neutral-100">
                      {heroThumb ? (
                        <Image
                          src={heroThumb.url}
                          alt={heroThumb.alt}
                          width={128}
                          height={128}
                          className="h-full w-full object-cover"
                        />
                      ) : null}
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col">
                      <div className="flex items-center justify-between">
                        <span className="font-display text-[9px] font-bold uppercase tracking-[0.18em] text-brand">
                          Featured Item
                        </span>
                        <span className="text-[10px] font-medium text-charcoal-light">
                          Edition 01
                        </span>
                      </div>
                      <h4 className="mt-0.5 truncate font-display text-xs font-bold text-charcoal">
                        {hero.name}
                      </h4>
                      <p className="truncate text-[11px] text-charcoal-muted">
                        {hero.gsmLabel || hero.fabricLabel} finish
                      </p>
                      <div className="mt-2 flex items-center justify-between border-t border-neutral-100 pt-1">
                        <span className="font-display text-xs font-bold text-charcoal">
                          ${(hero.variants[0]?.priceMinor ?? 0) / 100}
                        </span>
                        <Link
                          href={`/product/${hero.slug}`}
                          className="flex h-6 w-6 items-center justify-center rounded-full bg-brand text-white shadow-sm transition-colors hover:bg-brand-dark"
                          title="View Product"
                        >
                          <span className="material-symbols-outlined text-[14px]">
                            shopping_bag
                          </span>
                        </Link>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>

              {/* Center model cutout */}
              <div className="pointer-events-none absolute inset-x-0 bottom-0 top-6 z-10 flex items-end justify-center overflow-hidden">
                {heroImage ? (
                  <Image
                    src={heroImage.url}
                    alt={heroImage.alt}
                    width={640}
                    height={860}
                    priority
                    className="h-[96%] w-auto max-w-none object-contain object-bottom drop-shadow-[0_24px_36px_rgba(0,0,0,0.35)] lg:h-[112%]"
                  />
                ) : null}
              </div>

              {/* Legibility scrim — keeps the white copy readable over the photo */}
              <div className="pointer-events-none absolute inset-0 z-[15] bg-gradient-to-t from-black/60 via-black/25 to-transparent" />
              <div className="pointer-events-none absolute inset-0 z-[15] bg-gradient-to-r from-black/50 via-black/15 to-transparent" />

              {/* Bottom row: copy + social proof */}
              <div className="relative z-20 flex flex-col justify-between gap-8 pt-10 md:flex-row md:items-end">
                <div className="max-w-md text-white [text-shadow:0_2px_16px_rgba(0,0,0,0.38)]">
                  <span className="mb-2 inline-block font-display text-[11px] font-bold uppercase tracking-[0.22em] text-white/90">
                    New Season Drop 04
                  </span>
                  <h2 className="mb-3 font-display text-3xl font-bold uppercase leading-[1.05] tracking-tight text-white sm:text-4xl lg:text-5xl">
                    Where Art Meets <br />
                    <span className="font-normal italic">Your Style.</span>
                  </h2>
                  <p className="mb-6 max-w-sm text-xs font-light leading-relaxed text-white/85 sm:text-sm">
                    Engineered cuts for kinetic life. Single batch limited
                    production, crafted from 480 GSM organic cotton loopback.
                  </p>
                  <div className="flex items-center gap-4">
                    <Link
                      href="/drops"
                      className="inline-flex items-center gap-3 rounded-full bg-white px-7 py-3.5 font-display text-xs font-bold uppercase tracking-[0.16em] text-charcoal shadow-[0_8px_20px_rgba(0,0,0,0.12)] transition-all duration-200 hover:bg-canvas hover:scale-105"
                    >
                      <span>Explore Drops</span>
                      <span className="material-symbols-outlined text-[16px]">
                        arrow_forward
                      </span>
                    </Link>
                    <Link
                      href="/lookbook"
                      className="inline-flex items-center gap-2 rounded-full px-4 py-3 font-display text-xs font-medium uppercase tracking-[0.14em] text-white/90 underline decoration-white/40 underline-offset-4 transition-colors hover:text-white"
                    >
                      <span>View Lookbook</span>
                    </Link>
                  </div>
                </div>

                <div className="flex items-center gap-3.5 self-start rounded-2xl border border-white/70 bg-white/90 p-3 shadow-lg backdrop-blur-md md:self-end">
                  <div className="flex -space-x-2.5">
                    {["/products/img_429bd8e7ab.jpg", "/products/img_bdaafbf7d8.jpg", "/products/img_932fbe1425.jpg"].map(
                      (src) => (
                        <div
                          key={src}
                          className="inline-block h-8 w-8 overflow-hidden rounded-full bg-neutral-200 ring-2 ring-white"
                        >
                          <Image
                            src={src}
                            alt="Crunchrr collector"
                            width={64}
                            height={64}
                            className="h-full w-full object-cover"
                          />
                        </div>
                      ),
                    )}
                  </div>
                  <div className="flex flex-col pr-1">
                    <div className="flex items-center gap-0.5 text-brand">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <span
                          key={i}
                          className="material-symbols-outlined filled text-[13px]"
                        >
                          star
                        </span>
                      ))}
                    </div>
                    <span className="font-display text-[10px] font-bold tracking-tight text-charcoal">
                      Verified Collectors Guild
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ======================= COUNTDOWN TICKER ======================= */}
        <section className="w-full border-y border-neutral-200/70 bg-white py-4">
          <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-6 md:flex-row lg:px-12">
            <div className="flex items-center gap-4">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-brand px-3 py-1 font-display text-[10px] font-bold uppercase tracking-[0.2em] text-white">
                <span className="h-1.5 w-1.5 animate-ping rounded-full bg-white" /> Live
                Vault
              </span>
              <span className="font-display text-xs font-bold uppercase tracking-[0.14em] text-charcoal">
                CYBER PASTEL CAPSULE — BATCH 004
              </span>
            </div>
            <div className="flex items-center gap-8">
              <div className="flex items-center gap-2 text-charcoal-muted">
                <span className="material-symbols-outlined text-[16px] text-brand">
                  timer
                </span>
                <span className="font-display text-[10px] font-medium uppercase tracking-[0.16em]">
                  Window Closes In:
                </span>
                <DropCountdown initialSeconds={countdownSeed()} />
              </div>
              <div className="hidden h-3 w-px bg-neutral-200 sm:block" />
              <Link
                href="/drops"
                className="flex items-center gap-1 font-display text-[11px] font-bold uppercase tracking-[0.16em] text-brand transition-colors hover:text-brand-dark"
              >
                <span>Explore Vault</span>
                <span className="material-symbols-outlined text-[14px]">arrow_outward</span>
              </Link>
            </div>
          </div>
        </section>

        {/* ==================== CURATED HEAVYWEIGHTS GRID =================== */}
        <section className="mx-auto w-full max-w-7xl px-6 py-20 lg:px-12">
          <div className="mb-12 flex flex-col justify-between gap-6 border-b border-neutral-200/60 pb-6 md:flex-row md:items-end">
            <div>
              <div className="eyebrow mb-2">
                <span className="material-symbols-outlined text-[16px]">
                  local_fire_department
                </span>
                <span>Kinetic Essentials</span>
              </div>
              <h3 className="font-display text-2xl font-bold uppercase tracking-tight text-charcoal lg:text-3xl">
                Curated Heavyweights
              </h3>
            </div>
            <div className="flex items-center gap-1.5 rounded-full border border-neutral-200/60 bg-neutral-100/80 p-1 text-xs">
              <Link
                href="/shop"
                className="rounded-full bg-white px-4 py-1.5 font-display text-[11px] font-bold uppercase tracking-wider text-charcoal shadow-sm"
              >
                All Items
              </Link>
              <Link
                href="/shop?category=OUTERWEAR"
                className="rounded-full px-4 py-1.5 font-display text-[11px] font-medium uppercase tracking-wider text-charcoal-muted transition-colors hover:text-charcoal"
              >
                Outerwear
              </Link>
              <Link
                href="/shop?category=BOTTOMS"
                className="rounded-full px-4 py-1.5 font-display text-[11px] font-medium uppercase tracking-wider text-charcoal-muted transition-colors hover:text-charcoal"
              >
                Bottoms
              </Link>
              <Link
                href="/shop?category=ARTIFACTS"
                className="rounded-full px-4 py-1.5 font-display text-[11px] font-medium uppercase tracking-wider text-charcoal-muted transition-colors hover:text-charcoal"
              >
                Artifacts
              </Link>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {featured.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
            {featured.length === 0 ? (
              <p className="col-span-full text-sm text-charcoal-muted">
                Catalog is warming up — the API may still be booting.
              </p>
            ) : null}
          </div>
        </section>

        {/* ==================== EDITORIAL SPLIT MOSAIC ==================== */}
        <section className="mx-auto w-full max-w-7xl border-t border-neutral-200/60 px-6 py-16 lg:px-12">
          <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-12 lg:gap-16">
            <div className="flex flex-col justify-center lg:col-span-5">
              <div className="eyebrow mb-3">
                <span className="material-symbols-outlined text-[16px]">auto_awesome</span>
                <span>Chapter IV: Archival Field Notes</span>
              </div>
              <h3 className="mb-4 font-display text-3xl font-bold uppercase leading-tight tracking-tight text-charcoal sm:text-4xl">
                Born from concrete.
                <br />
                <span className="font-normal italic">Refined for the streets.</span>
              </h3>
              <p className="mb-8 text-sm font-light leading-relaxed text-charcoal-muted sm:text-base">
                Each release is manufactured in single limited batches using
                heavy-gauge sustainably sourced cotton and abrasion-resistant
                weaves. We reject seasonal fast-fashion in pursuit of immortal
                silhouette architecture.
              </p>

              <div className="mb-8 grid grid-cols-3 gap-4 rounded-2xl border border-neutral-200/70 bg-white p-5 shadow-sm">
                <div>
                  <div className="font-display text-2xl font-bold text-charcoal">500</div>
                  <div className="mt-0.5 font-display text-[10px] font-medium uppercase tracking-wider text-charcoal-light">
                    Units / Batch
                  </div>
                </div>
                <div>
                  <div className="font-display text-2xl font-bold text-charcoal">100%</div>
                  <div className="mt-0.5 font-display text-[10px] font-medium uppercase tracking-wider text-charcoal-light">
                    Bio-Washed
                  </div>
                </div>
                <div>
                  <div className="font-display text-2xl font-bold text-brand">4.9/5</div>
                  <div className="mt-0.5 font-display text-[10px] font-medium uppercase tracking-wider text-charcoal-light">
                    Tribe Score
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-6">
                <Link
                  href="/lookbook"
                  className="btn-pill-primary"
                >
                  <span>Explore Lookbook</span>
                  <span className="material-symbols-outlined text-[16px]">visibility</span>
                </Link>
                <Link
                  href="/manifesto"
                  className="font-display text-xs font-semibold uppercase tracking-[0.16em] text-charcoal transition-colors hover:text-brand"
                >
                  Read The Manifesto →
                </Link>
              </div>
            </div>

            {/* Mosaic */}
            <div className="grid grid-cols-2 gap-5 lg:col-span-7">
              <div className="space-y-5">
                <div className="group h-80 overflow-hidden rounded-2xl border border-neutral-200/60 bg-neutral-200 shadow-md">
                  <Image
                    src="/products/img_8f50510a9f.jpg"
                    alt="Two streetwear models in cyber-pastel hoodies in a brutalist metro station"
                    width={640}
                    height={640}
                    className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-105"
                  />
                </div>
                <div className="rounded-2xl border border-neutral-200/70 bg-white p-6 shadow-sm">
                  <span className="font-display text-[10px] font-bold uppercase tracking-[0.2em] text-brand">
                    Fabric Specification
                  </span>
                  <p className="mt-2 font-display text-base font-bold uppercase leading-snug text-charcoal">
                    Zero shrinkage. High-density looped French Terry weave.
                  </p>
                </div>
              </div>
              <div className="space-y-5 pt-8">
                <div className="group h-64 overflow-hidden rounded-2xl border border-neutral-200/60 bg-neutral-200 shadow-md">
                  <Image
                    src="/products/img_cce0365721.jpg"
                    alt="Macro detail of heavy tactical zip hardware and woven embroidery"
                    width={640}
                    height={420}
                    className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-105"
                  />
                </div>
                <div className="group h-72 overflow-hidden rounded-2xl border border-neutral-200/60 bg-neutral-200 shadow-md">
                  <Image
                    src="/products/img_42acac9768.jpg"
                    alt="Edgy model walking through night-time Tokyo Shibuya crossing"
                    width={640}
                    height={560}
                    className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-105"
                  />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ======================== VIP ACCESS BANNER ======================== */}
        <section className="mx-auto w-full max-w-7xl px-6 py-16 lg:px-12">
          <div className="relative overflow-hidden rounded-3xl bg-charcoal p-10 text-center text-white shadow-2xl lg:p-16">
            <div className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-brand/20 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-24 -left-24 h-80 w-80 rounded-full bg-white/10 blur-3xl" />
            <div className="relative z-10 mx-auto max-w-2xl">
              <span className="mb-3 inline-block font-display text-[10px] font-bold uppercase tracking-[0.25em] text-brand">
                VIP Access Key
              </span>
              <h2 className="mb-4 font-display text-3xl font-bold uppercase leading-tight tracking-tight text-white sm:text-4xl lg:text-5xl">
                Never mass produced.
                <br />
                <span className="text-white/60">Never compromised.</span>
              </h2>
              <p className="mx-auto mb-8 max-w-md text-xs font-light leading-relaxed text-white/70 sm:text-sm">
                Join over 42,000 collectors globally. Receive silent private
                release SMS 10 minutes prior to public vault opening.
              </p>
              <form
                className="mx-auto flex max-w-md flex-col items-center justify-center gap-3 sm:flex-row"
                action="/drops"
                method="get"
              >
                <input
                  type="tel"
                  placeholder="Enter mobile number (+1 / +44)..."
                  aria-label="Mobile number"
                  className="w-full rounded-full border border-white/20 bg-white/10 px-5 py-3.5 text-xs text-white outline-none backdrop-blur-md transition-colors placeholder:text-white/40 focus:border-brand"
                />
                <button
                  type="submit"
                  className="w-full shrink-0 rounded-full bg-brand px-7 py-3.5 font-display text-xs font-bold uppercase tracking-[0.16em] text-white shadow-md transition-all hover:bg-brand-dark sm:w-auto"
                >
                  Request Key
                </button>
              </form>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
