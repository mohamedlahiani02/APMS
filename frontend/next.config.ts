import type { NextConfig } from 'next';
import path from 'node:path';

const backendOrigin = process.env.BACKEND_ORIGIN || 'http://127.0.0.1:3001';
const nextConfig: NextConfig = {
  output: process.env.APMS_SERVER_MODE === 'unified' ? undefined : 'standalone',
  poweredByHeader: false,
  ...(process.env.APMS_SERVER_MODE === 'unified' ? { experimental: { cpus: 2 } } : {}),
  turbopack: { root: path.resolve(process.cwd()) },
  async rewrites() {
    if (process.env.APMS_SERVER_MODE === 'unified') return [];
    return [{ source: '/api/v1/:path*', destination: backendOrigin + '/api/v1/:path*' }];
  },
};
export default nextConfig;
