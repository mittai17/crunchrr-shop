import Link from "next/link";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";

export default function NotFound() {
  return (
    <div className="flex min-h-screen w-full flex-col bg-canvas">
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center px-6 py-24 text-center">
        <span className="mb-4 font-display text-7xl font-bold tracking-tight text-brand">
          404
        </span>
        <h1 className="mb-3 font-display text-3xl font-bold uppercase tracking-tight text-charcoal">
          Piece not archived
        </h1>
        <p className="mb-8 text-sm text-charcoal-muted">
          This URL isn&apos;t in the Drop 004 vault. It may have sold out and
          retired to the archive — browse the live vault instead.
        </p>
        <div className="flex items-center gap-4">
          <Link href="/shop" className="btn-pill-coral">
            Enter The Vault
          </Link>
          <Link href="/" className="btn-pill-ghost">
            Back Home
          </Link>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
