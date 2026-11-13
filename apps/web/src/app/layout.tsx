import type { Metadata, Viewport } from "next";
import { Space_Grotesk, Plus_Jakarta_Sans } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";

const grotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-grotesk",
  display: "swap",
});

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-jakarta",
  display: "swap",
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Crunchrr — Streetwear Engineered for Kinetic Lifestyles",
    template: "%s | Crunchrr",
  },
  description:
    "Crunchrr is high-impact contemporary streetwear: limited archival drops, 480 GSM heavyweight fleece, and rebellious urban culture. Never mass produced. Never compromised.",
  keywords: [
    "crunchrr",
    "streetwear",
    "heavyweight hoodie",
    "limited drops",
    "urban vanguard",
    "print on demand",
    "oversized tee",
  ],
  openGraph: {
    type: "website",
    siteName: "Crunchrr",
    title: "Crunchrr — Own the Edge. Keep the Vibe.",
    description:
      "Limited archival streetwear drops. 480 GSM heavyweight fleece, kinetic graphic tees, tactical hardware.",
    url: siteUrl,
  },
  twitter: {
    card: "summary_large_image",
    title: "Crunchrr — Own the Edge. Keep the Vibe.",
    description:
      "Limited archival streetwear drops. Heavyweight fleece, kinetic tees, tactical hardware.",
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#FAF8F6",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <ClerkProvider
      appearance={{
        variables: {
          colorPrimary: "#F45B50",
          colorBackground: "#FAF8F6",
          colorText: "#121212",
          fontFamily: "'Plus Jakarta Sans', sans-serif",
        },
      }}
    >
      <html lang="en" className={`${grotesk.variable} ${jakarta.variable}`}>
        <head>
          <link
            rel="stylesheet"
            href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=swap"
          />
        </head>
        <body>{children}</body>
      </html>
    </ClerkProvider>
  );
}
