'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AuthSession, RefreshResponse } from '@/types';
import * as authService from '@/features/auth/services/authService';

type Status = 'idle' | 'bootstrapping' | 'authenticated' | 'unauthenticated';

interface AuthState {
  status: Status;
  accessToken: string | null;
  refreshToken: string | null;
  user: AuthSession['user'] | null;
  bootstrap: () => void;
  setSession: (data: AuthSession) => void;
  markPasswordChanged: () => void;
  refreshNow: () => Promise<string>;
  clear: () => void;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      status: 'idle',
      accessToken: null,
      refreshToken: null,
      user: null,

      // Persisted state is rehydrated synchronously by zustand/persist before
      // this ever runs; we just need to flip 'idle' -> a terminal status once
      // on mount so AuthGate can decide whether to render.
      bootstrap: () => {
        if (get().status !== 'idle') return;
        const { accessToken, refreshToken, user } = get();
        set({ status: accessToken && refreshToken && user ? 'authenticated' : 'unauthenticated' });
      },

      setSession: (data) => {
        set({
          accessToken: data.accessToken,
          refreshToken: data.refreshToken,
          user: data.user,
          status: 'authenticated',
        });
      },

      markPasswordChanged: () => {
        const u = get().user;
        if (u) set({ user: { ...u, mustChangePassword: false } });
      },

      refreshNow: async () => {
        const rt = get().refreshToken;
        if (!rt) throw new Error('No refresh token');
        const refreshed: RefreshResponse = await authService.refresh(rt);
        set({
          accessToken: refreshed.accessToken,
          refreshToken: refreshed.refreshToken,
          user: refreshed.user,
          status: 'authenticated',
        });
        return refreshed.accessToken;
      },

      clear: () => {
        set({ status: 'unauthenticated', accessToken: null, refreshToken: null, user: null });
      },

      logout: async () => {
        const rt = get().refreshToken;
        if (rt) {
          try {
            await authService.logout(rt);
          } catch {
            // best-effort — clear local session regardless
          }
        }
        get().clear();
      },
    }),
    {
      name: 'apms-auth',
      partialize: (s) => ({
        accessToken: s.accessToken,
        refreshToken: s.refreshToken,
        user: s.user,
      }),
    }
  )
);
