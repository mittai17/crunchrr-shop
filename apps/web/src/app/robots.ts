import type { MetadataRoute } from "next";

/**
 * robots — public catalog is crawlable; personal/utility screens are not.
 */
const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/account", "/wishlist", "/bag", "/track", "/sign-in", "/sign-up"],
      },
    ],
    sitemap: `${SITE}/sitemap.xml`,
  };
}
