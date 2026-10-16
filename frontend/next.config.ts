import type { NextConfig } from 'next';
import path from 'node:path';

const backendOrigin = process.env.BACKEND_ORIGIN || 'http://127.0.0.1:3001';
const nextConfig: NextConfig = {
  output: process.env.APMS_SERVER_MODE === 'unified' ? undefined : 'standalone',
  poweredByHeader: false,
  ...(process.env.APMS_SERVER_MODE === 'unified' ? { experimental: { cpus: 2 } } : {}),
  turbopack: { root: path.resolve(process.cwd()) },
  async headers() {
    return [{ source: '/sw.js', headers: [
      { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
      { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
      { key: 'Service-Worker-Allowed', value: '/' },
      { key: 'Content-Security-Policy', value: "default-src 'self'; script-src 'self'; connect-src 'self'" },
    ] }];
  },
  async rewrites() {
    if (process.env.APMS_SERVER_MODE === 'unified') return [];
    return [{ source: '/api/v1/:path*', destination: backendOrigin + '/api/v1/:path*' }];
  },
};
export default nextConfig;
