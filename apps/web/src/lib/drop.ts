/**
 * The live release — single source of truth for drop naming.
 * Every surface (header rail, countdowns, bag copy, empty states) reads
 * from here so "Drop 004 / Batch 004 / Cyber Pastel" never drift apart.
 * Bump this object when the next capsule goes live.
 */
/**
 * The live release — single source of truth for drop naming.
 * Every surface (header rail, countdowns, bag copy, empty states) reads
 * from here so "Drop 004 / Batch 004 / Cyber Pastel" never drift apart.
 * Bump this object when the next capsule goes live.
 */
export const DROP = {
  number: "004",
  name: "Cyber Pastel Capsule",
  /** "Drop 004" — product/surface copy. */
  dropLabel: "Drop 004",
  /** "Batch 004" — countdown/allocation copy. */
  batchLabel: "Batch 004",
  rail: "Drop 004 · Cyber Pastel — live now",
} as const;

/**
 * Seconds until the next UTC midnight — the real, deterministic vault
 * deadline. Server-computed so the countdown is hydration-safe; the same
 * clock drives the home ticker and the drops page.
 */
export function secondsToVaultClose(): number {
  const now = new Date();
  const midnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  return Math.max(60, Math.round((midnight - now.getTime()) / 1000));
}
