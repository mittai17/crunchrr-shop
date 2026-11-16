import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { DROP } from "@/lib/drop";

export const metadata: Metadata = {
  title: "Manifesto — Never Mass Produced",
  description:
    "The Crunchrr operating manual: limited batch production, fair-wage craft, zero-landfill logistics, and the collector-first drop protocol.",
};

const TENETS = [
  {
    icon: "inventory_2",
    title: "Single Batch. Never Restocked.",
    body: "Every release is capped — 300 to 500 units worldwide. When the vault closes, the pattern is retired to the archive. Scarcity is a design constraint, not a marketing trick.",
  },
  {
    icon: "weight",
    title: "Heavyweight Is Non-Negotiable",
    body: "450–480 GSM loopback fleece, 260–300 GSM heavyweight jersey. We publish GSM on every card because fabric honesty is the whole brand.",
  },
  {
    icon: "eco",
    title: "Zero-Landfill Craft",
    body: "OEKO-TEX 100 dyes, closed-loop wash water, cornstarch mailers, and fair-wage certified ateliers. Heavy style, light footprint.",
  },
  {
    icon: "route",
    title: "Multi-Partner POD Routing",
    body: "Orders split automatically across Qikink, Printrove, and in-house ops — each SKU routes to the atelier that crafts it best. Fewer miles, faster dispatch.",
  },
];

const FAQ = [
  {
    q: "How fast do drops sell out?",
    a: "Flagship pieces average 40 minutes. SMS-priority collectors get a 10-minute head start on every vault opening.",
  },
  {
    q: "What is the return policy?",
    a: "30-day free size swaps on unworn pieces. Sale batches are final sale once allocation confirms.",
  },
  {
    q: "Where do orders ship from?",
    a: "Our bonded depot dispatches within 24h. Multi-partner splits may arrive as separate tracked parcels — always covered by one order number.",
  },
  {
    q: "How do I verify authenticity?",
    a: "Every garment carries an NFC chip in the collar seam — tap with your phone to pull the batch record.",
  },
];

export default function ManifestoPage() {
  return (
    <div className="flex min-h-screen w-full flex-col bg-canvas">
      <SiteHeader />

      <main className="w-full">
        <section className="mx-auto w-full max-w-4xl px-6 pb-14 pt-14 text-center lg:px-12">
          <div className="eyebrow mb-3 justify-center">
            <span className="material-symbols-outlined text-sm">bolt</span>
            <span>The Crunchrr Manifesto</span>
          </div>
          <h1 className="mb-5 font-display text-4xl font-bold uppercase leading-none tracking-tight text-charcoal md:text-6xl">
            Never mass produced.
            <span className="block text-brand">Never compromised.</span>
          </h1>
          <p className="mx-auto max-w-xl text-sm leading-relaxed text-charcoal-muted sm:text-base">
            We build streetwear like an archive, not a season. Heavy fabric,
            hard caps, honest labels — and logistics engineered so every order
            routes to the atelier that crafts it best.
          </p>
        </section>

        <section className="mx-auto w-full max-w-7xl px-6 pb-16 lg:px-12">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            {TENETS.map((t) => (
              <div
                key={t.title}
                className="rounded-2xl border border-neutral-200/70 bg-white p-7 shadow-card"
              >
                <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-brand/10">
                  <span className="material-symbols-outlined text-xl text-brand">
                    {t.icon}
                  </span>
                </div>
                <h2 className="mb-2 font-display text-lg font-bold uppercase tracking-tight text-charcoal">
                  {t.title}
                </h2>
                <p className="text-sm leading-relaxed text-charcoal-muted">{t.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Drop protocol — anchor targets referenced from the footer */}
        <section className="mx-auto w-full max-w-4xl px-6 pb-16 lg:px-12">
          <h2 className="mb-6 border-b border-neutral-200/60 pb-4 font-display text-2xl font-bold uppercase tracking-tight text-charcoal">
            The Protocol
          </h2>
          <div className="space-y-3">
            {[
              {
                id: "shipping",
                icon: "local_shipping",
                title: "Global Freight",
                body: "Tracked worldwide dispatch from our bonded depot within 24h of allocation. Multi-partner splits may arrive as separate parcels — always under one order number.",
              },
              {
                id: "authenticity",
                icon: "verified",
                title: "Authenticity Guarantee",
                body: "Every garment carries an NFC chip in the collar seam. Tap it with your phone to pull the batch record — run, GSM, and route.",
              },
              {
                id: "returns",
                icon: "sync",
                title: "Returns & Exchanges",
                body: "30-day free size swaps on unworn pieces. Allocated batches are final sale once payment confirms — we'll always list the policy before you pay.",
              },
              {
                id: "concierge",
                icon: "support_agent",
                title: "Client Concierge",
                body: "Questions about fit, GSM, or an in-flight order? Reach the concierge from your account page or order tracking — humans answer, not bots.",
              },
            ].map((p) => (
              <div
                key={p.id}
                id={p.id}
                className="flex scroll-mt-28 gap-4 rounded-2xl border border-neutral-200/70 bg-white p-5 shadow-card"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand/10">
                  <span className="material-symbols-outlined text-lg text-brand">
                    {p.icon}
                  </span>
                </div>
                <div>
                  <h3 className="font-display text-sm font-bold uppercase tracking-tight text-charcoal">
                    {p.title}
                  </h3>
                  <p className="mt-1 text-sm leading-relaxed text-charcoal-muted">{p.body}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto w-full max-w-4xl px-6 pb-20 lg:px-12" id="faq">
          <h2 className="mb-6 border-b border-neutral-200/60 pb-4 font-display text-2xl font-bold uppercase tracking-tight text-charcoal">
            Drop FAQ
          </h2>
          <div className="space-y-3">
            {FAQ.map((f) => (
              <details
                key={f.q}
                className="group rounded-xl border border-neutral-200/70 bg-white p-5 shadow-card"
              >
                <summary className="flex cursor-pointer items-center justify-between font-display text-sm font-bold uppercase tracking-tight text-charcoal">
                  {f.q}
                  <span className="material-symbols-outlined text-lg text-brand transition-transform group-open:rotate-45">
                    add
                  </span>
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-charcoal-muted">{f.a}</p>
              </details>
            ))}
          </div>

          <div
            id="circle"
            className="mt-10 flex scroll-mt-28 flex-col items-center gap-4 rounded-2xl bg-surface-subtle p-8 text-center sm:flex-row sm:justify-between sm:text-left"
          >
            <div>
              <h3 className="font-display text-lg font-bold uppercase tracking-tight text-charcoal">
                Ready for the next drop?
              </h3>
              <p className="text-sm text-charcoal-muted">
                {DROP.batchLabel} window is live — and the Collector&apos;s
                Circle gets priority on the next one (join from any page
                footer).
              </p>
            </div>
            <Link href="/drops" className="btn-pill-primary shrink-0">
              <span>Get Drop Alerts</span>
              <span className="material-symbols-outlined text-base">arrow_forward</span>
            </Link>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
