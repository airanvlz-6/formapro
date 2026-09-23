import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [{ source: '/:path*', has: [{ type: 'host' as const, value: 'forgeapp.es' }],
      destination: 'https://www.forgeapp.es/:path*', permanent: true }];
  },
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
