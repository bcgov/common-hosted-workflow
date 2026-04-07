import type { NextConfig } from 'next';

const N8N_TARGET = process.env.N8N_TARGET || 'http://localhost:5678';

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      { source: '/rest/:path*', destination: `${N8N_TARGET}/rest/:path*` },
      { source: '/webhook/:path*', destination: `${N8N_TARGET}/webhook/:path*` },
      { source: '/webhook-waiting/:path*', destination: `${N8N_TARGET}/webhook-waiting/:path*` },
      { source: '/webhook-test/:path*', destination: `${N8N_TARGET}/webhook-test/:path*` },
      { source: '/webhook-test-waiting/:path*', destination: `${N8N_TARGET}/webhook-test-waiting/:path*` },
    ];
  },
};

export default nextConfig;
