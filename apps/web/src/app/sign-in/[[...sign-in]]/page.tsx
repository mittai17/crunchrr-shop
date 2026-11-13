import { SignIn } from "@clerk/nextjs";
import type { Metadata } from "next";
import Link from "next/link";
import { CrunchrrLogo } from "@/components/brand/logo";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Access your Crunchrr collector account and drop history.",
};

export default function SignInPage() {
  return (
    <div className="flex min-h-screen w-full flex-col bg-canvas">
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-14">
        <Link href="/" className="mb-8" aria-label="Crunchrr home">
          <CrunchrrLogo />
        </Link>
        <div className="w-full max-w-md rounded-2xl border border-neutral-200/70 bg-white p-2 shadow-card">
          <SignIn
            signUpUrl="/sign-up"
            fallbackRedirectUrl="/"
            appearance={{
              variables: {
                colorPrimary: "#F45B50",
                colorBackground: "#FAF8F6",
                colorText: "#121212",
              },
            }}
          />
        </div>
        <p className="mt-6 max-w-xs text-center text-xs leading-relaxed text-charcoal-muted">
          Collector accounts unlock allocation priority, order tracking, and
          batch-verified resale.
        </p>
      </div>
    </div>
  );
}
