import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow large API request bodies for file uploads
  experimental: {
    serverActions: {
      bodySizeLimit: '20mb',
    },
  },
  // Add empty turbopack config to silence the webpack/turbopack conflict
  turbopack: {},
  // Webpack config for pdfjs-dist compatibility (used when building with --webpack)
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      canvas: false,
    };
    return config;
  },
};

export default nextConfig;
