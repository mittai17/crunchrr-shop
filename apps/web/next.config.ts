import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  images: {
    // Local product photography lives in /public/products.
    formats: ["image/avif", "image/webp"],
  },
  eslint: { ignoreDuringBuilds: false },
  transpilePackages: ["@crunchrr/shared"],
};

export default nextConfig;
