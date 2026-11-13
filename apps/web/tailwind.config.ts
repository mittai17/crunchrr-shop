import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";

/**
 * Crunchrr design tokens — extracted 1:1 from the "Urban Vanguard" mockup
 * (crunchrr. storefront). Fonts: Space Grotesk (display) + Plus Jakarta Sans (sans).
 */
const config: Config = {
  darkMode: "class",
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
    "./src/lib/**/*.{ts,tsx}",
    "./src/hooks/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: "#F45B50",
        "brand-dark": "#D9473C",
        canvas: "#FAF8F6",
        "surface-pure": "#FFFFFF",
        "surface-muted": "#F4F1EE",
        "surface-subtle": "#EEEAE6",
        charcoal: "#121212",
        "charcoal-muted": "#555250",
        "charcoal-light": "#8C8885",
        jade: "#1DD1A1",
        "jade-deep": "#0B8263",
        "jade-tint": "#E6FAF5",
        "border-subtle": "rgba(28, 25, 23, 0.08)",
        "border-light": "rgba(28, 25, 23, 0.05)",
        error: "#BA1A1A",
        "error-container": "#FFDAD6",
      },
      fontFamily: {
        sans: ["var(--font-jakarta)", "Plus Jakarta Sans", "sans-serif"],
        display: ["var(--font-grotesk)", "Space Grotesk", "sans-serif"],
      },
      borderRadius: {
        DEFAULT: "1rem",
        sm: "0.5rem",
        md: "1.5rem",
        lg: "2rem",
        xl: "3rem",
      },
      letterSpacing: {
        label: "0.16em",
        overline: "0.2em",
      },
      boxShadow: {
        card: "0 4px 20px rgba(0,0,0,0.02)",
        "card-hover": "0 12px 32px rgba(0,0,0,0.06)",
        hero: "0 20px 50px rgba(244, 91, 80, 0.22)",
        float: "0 12px 32px rgba(0,0,0,0.12)",
        offset: "3px 3px 0px #111111",
      },
      keyframes: {
        "fade-up": {
          from: { opacity: "0", transform: "translateY(12px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        shimmer: {
          from: { backgroundPosition: "200% 0" },
          to: { backgroundPosition: "-200% 0" },
        },
        marquee: {
          from: { transform: "translateX(0)" },
          to: { transform: "translateX(-50%)" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.5s ease-out both",
        shimmer: "shimmer 2.4s linear infinite",
        marquee: "marquee 22s linear infinite",
      },
    },
  },
  plugins: [animate],
};

export default config;
