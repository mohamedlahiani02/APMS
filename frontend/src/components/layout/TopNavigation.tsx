'use client';

import { LogOut, User, Wrench } from 'lucide-react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';

const PAGE_TITLES: Record<string, string> = {
  '/dashboard': 'Dashboard KPI',
  '/transactions': 'Saisie Transactions',
  '/familles': 'Familles',
  '/fournisseurs': 'Fournisseurs',
  '/produits': 'Produits',
  '/magasins': 'Magasins',
  '/bilan': 'Bilan Annuel',
  '/utilisateurs': 'Utilisateurs',
  '/stock': 'Stock disponible',
  '/audit': 'Journal d’audit',
};

export default function TopNavigation() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const router = useRouter();
  const queryClient = useQueryClient();
  const pathname = usePathname();
  const pageTitle = PAGE_TITLES[pathname] ?? '';

  const handleLogout = async () => {
    await logout();
    queryClient.clear();
    router.replace('/login');
  };

  const fullName = [user?.firstName, user?.lastName].filter(Boolean).join(' ') || user?.email || 'Utilisateur';

  return (
    <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between flex-shrink-0">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-gray-900 flex items-center justify-center flex-shrink-0">
            <Wrench size={16} className="text-white" />
          </div>
          <span className="text-sm font-semibold text-gray-800">APMS — Gestion Pièces Véhicules</span>
        </div>
        <div className="w-px h-5 bg-gray-300" />
        <span className="text-sm text-gray-500">{pageTitle}</span>
      </div>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 text-sm text-gray-700">
          <div className="bg-gray-100 rounded-full p-1.5">
            <User size={14} className="text-gray-600" />
          </div>
          <span className="font-medium">{fullName}</span>
        </div>
        <Link href="/change-password" className="text-sm text-gray-500 hover:text-gray-900">Mot de passe</Link>
        <button
          onClick={handleLogout}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-red-600 transition-colors"
        >
          <LogOut size={14} />
          Déconnexion
        </button>
      </div>
    </header>
  );
}
