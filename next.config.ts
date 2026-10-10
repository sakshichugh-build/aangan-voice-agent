import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The console is entirely auth-gated and request-dynamic, so Partial
  // Prerendering / Cache Components only add friction here. Keep it simple.
  cacheComponents: false,
  partialPrefetching: false,
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
