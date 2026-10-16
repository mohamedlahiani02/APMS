import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Standalone output matches the production deploy convention documented
  // for this app (NSSM-managed Node service). Harmless for local dev/build.
  output: 'standalone',
};

export default nextConfig;
