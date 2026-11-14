import { SignUp } from "@clerk/nextjs";
import type { Metadata } from "next";
import Link from "next/link";
import { CrunchrrLogo } from "@/components/brand/logo";

export const metadata: Metadata = {
  title: "Create account",
  description: "Join the Crunchrr Collector's Circle for drop priority.",
};

export default function SignUpPage() {
  return (
    <div className="flex min-h-screen w-full flex-col bg-canvas">
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-14">
        <Link href="/" className="mb-8" aria-label="Crunchrr home">
          <CrunchrrLogo />
        </Link>
        <div className="w-full max-w-md rounded-2xl border border-neutral-200/70 bg-white p-2 shadow-card">
          <SignUp
            signInUrl="/sign-in"
            fallbackRedirectUrl="/"
            appearance={{
              variables: {
                colorPrimary: "#F45B50",
                colorBackground: "#FAF8F6",
                colorForeground: "#121212",
              },
            }}
          />
        </div>
        <p className="mt-6 max-w-xs text-center text-xs leading-relaxed text-charcoal-muted">
          Joining is free. SMS priority requires a verified phone number.
        </p>
      </div>
    </div>
  );
}
