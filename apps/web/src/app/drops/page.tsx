import type { Metadata } from "next";
import Link from "next/link";
import { api } from "@crunchrr/shared";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { VaporCountdown } from "@/components/drops/vapor-countdown";
import { ProductCard } from "@/components/shop/product-card";
import { DROP, secondsToVaultClose } from "@/lib/drop";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Drops — The Vault",
  description:
    "Live and upcoming Crunchrr drops: batch windows, allocation priority, and the archival log of sold-out releases.",
};

export default async function DropsPage() {
  let items: Awaited<ReturnType<typeof api.listProducts>>["items"] = [];
  try {
    const res = await api.listProducts({ sort: "featured", limit: 8 });
    items = res.items;
  } catch {
    items = [];
  }

  const seed = secondsToVaultClose();
  return (
    <div className="flex min-h-screen w-full flex-col bg-canvas">
      <SiteHeader />

      <main className="w-full">
        <section className="mx-auto w-full max-w-7xl px-6 pb-12 pt-12 lg:px-12 lg:pb-16 lg:pt-16">
          <div className="eyebrow mb-2">
            <span className="material-symbols-outlined text-sm">timer</span>
            <span>The Vault</span>
          </div>
          <h1 className="mb-4 font-display text-4xl font-bold uppercase leading-none tracking-tight text-charcoal md:text-6xl">
            {DROP.batchLabel} is
            <span className="text-brand"> live</span>
          </h1>
          <p className="max-w-xl text-sm leading-relaxed text-charcoal-muted sm:text-base">
            One vault, one window. When the timer hits zero, remaining
            allocations lock and the batch retires to the archive forever.
          </p>

          <div className="mt-7 flex flex-col items-start gap-4 rounded-2xl border border-neutral-200/70 bg-white p-5 shadow-card sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-brand px-3 py-1 font-display text-[10px] font-bold uppercase tracking-[0.2em] text-white">
                <span className="h-1.5 w-1.5 animate-ping rounded-full bg-white" /> Live
              </span>
              <span className="font-display text-xs font-bold uppercase tracking-[0.14em] text-charcoal">
                {DROP.name} closes in
              </span>
            </div>
            <div className="flex items-center gap-3 text-charcoal">
              <span className="material-symbols-outlined text-brand">hourglass_top</span>
              <VaporCountdown initialSeconds={seed} height={44} labels={null} />
              <span className="hidden font-display text-[10px] font-medium uppercase tracking-widest text-charcoal-muted sm:inline">
                UTC midnight
              </span>
            </div>
          </div>
        </section>

        <section className="mx-auto w-full max-w-7xl px-6 pb-16 lg:px-12 lg:pb-24">
          <h2 className="mb-6 border-b border-neutral-200/60 pb-4 font-display text-xl font-bold uppercase tracking-tight text-charcoal">
            Allocation Priority Pieces
          </h2>
          {items.length === 0 ? (
            <div className="rounded-2xl border border-neutral-200/70 bg-white p-12 text-center shadow-card">
              <span className="material-symbols-outlined text-5xl text-charcoal-light">
                inventory_2
              </span>
              <h3 className="mt-3 font-display text-xl font-bold uppercase text-charcoal">
                The vault is restocking
              </h3>
              <p className="mx-auto mt-2 max-w-sm text-sm text-charcoal-muted">
                The catalog API may still be booting — give it a minute and
                refresh.
              </p>
              <Link href="/shop" className="btn-pill-coral mt-6">
                Check The Shop
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
              {items.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          )}

          <div className="mt-12 text-center">
            <Link href="/shop" className="btn-pill-primary">
              <span>Browse The Full Vault</span>
              <span className="material-symbols-outlined text-base">arrow_forward</span>
            </Link>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
