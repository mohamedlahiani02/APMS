"use client";
import Image from "next/image";
import { InstallAppButton } from "@/components/pwa/PwaProvider";

import { LogOut, User, Menu, KeyRound } from "lucide-react";
import { useRouter, usePathname } from "next/navigation";
import { useAuthStore } from "@/store/authStore";
import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";

const PAGE_TITLES: Record<string, string> = {
  "/dashboard": "Tableau de bord",
  "/transactions": "Saisie Transactions",
  "/familles": "Familles",
  "/fournisseurs": "Fournisseurs",
  "/produits": "Produits",
  "/magasins": "Magasins",
  "/bilan": "Bilan Annuel",
  "/utilisateurs": "Utilisateurs",
  "/stock": "Stock disponible",
  "/audit": "Journal d’audit",
};

export default function TopNavigation({
  onMenuToggle,
  menuOpen = false,
}: {
  onMenuToggle?: () => void;
  menuOpen?: boolean;
}) {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const router = useRouter();
  const queryClient = useQueryClient();
  const pathname = usePathname();
  const pageTitle = PAGE_TITLES[pathname] ?? "";

  const handleLogout = async () => {
    await logout();
    queryClient.clear();
    router.replace("/login");
  };

  const fullName =
    [user?.firstName, user?.lastName].filter(Boolean).join(" ") ||
    user?.email ||
    "Utilisateur";

  return (
    <header className="bg-white border-b border-gray-200 px-3 sm:px-6 py-3 flex items-center justify-between gap-3 flex-shrink-0">
      <div className="flex min-w-0 items-center gap-3">
        <button
          className="md:hidden rounded p-2"
          aria-label={
            menuOpen ? "Fermer la navigation" : "Ouvrir la navigation"
          }
          aria-controls="apms-navigation"
          aria-expanded={menuOpen}
          onClick={onMenuToggle}
        >
          <Menu size={20} />
        </button>
        <div className="flex items-center gap-2">
          <Image
            src="/logo-sia.jpg"
            alt="Logo SIA"
            width={447}
            height={437}
            priority
            sizes="40px"
            className="h-10 w-10 flex-shrink-0 object-contain"
          />
          <span className="hidden lg:inline text-sm font-semibold text-gray-800">
            APMS — Gestion Pièces Véhicules
          </span>
        </div>
        <div className="hidden lg:block w-px h-5 bg-gray-300" />
        <span className="truncate text-sm text-gray-500">{pageTitle}</span>
      </div>
      <div className="flex flex-shrink-0 items-center gap-2 sm:gap-4">
        <InstallAppButton />
        <div className="hidden xl:flex items-center gap-2 text-sm text-gray-700">
          <div className="bg-gray-100 rounded-full p-1.5">
            <User size={14} className="text-gray-600" />
          </div>
          <span className="font-medium">{fullName}</span>
        </div>
        <Link
          href="/change-password"
          className="flex items-center gap-1.5 p-1 text-sm text-gray-500 hover:text-gray-900"
        >
          <KeyRound size={16} />
          <span className="sr-only sm:not-sr-only">Mot de passe</span>
        </Link>
        <button
          onClick={handleLogout}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-red-600 transition-colors"
        >
          <LogOut size={14} />
          <span className="sr-only sm:not-sr-only">Déconnexion</span>
        </button>
      </div>
    </header>
  );
}
