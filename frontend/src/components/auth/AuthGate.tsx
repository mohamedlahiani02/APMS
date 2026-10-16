'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';

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

  useEffect(() => {
    if (isBooting) return;
    if (!isAuthenticated && !isPublic) {
      router.replace('/login');
      return;
    }
    if (isAuthenticated && isPublic) {
      router.replace(mustChangePassword ? '/change-password' : '/dashboard');
      return;
    }
    if (mustChangePassword && pathname !== '/change-password') {
      router.replace('/change-password');
      return;
    }
    if (!mustChangePassword && pathname === '/change-password') {
      router.replace('/dashboard');
    }
  }, [isBooting, isAuthenticated, isPublic, mustChangePassword, pathname, router]);

  if (isBooting) return null;
  if (!isAuthenticated && !isPublic) return null;
  if (isAuthenticated && isPublic) return null;
  if (mustChangePassword && pathname !== '/change-password') return null;

  return <>{children}</>;
}
