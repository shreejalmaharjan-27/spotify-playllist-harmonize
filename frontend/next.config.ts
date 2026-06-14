import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // standalone build => small runtime image for Docker
  output: "standalone",
  images: { remotePatterns: [{ protocol: "https", hostname: "**" }] },
};

export default nextConfig;
