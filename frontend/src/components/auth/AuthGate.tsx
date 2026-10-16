'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';

const ADMIN_PATHS = new Set(['/dashboard', '/bilan', '/stock', '/audit', '/utilisateurs']);

const PUBLIC_PATHS = new Set<string>(['/login']);

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const status = useAuthStore((s) => s.status);
  const bootstrap = useAuthStore((s) => s.bootstrap);
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  const isBooting = status === 'idle' || status === 'bootstrapping';
  const isAuthenticated = status === 'authenticated';
  const mustChangePassword = isAuthenticated && !!user?.mustChangePassword;
  const isPublic = PUBLIC_PATHS.has(pathname);
  const home = user?.role === 'ADMIN' ? '/dashboard' : '/transactions';
  const forbidden = isAuthenticated && user?.role !== 'ADMIN' && ADMIN_PATHS.has(pathname);

  useEffect(() => {
    if (isBooting) return;
    if (!isAuthenticated && !isPublic) {
      router.replace('/login');
      return;
    }
    if (isAuthenticated && isPublic) {
      router.replace(mustChangePassword ? '/change-password' : home);
      return;
    }
    if (mustChangePassword && pathname !== '/change-password') {
      router.replace('/change-password');
      return;
    }
    if (forbidden) router.replace(home);
  }, [isBooting, isAuthenticated, isPublic, mustChangePassword, pathname, router, home, forbidden]);

  if (isBooting || forbidden) return null;
  if (!isAuthenticated && !isPublic) return null;
  if (isAuthenticated && isPublic) return null;
  if (mustChangePassword && pathname !== '/change-password') return null;

  return <>{children}</>;
}
