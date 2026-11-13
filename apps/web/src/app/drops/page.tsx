import type { Metadata } from "next";
import Link from "next/link";
import { api } from "@crunchrr/shared";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { DropCountdown } from "@/components/drops/drop-countdown";
import { ProductCard } from "@/components/shop/product-card";

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

  const seed = 4 * 3600 + 18 * 60 - (Math.floor(Date.now() / 60_000) % 3600);

  return (
    <div className="flex min-h-screen w-full flex-col bg-canvas">
      <SiteHeader />

      <main className="w-full">
        <section className="mx-auto w-full max-w-7xl px-6 pb-10 pt-10 lg:px-12">
          <div className="eyebrow mb-2">
            <span className="material-symbols-outlined text-sm">timer</span>
            <span>The Vault</span>
          </div>
          <h1 className="mb-4 font-display text-4xl font-bold uppercase leading-none tracking-tight text-charcoal md:text-6xl">
            Batch 004 is
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
                Cyber Pastel Capsule closes in
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-brand">hourglass_top</span>
              <DropCountdown initialSeconds={Math.max(seed, 60)} />
            </div>
          </div>
        </section>

        <section className="mx-auto w-full max-w-7xl px-6 pb-20 lg:px-12">
          <h2 className="mb-6 border-b border-neutral-200/60 pb-4 font-display text-xl font-bold uppercase tracking-tight text-charcoal">
            Allocation Priority Pieces
          </h2>
          <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {items.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>

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
