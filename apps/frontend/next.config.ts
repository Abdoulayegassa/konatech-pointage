import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  eslint: {
    ignoreDuringBuilds: true,
  },
  reactStrictMode: true,
  async redirects() {
    return [
      { source: '/attendance-sites', destination: '/sites', permanent: false },
      { source: '/organization-settings', destination: '/organization/settings', permanent: false },
      { source: '/subscription', destination: '/organization/subscription', permanent: false },
      { source: '/calendar', destination: '/organization/calendar', permanent: false },
      { source: '/sanctions', destination: '/organization/sanctions', permanent: false },
    ];
  },
};

export default nextConfig;
