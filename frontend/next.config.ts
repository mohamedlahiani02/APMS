import type { NextConfig } from 'next';
import path from 'node:path';

const backendOrigin = process.env.BACKEND_ORIGIN || 'http://127.0.0.1:3001';
const nextConfig: NextConfig = {
  output: 'standalone',
  turbopack: { root: path.resolve(process.cwd()) },
  async rewrites() {
    return [{ source: '/api/v1/:path*', destination: backendOrigin + '/api/v1/:path*' }];
  },
};
export default nextConfig;
