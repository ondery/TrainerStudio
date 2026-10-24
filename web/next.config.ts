import type { NextConfig } from "next";

/** Dev-live only. The release build stays a static export when this is unset. */
const live = process.env.STUDIO_DEV_LIVE === "1";
const apiOrigin = process.env.STUDIO_API_ORIGIN || "http://127.0.0.1:43150";

const nextConfig: NextConfig = {
  ...(live ? {} : { output: "export" as const }),
  images: { unoptimized: true },
  reactStrictMode: true,
  poweredByHeader: false,
  webpack: (config) => {
    config.resolve.alias = { ...(config.resolve.alias || {}), canvas: false };
    return config;
  },
  ...(live
    ? {
        async rewrites() {
          return [{ source: "/api/:path*", destination: `${apiOrigin}/api/:path*` }];
        },
      }
    : {}),
};

export default nextConfig;
