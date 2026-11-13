import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { api, type Product } from "@crunchrr/shared";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { PdpClient } from "@/components/pdp/pdp-client";

export const revalidate = 120;

type Params = Promise<{ slug: string }>;

async function loadProduct(slug: string): Promise<{
  product: Product;
  related: Product[];
} | null> {
  try {
    return await api.getProduct(slug);
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const data = await loadProduct(slug);
  if (!data) return { title: "Product not found" };
  const { product } = data;
  return {
    title: product.name,
    description: product.tagline || product.description.slice(0, 155),
    openGraph: {
      title: `${product.name} | Crunchrr`,
      description: product.tagline,
      images: product.images[0] ? [{ url: product.images[0].url }] : [],
    },
    alternates: { canonical: `/product/${product.slug}` },
  };
}

export default async function ProductPage({ params }: { params: Params }) {
  const { slug } = await params;
  const data = await loadProduct(slug);
  if (!data) notFound();

  const { product, related } = data;
  const bannerImg = product.images[4] ?? product.images[1] ?? product.images[0];

  /* JSON-LD for Google Rich Results */
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.description,
    image: product.images.map((i) => i.url),
    brand: { "@type": "Brand", name: "Crunchrr" },
    aggregateRating: {
      "@type": "AggregateRating",
      ratingValue: product.rating,
      reviewCount: product.reviewCount,
    },
    offers: {
      "@type": "AggregateOffer",
      priceCurrency: "USD",
      lowPrice: Math.min(...product.variants.map((v) => v.priceMinor)) / 100,
      highPrice: Math.max(...product.variants.map((v) => v.priceMinor)) / 100,
      offerCount: product.variants.length,
      availability: product.variants.some((v) => v.stock > 0)
        ? "https://schema.org/InStock"
        : "https://schema.org/SoldOut",
    },
  };

  return (
    <div className="flex min-h-screen w-full flex-col bg-canvas">
      <SiteHeader />

      {/* Coral marquee rail */}
      <div className="w-full overflow-hidden bg-brand py-2 text-white">
        <div className="flex items-center justify-around gap-6 whitespace-nowrap font-display text-[11px] font-bold uppercase tracking-widest">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-sm">local_shipping</span>
            <span>Worldwide express delivery / Dropship dispatch in 24H</span>
          </div>
          <div className="hidden items-center gap-2 text-white/80 md:flex">
            <span className="material-symbols-outlined text-sm">bolt</span>
            <span>Batch #09 Urban Vanguard — Limited to 300 units worldwide</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-sm">verified</span>
            <span>Authenticity Tagged NFC Chip Embedded in Collar</span>
          </div>
        </div>
      </div>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <main className="w-full">
        {/* Breadcrumb */}
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-4 px-6 pb-3 pt-6 lg:px-12">
          <nav
            className="flex items-center gap-1.5 font-display text-[11px] font-bold uppercase tracking-wider text-charcoal-muted"
            aria-label="Breadcrumb"
          >
            <Link href="/" className="transition-colors hover:text-charcoal">
              Home
            </Link>
            <span className="text-neutral-300">/</span>
            <Link href={`/shop?category=${product.category}`} className="transition-colors hover:text-charcoal">
              {product.category.charAt(0) + product.category.slice(1).toLowerCase()}
            </Link>
            <span className="text-neutral-300">/</span>
            <span className="text-charcoal">{product.name}</span>
          </nav>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-jade-tint px-3 py-1 font-display text-[10px] font-bold uppercase tracking-wider text-jade-deep">
              <span className="h-2 w-2 animate-ping rounded-full bg-jade" />
              Batch #09 Active Drop
            </span>
            <span className="rounded-full bg-surface-muted px-3 py-1 font-display text-[10px] font-bold uppercase tracking-wider text-charcoal-muted">
              SKU: CR-UV-450-COR
            </span>
          </div>
        </div>

        {/* Two-column stage */}
        <section className="mx-auto w-full max-w-7xl px-6 pb-12 lg:px-12">
          <PdpClient product={product} />
        </section>

        {/* Coral editorial banner */}
        <section className="mx-auto w-full max-w-7xl px-6 pb-12 lg:px-12">
          <div className="relative overflow-hidden rounded-xl bg-brand p-6 shadow-xl md:p-10">
            <div className="pointer-events-none absolute bottom-1 right-4 select-none opacity-[0.09]">
              <span className="font-display text-[110px] font-bold leading-none tracking-tighter text-white md:text-[140px]">
                004
              </span>
            </div>
            <div className="relative z-10 grid grid-cols-1 items-center gap-6 lg:grid-cols-12">
              <div className="space-y-4 lg:col-span-5">
                <div className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1 backdrop-blur-md">
                  <span className="material-symbols-outlined text-sm text-white">stars</span>
                  <span className="font-display text-[10px] font-bold uppercase tracking-widest text-white">
                    The Design Language
                  </span>
                </div>
                <h2 className="font-display text-3xl font-bold uppercase leading-tight text-white md:text-4xl">
                  Where Art Meets Your Style
                </h2>
                <p className="max-w-md text-base text-white/90">
                  Step into the future of kinetic streetwear. Engineered with
                  oversized structural geometry and tactile pigments designed to
                  age with personality.
                </p>
                <div className="flex items-center gap-3 pt-1">
                  <Link
                    href="/shop"
                    className="flex items-center gap-2 rounded-full bg-white px-6 py-3 font-display text-sm font-bold uppercase tracking-wider text-charcoal shadow-lg transition-all hover:bg-canvas"
                  >
                    <span>Explore Collection</span>
                    <span className="material-symbols-outlined text-base">arrow_forward</span>
                  </Link>
                </div>
              </div>

              <div className="relative -my-6 flex justify-center lg:col-span-4">
                <div className="h-80 w-64 overflow-hidden rounded-lg bg-surface-muted shadow-2xl sm:w-72 md:h-[420px] md:w-80">
                  {bannerImg ? (
                    <Image
                      src={bannerImg.url}
                      alt={bannerImg.alt}
                      fill
                      sizes="(max-width: 1024px) 80vw, 320px"
                      className="object-cover"
                    />
                  ) : null}
                </div>
              </div>

              <div className="flex flex-col gap-4 lg:col-span-3">
                {/* Community card */}
                <div className="rounded bg-white p-4 text-charcoal shadow-lg">
                  <div className="mb-1.5 flex -space-x-2">
                    {["/products/img_3dd736ff90.jpg", "/products/img_9ba4a5c07c.jpg", "/products/img_4a248364e2.jpg"].map(
                      (src) => (
                        <Image
                          key={src}
                          src={src}
                          alt="Tribe member"
                          width={56}
                          height={56}
                          className="h-7 w-7 rounded-full border-2 border-white object-cover"
                        />
                      ),
                    )}
                    <div className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-surface-subtle font-display text-[10px] font-bold text-charcoal">
                      +4k
                    </div>
                  </div>
                  <p className="font-display text-xs font-bold uppercase tracking-tight">
                    Rated {product.rating.toFixed(1)} Stars by The Tribe
                  </p>
                  <p className="text-[11px] text-charcoal-muted">
                    98% positive wearability feedback on Batch #09
                  </p>
                </div>

                {/* Matching drop mini-card */}
                {related[0] ? (
                  <div className="flex items-center gap-3 rounded bg-white p-4 text-charcoal shadow-lg">
                    <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded bg-surface-muted">
                      {related[0].images[0] ? (
                        <Image
                          src={related[0].images[0].url}
                          alt={related[0].name}
                          fill
                          sizes="56px"
                          className="object-cover"
                        />
                      ) : null}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-charcoal-muted">
                        Matching Drop
                      </p>
                      <h4 className="truncate font-display text-xs font-bold uppercase">
                        {related[0].name}
                      </h4>
                      <p className="text-xs font-bold text-brand">
                        ${(related[0].variants[0]?.priceMinor ?? 0) / 100}
                      </p>
                    </div>
                    <Link
                      href={`/product/${related[0].slug}`}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand text-white transition-colors hover:bg-brand-dark"
                      title="View"
                    >
                      <span className="material-symbols-outlined text-sm">arrow_forward</span>
                    </Link>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </section>

        {/* Complete the fit */}
        <section className="mx-auto w-full max-w-7xl px-6 pb-16 lg:px-12">
          <div className="mb-6 flex flex-col justify-between gap-2 md:flex-row md:items-end">
            <div>
              <div className="eyebrow mb-1">
                <span className="material-symbols-outlined text-sm">auto_fix_high</span>
                <span>Curated Synergy</span>
              </div>
              <h3 className="font-display text-2xl font-bold uppercase text-charcoal md:text-3xl">
                Complete The Fit
              </h3>
            </div>
            <p className="max-w-md text-sm text-charcoal-muted">
              Pieces specifically tailored by our creative direction team to
              balance proportions and textures with the {product.name}.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            {related.map((rel) => (
              <div
                key={rel.id}
                className="group flex flex-col overflow-hidden rounded-lg bg-white shadow-sm transition-all duration-300 hover:shadow-xl"
              >
                <div className="relative h-80 w-full overflow-hidden bg-surface-muted">
                  <Image
                    src={rel.images[0]?.url ?? ""}
                    alt={rel.images[0]?.alt ?? rel.name}
                    fill
                    sizes="(max-width: 768px) 100vw, 33vw"
                    className="object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                  {rel.badge ? (
                    <span
                      className={`absolute left-4 top-4 rounded-full px-2 py-1 font-display text-[10px] font-bold uppercase ${
                        rel.badge.tone === "coral"
                          ? "bg-brand text-white"
                          : rel.badge.tone === "jade"
                            ? "bg-jade text-white"
                            : "bg-charcoal text-white"
                      }`}
                    >
                      {rel.badge.text}
                    </span>
                  ) : null}
                  <Link
                    href={`/product/${rel.slug}`}
                    aria-label={`Quick view ${rel.name}`}
                    className="absolute bottom-4 right-4 flex h-11 w-11 items-center justify-center rounded-full bg-white text-charcoal shadow-md transition-colors hover:bg-brand hover:text-white"
                  >
                    <span className="material-symbols-outlined text-xl">shopping_cart</span>
                  </Link>
                </div>
                <div className="flex flex-1 flex-col justify-between p-6">
                  <div>
                    <div className="mb-1 flex items-center justify-between font-display text-[10px] font-bold uppercase tracking-wider text-charcoal-muted">
                      <span>{rel.category.charAt(0) + rel.category.slice(1).toLowerCase()}</span>
                      <span className="text-jade-deep">
                        {rel.unitsLeftLabel ?? "In Stock"}
                      </span>
                    </div>
                    <h4 className="font-display text-base font-bold uppercase text-charcoal transition-colors group-hover:text-brand">
                      <Link href={`/product/${rel.slug}`}>{rel.name}</Link>
                    </h4>
                    <p className="mt-1 text-xs text-charcoal-muted">{rel.tagline}</p>
                  </div>
                  <div className="mt-4 flex items-center justify-between border-t border-neutral-100 pt-4">
                    <span className="font-display text-base font-bold text-charcoal">
                      ${(rel.variants[0]?.priceMinor ?? 0) / 100}
                    </span>
                    <span className="flex items-center gap-1 font-display text-[10px] font-bold uppercase text-charcoal-muted transition-transform group-hover:translate-x-1">
                      View Specs{" "}
                      <span className="material-symbols-outlined text-sm">chevron_right</span>
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
