import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PDF.js resolves its worker beside the installed package, not a Turbopack chunk.
  serverExternalPackages: ["pdf-parse"],
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
