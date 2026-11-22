import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Canvas snapshots include embedded image data.
      bodySizeLimit: "20mb",
    },
  },
  // Clerk serves user avatars from here (shown on the workspace board cards).
  images: {
    remotePatterns: [{ protocol: "https", hostname: "img.clerk.com" }],
  },
};

export default nextConfig;
