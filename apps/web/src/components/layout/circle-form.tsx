"use client";

/**
 * Collector's Circle form — demo-honest: validates locally, confirms
 * instantly and stores the subscription in localStorage. No backend call
 * is faked; when a real newsletter endpoint lands, swap persist() for it.
 */
import { useState } from "react";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "crunchrr.circle-email";

export function CircleForm({ dark = false }: { dark?: boolean }) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [joined, setJoined] = useState<string | null>(null);

  const submit = () => {
    const value = email.trim();
    if (!/.+@.+\..+/.test(value)) {
      setError("Enter a valid email to join the circle.");
      return;
    }
    try {
      window.localStorage.setItem(STORAGE_KEY, value);
    } catch {
      /* private mode — membership still confirmed for this session */
    }
    setError(null);
    setJoined(value);
  };

  if (joined) {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-jade/30 bg-jade-tint px-4 py-3.5">
        <span className="material-symbols-outlined filled mt-0.5 text-lg text-jade-deep">
          check_circle
        </span>
        <div>
          <p className="font-display text-xs font-bold uppercase tracking-wider text-jade-deep">
            You&apos;re in the circle
          </p>
          <p className="mt-0.5 text-xs text-charcoal-muted">
            {joined} — allocation codes land before the next vault opens.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-2">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="Enter your email..."
          aria-label="Email address"
          className="flex-1 rounded-full border border-neutral-200 bg-white px-4 py-2.5 text-xs text-charcoal outline-none transition-colors placeholder:text-charcoal-muted focus:border-brand"
        />
        <button
          type="button"
          onClick={submit}
          className="rounded-full bg-charcoal px-4 py-2.5 font-display text-[11px] font-bold uppercase tracking-wider text-white transition-colors hover:bg-brand"
        >
          Join
        </button>
      </div>
      {error ? (
        <p className={cn("mt-2 text-xs", dark ? "text-white/90" : "text-error")}>{error}</p>
      ) : null}
    </div>
  );
}
