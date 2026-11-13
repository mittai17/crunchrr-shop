"use client";

/**
 * Drop countdown ticker — hydrates a static SSR placeholder to avoid CLS.
 */
import { useEffect, useState } from "react";
import { pad2 } from "@/lib/utils";

type Props = {
  /** Remaining seconds (server-computed for SEO-friendly markup). */
  initialSeconds: number;
};

export function DropCountdown({ initialSeconds }: Props) {
  const [seconds, setSeconds] = useState(initialSeconds);

  useEffect(() => {
    setSeconds(initialSeconds);
    const id = setInterval(() => {
      setSeconds((s) => (s > 0 ? s - 1 : 0));
    }, 1000);
    return () => clearInterval(id);
  }, [initialSeconds]);

  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;

  return (
    <span
      id="countdown"
      suppressHydrationWarning
      className="font-display text-sm font-bold tracking-widest text-charcoal"
    >
      {pad2(h)}:{pad2(m)}:{pad2(s)}
    </span>
  );
}
