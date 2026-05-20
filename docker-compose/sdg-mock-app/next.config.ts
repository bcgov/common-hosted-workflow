import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  outputFileTracingRoot: __dirname,
  distDir: '.next',
  serverExternalPackages: ['better-sqlite3'],
};

export default nextConfig;
