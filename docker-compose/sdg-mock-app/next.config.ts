import type { NextConfig } from 'next';
import path from 'path';

const N8N_TARGET = process.env.N8N_TARGET || 'http://localhost:5678';

const nextConfig: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: path.join(__dirname),
  env: {
    // Expose CHEFS_BASE_URL to client-side code without needing NEXT_PUBLIC_ prefix
    NEXT_PUBLIC_CHEFS_BASE_URL: process.env.CHEFS_BASE_URL || 'https://submit.digital.gov.bc.ca/app',
  },
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
