import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  htmlLimitedBots: /.*/,
  outputFileTracingIncludes: { "/station/*/opengraph-image": ["./assets/social-fonts/*", "./public/flags/*", "./public/brand/waveatlas-atlas-compass.svg"] },
  experimental: { optimizePackageImports: ["lucide-react"] },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "raw.githubusercontent.com",
        pathname: "/Omoluabi1003/WaveAtlas/main/**",
      },
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "images.pexels.com" },
      { protocol: "https", hostname: "cdn.pixabay.com" },
      { protocol: "https", hostname: "www.nasa.gov" },
      { protocol: "https", hostname: "upload.wikimedia.org" },
    ],
  },
};

export default nextConfig;
