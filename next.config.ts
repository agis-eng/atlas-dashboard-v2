import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: ".",
  },
  serverExternalPackages: ["playwright-core", "@browserbasehq/sdk"],
  // Allow the image optimizer to downscale Vercel Blob photos. Vision (AI)
  // calls fetch these through /_next/image at a reduced size to cut image
  // input tokens — the main driver of Anthropic API cost.
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "*.public.blob.vercel-storage.com" },
    ],
  },
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        https: false,
        http: false,
        stream: false,
        crypto: false,
        zlib: false,
        path: false,
        os: false,
      };
      // Handle node: prefixed imports from pptxgenjs
      config.resolve.alias = {
        ...config.resolve.alias,
        "node:fs": false,
        "node:https": false,
        "node:http": false,
        "node:stream": false,
        "node:crypto": false,
        "node:zlib": false,
        "node:path": false,
        "node:os": false,
      };
    }
    return config;
  },
};

export default nextConfig;
