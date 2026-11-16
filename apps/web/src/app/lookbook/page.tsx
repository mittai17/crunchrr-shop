import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { DROP } from "@/lib/drop";

export const metadata: Metadata = {
  title: "Lookbook — Drop 004 Editorial",
  description:
    "The Crunchrr Drop 004 lookbook: kinetic streetwear shot in brutalist concrete, Tokyo neon, and rain-soaked asphalt.",
};

const SHOTS = [
  {
    src: "/products/img_8f50510a9f.jpg",
    alt: "Two models in matching cyber-pastel hoodies in a brutalist metro station",
    title: "Concrete Cathedral",
    note: "Cyber Pastel Capsule — Look 01",
  },
  {
    src: "/products/img_42acac9768.jpg",
    alt: "Model walking through night-time Tokyo Shibuya crossing in a technical windbreaker",
    title: "Shibuya Scramble",
    note: "Vybe Shell — Look 04",
  },
  {
    src: "/products/img_01d27a7f6c.jpg",
    alt: "Close-up portrait with neon cyberpunk lighting and oversized beanie",
    title: "Neon Skin",
    note: "Merino Rib — Look 07",
  },
  {
    src: "/products/img_b5cc6de369.jpg",
    alt: "Macro of cargo pocket hardware and gunmetal buckles",
    title: "Hardware Poetry",
    note: "Modular Cargo — Detail 12",
  },
];

export default function LookbookPage() {
  return (
    <div className="flex min-h-screen w-full flex-col bg-canvas">
      <SiteHeader />

      <main className="w-full">
        <section className="mx-auto w-full max-w-7xl px-6 pb-12 pt-10 lg:px-12">
          <div className="eyebrow mb-2">
            <span className="material-symbols-outlined text-sm">photo_library</span>
            <span>Drop 004 — Field Editorial</span>
          </div>
          <h1 className="mb-4 max-w-3xl font-display text-4xl font-bold uppercase leading-none tracking-tight text-charcoal md:text-6xl">
            Shot in concrete,
            <span className="block font-normal italic text-brand">
              worn in the wild.
            </span>
          </h1>
          <p className="max-w-xl text-sm leading-relaxed text-charcoal-muted sm:text-base">
            Every Crunchrr campaign is captured unretouched in the environments
            the clothes are built for — brutalist metros, night crossings,
            rain-slick asphalt. No studio ghosts. No fast-fashion gloss.
          </p>
        </section>

        <section className="mx-auto w-full max-w-7xl px-6 pb-20 lg:px-12">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {SHOTS.map((shot) => (
              <Link
                key={shot.title}
                href="/shop"
                aria-label={`Shop pieces from ${shot.title}`}
                className="group relative block aspect-[4/5] overflow-hidden rounded-2xl bg-neutral-200 shadow-card cursor-pointer"
              >
                <Image
                  src={shot.src}
                  alt={shot.alt}
                  fill
                  sizes="(max-width: 768px) 100vw, 50vw"
                  className="object-cover transition-transform duration-700 ease-out group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-charcoal/80 via-transparent to-transparent" />
                <span className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-white/85 text-charcoal opacity-0 shadow-md backdrop-blur-sm transition-opacity duration-200 group-hover:opacity-100">
                  <span className="material-symbols-outlined text-lg">arrow_forward</span>
                </span>
                <div className="absolute bottom-0 left-0 right-0 p-6">
                  <span className="mb-1 inline-block font-display text-[10px] font-bold uppercase tracking-[0.2em] text-brand">
                    {shot.note}
                  </span>
                  <h2 className="font-display text-2xl font-bold uppercase tracking-tight text-white">
                    {shot.title}
                  </h2>
                </div>
              </Link>
            ))}
          </div>
        </section>

        <section className="mx-auto w-full max-w-7xl px-6 pb-20 lg:px-12">
          <div className="rounded-3xl bg-charcoal p-10 text-center text-white lg:p-14">
            <h2 className="mb-3 font-display text-2xl font-bold uppercase tracking-tight md:text-3xl">
              Shop the editorial
            </h2>
            <p className="mx-auto mb-7 max-w-md text-sm text-white/70">
              The pieces behind these looks ship from the {DROP.dropLabel} vault
              while allocations last.
            </p>
            <Link href="/shop" className="btn-pill-coral">
              <span>Enter The Vault</span>
              <span className="material-symbols-outlined text-base">arrow_forward</span>
            </Link>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
