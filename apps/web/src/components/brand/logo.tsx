/**
 * Crunchrr wordmark — CSS/SVG composition matching the mockup's
 * geometric coral mark + Space Grotesk "CRUNCHRR." text.
 */
export function CrunchrrLogo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <svg
        viewBox="0 0 32 32"
        className="h-6 w-6 shrink-0"
        aria-hidden="true"
        fill="none"
      >
        <rect width="32" height="32" rx="9" fill="#121212" />
        <path
          d="M23.5 12.4c-1.4-1.9-3.5-3-6-3-4.1 0-7 3-7 6.6s2.9 6.6 7 6.6c2.5 0 4.6-1.1 6-3"
          stroke="#F45B50"
          strokeWidth="2.4"
          strokeLinecap="round"
        />
        <circle cx="24" cy="16" r="1.6" fill="#FAF8F6" />
      </svg>
      <span className="font-display text-lg font-bold uppercase tracking-tight text-charcoal">
        crunchrr.
      </span>
    </span>
  );
}
