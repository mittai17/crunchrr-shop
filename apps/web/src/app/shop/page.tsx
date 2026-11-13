import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { api } from "@crunchrr/shared";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { ProductCard } from "@/components/shop/product-card";
import { FilterSidebar } from "@/components/shop/filter-sidebar";
import { SortSelect } from "@/components/shop/sort-select";

export const revalidate = 120;

export const metadata: Metadata = {
  title: "Shop All — Drop 004 Cyber Pastel Capsule",
  description:
    "Browse the full Crunchrr Drop 004 archive: heavyweight fleece, kinetic graphic tees, tactical cargos, headwear and hardware. Limited batches, never restocked.",
};

type SearchParams = Promise<{
  category?: string;
  size?: string;
  search?: string;
  sort?: string;
}>;

const SORT_OPTIONS = [
  { value: "featured", label: "Featured Drops" },
  { value: "newest", label: "Newest First" },
  { value: "price-asc", label: "Price: Low to High" },
  { value: "price-desc", label: "Price: High to Low" },
  { value: "bestseller", label: "Top Ranked" },
] as const;

async function loadCatalog(params: {
  category?: string;
  size?: string;
  search?: string;
  sort?: string;
}) {
  try {
    return await api.listProducts({
      category: params.category as never,
      size: params.size as never,
      search: params.search,
      sort: (params.sort as never) ?? "featured",
      limit: 16,
    });
  } catch {
    return { items: [], total: 0 };
  }
}

export default async function ShopPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const { items, total } = await loadCatalog(sp);

  return (
    <div className="flex min-h-screen w-full flex-col bg-canvas">
      <SiteHeader />

      <main className="w-full">
        {/* ============== Campaign banner (coral) ============== */}
        <section className="mx-auto w-full max-w-7xl px-6 pb-6 pt-6 lg:px-12">
          <div className="relative overflow-hidden rounded-xl bg-brand p-6 shadow-xl md:p-10">
            <div className="pointer-events-none absolute -bottom-24 -right-24 h-96 w-96 rounded-full bg-white/20 blur-3xl" />
            <div className="pointer-events-none absolute -top-20 left-1/3 h-80 w-80 rounded-full bg-black/15 blur-2xl" />
            <div className="relative z-10 grid grid-cols-1 items-center gap-6 lg:grid-cols-12">
              <div className="flex flex-col items-start gap-3 lg:col-span-7">
                <div className="flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1 text-white backdrop-blur-md">
                  <span className="material-symbols-outlined filled text-sm">
                    local_fire_department
                  </span>
                  <span className="font-display text-[10px] font-bold uppercase tracking-wider">
                    Limited Edition // Drop 004
                  </span>
                </div>
                <h1 className="mt-1 font-display text-3xl font-bold uppercase leading-none tracking-tight text-white md:text-4xl">
                  Where Art Meets{" "}
                  <span className="block font-black italic text-canvas">
                    Your Street Style.
                  </span>
                </h1>
                <p className="mt-1 max-w-lg text-sm text-white/90">
                  High-contrast kinetic apparel engineered for rebellious street
                  grit. Featuring custom heavyweight fleece, modular hardware,
                  and raw aesthetic cuts.
                </p>
                <div className="flex items-center gap-3 pt-1">
                  <div className="flex -space-x-2">
                    {["/products/img_01d27a7f6c.jpg", "/products/img_1d51958241.jpg", "/products/img_4e742e263c.jpg"].map(
                      (src) => (
                        <div
                          key={src}
                          className="h-9 w-9 overflow-hidden rounded-full bg-white/30 shadow-sm ring-2 ring-brand"
                        >
                          <Image
                            src={src}
                            alt="Crunchrr collector"
                            width={72}
                            height={72}
                            className="h-full w-full object-cover"
                          />
                        </div>
                      ),
                    )}
                  </div>
                  <div className="flex flex-col">
                    <div className="flex items-center gap-0.5 text-amber-300">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <span key={i} className="material-symbols-outlined filled text-xs">
                          star
                        </span>
                      ))}
                    </div>
                    <span className="font-display text-[10px] font-bold uppercase tracking-wider text-white/80">
                      Rated 4.98 by 3,400+ Collectors
                    </span>
                  </div>
                </div>
              </div>

              {/* Spotlight teaser card */}
              <div className="relative mt-2 flex justify-end lg:col-span-5 lg:mt-0">
                <div className="relative w-full max-w-sm rounded-lg bg-white p-4 text-charcoal shadow-2xl">
                  <div className="flex items-center justify-between pb-1">
                    <span className="rounded-full bg-brand/10 px-2 py-1 font-display text-[10px] font-bold uppercase tracking-wider text-brand">
                      Spotlight Drop
                    </span>
                    <span className="font-display text-[10px] font-bold uppercase tracking-widest text-charcoal-muted">
                      04 / 48
                    </span>
                  </div>
                  <div className="group relative my-2 h-52 overflow-hidden rounded bg-surface-muted">
                    <Image
                      src="/products/img_5892cd524a.jpg"
                      alt="Prism Cyber Pullover spotlight"
                      fill
                      sizes="(max-width: 1024px) 100vw, 380px"
                      className="object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                    <div className="absolute bottom-2 left-2 rounded-full bg-charcoal/80 px-2 py-0.5 font-display text-[10px] font-bold uppercase tracking-wider text-canvas backdrop-blur-sm">
                      In Stock • Ships 24h
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-display text-base font-bold uppercase tracking-tight text-charcoal">
                        Prism Cyber Pullover
                      </h4>
                      <p className="text-xs text-charcoal-muted">480 GSM Custom Loopback</p>
                    </div>
                    <div className="text-right">
                      <span className="font-display text-sm font-bold text-brand">$88.00</span>
                    </div>
                  </div>
                  <Link
                    href="/product/prism-cyber-pullover"
                    className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-full bg-charcoal py-2 font-display text-xs font-bold uppercase tracking-wider text-canvas shadow-md transition-colors hover:bg-charcoal-muted"
                  >
                    <span>Quick Claim</span>
                    <span className="material-symbols-outlined text-sm">arrow_forward</span>
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ============== Utility bar ============== */}
        <section className="mx-auto w-full max-w-7xl px-6 py-3 lg:px-12">
          <div className="flex flex-col items-start justify-between gap-4 rounded-lg bg-white p-4 shadow-sm md:flex-row md:items-center">
            <div className="flex items-center gap-4">
              <div className="flex flex-col">
                <div className="flex items-center gap-1.5">
                  <h2 className="font-display text-sm font-bold uppercase tracking-tight text-charcoal">
                    All Pieces
                  </h2>
                  <span className="font-display text-sm text-charcoal-muted">/</span>
                  <span className="font-display text-sm font-bold uppercase tracking-widest text-brand">
                    Drop 004
                  </span>
                </div>
                <p className="text-xs text-charcoal-muted">
                  Displaying {items.length} of {total} total curated garments
                </p>
              </div>
              <span className="hidden rounded-full bg-surface-muted px-3 py-1 font-display text-[10px] font-bold uppercase tracking-widest text-charcoal-muted sm:inline-block">
                {total} Items Active
              </span>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 md:justify-end">
              {/* Sort */}
              <SortSelect
                value={sp.sort ?? "featured"}
                options={SORT_OPTIONS.map((o) => ({ ...o }))}
              />

              {/* Mobile filter trigger (anchors to sidebar on desktop) */}
              <Link
                href="/shop#filters"
                className="flex items-center gap-1.5 rounded-full bg-surface-subtle px-4 py-2 font-display text-[10px] font-bold uppercase tracking-wider text-charcoal lg:hidden"
              >
                <span className="material-symbols-outlined text-sm">tune</span>
                <span>Filters</span>
                <span className="inline-block h-2 w-2 rounded-full bg-brand" />
              </Link>
            </div>
          </div>
        </section>

        {/* ============== Catalog grid ============== */}
        <section className="mx-auto w-full max-w-7xl px-6 pb-16 lg:px-12" id="filters">
          <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
            <Suspense fallback={<div className="hidden lg:block lg:col-span-3" />}>
              <FilterSidebar />
            </Suspense>

            <div className="w-full lg:col-span-9">
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                {items.map((product) => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </div>

              {items.length === 0 ? (
                <div className="rounded-lg bg-white p-10 text-center shadow-sm">
                  <span className="material-symbols-outlined text-4xl text-charcoal-light">
                    search_off
                  </span>
                  <h3 className="mt-2 font-display text-lg font-bold uppercase text-charcoal">
                    No pieces match this vault
                  </h3>
                  <p className="mt-1 text-sm text-charcoal-muted">
                    Try resetting filters — the Drop 004 archive rotates fast.
                  </p>
                  <Link href="/shop" className="btn-pill-primary mt-4">
                    Reset Filters
                  </Link>
                </div>
              ) : null}

              {/* Load more / progress */}
              <div className="mt-10 flex flex-col items-center gap-4 rounded-lg bg-white p-6 text-center shadow-sm">
                <div className="w-full max-w-xs space-y-1">
                  <div className="flex items-center justify-between font-display text-[10px] font-bold uppercase text-charcoal-muted">
                    <span>
                      Showing {items.length} of {Math.max(total, 1)} garments
                    </span>
                    <span className="font-bold text-charcoal">
                      {total > 0 ? Math.round((items.length / total) * 100) : 0}%
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-muted">
                    <div
                      className="h-full rounded-full bg-brand"
                      style={{
                        width: `${total > 0 ? Math.min(100, Math.round((items.length / total) * 100)) : 0}%`,
                      }}
                    />
                  </div>
                </div>
                <p className="text-xs text-charcoal-muted">
                  Drop 004 archive will lock permanently upon sellout.
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
