/**
 * In-process counter registry — deliberately tiny.
 *
 * Counters here cover things the database does not record as rows
 * (worker sweeps, sweep outcomes). Everything that is persisted
 * (orders, webhooks, splits) is derived from the DB in the metrics
 * route instead, so it survives restarts.
 *
 * Swap for prom-client if a Prometheus scrape endpoint is ever needed;
 * the naming already follows `domain.event` conventions.
 */
const counters = new Map<string, number>();

export function inc(name: string, by = 1): void {
  counters.set(name, (counters.get(name) ?? 0) + by);
}

export function snapshotCounters(): Record<string, number> {
  return Object.fromEntries([...counters.entries()].sort(([a], [b]) => a.localeCompare(b)));
}
