import type { MetadataRoute } from "next";

/**
 * Sitemap — static routes + live product slugs from the API.
 * Falls back to static-only when the API is unreachable so crawlers
 * never get a 500 from this route.
 */
const SITE =
  process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
const API =
  process.env.API_INTERNAL_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  "http://localhost:4001";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const staticRoutes: MetadataRoute.Sitemap = [
    { path: "", priority: 1.0, changeFrequency: "weekly" as const },
    { path: "/shop", priority: 0.9, changeFrequency: "daily" as const },
    { path: "/drops", priority: 0.8, changeFrequency: "weekly" as const },
    { path: "/lookbook", priority: 0.6, changeFrequency: "monthly" as const },
    { path: "/manifesto", priority: 0.5, changeFrequency: "monthly" as const },
  ].map((r) => ({
    url: `${SITE}${r.path}`,
    lastModified: now,
    changeFrequency: r.changeFrequency,
    priority: r.priority,
  }));

  try {
    const res = await fetch(`${API}/api/products?limit=48`, {
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return staticRoutes;
    const json = (await res.json()) as {
      items?: Array<{ slug: string }>;
    };
    const products: MetadataRoute.Sitemap = (json.items ?? []).map((p) => ({
      url: `${SITE}/product/${p.slug}`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.8,
    }));
    return [...staticRoutes, ...products];
  } catch {
    return staticRoutes;
  }
}
