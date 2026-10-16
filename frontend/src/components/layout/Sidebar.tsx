'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ClipboardList,
  Layers,
  Users,
  Package,
  Warehouse,
  LayoutDashboard,
  BarChart2,
  UserCog,
  ScrollText,
} from 'lucide-react';
import { cn } from '@/utils';
import { useAuthStore } from '@/store/authStore';

const ADMIN_MENU = [
  {
    section: 'SAISIE',
    items: [{ href: '/transactions', label: 'Saisie Transactions', icon: ClipboardList }],
  },
  {
    section: 'RÉFÉRENTIEL',
    items: [
      { href: '/familles', label: 'Familles', icon: Layers },
      { href: '/fournisseurs', label: 'Fournisseurs', icon: Users },
      { href: '/produits', label: 'Produits', icon: Package },
      { href: '/magasins', label: 'Magasins', icon: Warehouse },
    ],
  },
  {
    section: 'ANALYTIQUE',
    items: [
      { href: '/dashboard', label: 'Dashboard KPI', icon: LayoutDashboard },
      { href: '/bilan', label: 'Bilan Annuel', icon: BarChart2 },
      { href: '/stock', label: 'Stock disponible', icon: Package },
    ],
  },
  {
    section: 'ADMINISTRATION',
    items: [
      { href: '/utilisateurs', label: 'Utilisateurs', icon: UserCog },
      { href: '/audit', label: 'Journal d’audit', icon: ScrollText },
    ],
  },
];

const SECRETAIRE_MENU = ADMIN_MENU.filter((group) => ['SAISIE', 'RÉFÉRENTIEL'].includes(group.section));

export default function Sidebar() {
  const pathname = usePathname();
  const user = useAuthStore((s) => s.user);
  const menu = user?.role === 'ADMIN' ? ADMIN_MENU : SECRETAIRE_MENU;

  return (
    <aside className="w-56 bg-white border-r border-gray-200 flex flex-col h-full flex-shrink-0">
      <nav className="flex-1 overflow-y-auto py-4 px-3 flex flex-col gap-4">
        {menu.map((group) => (
          <div key={group.section}>
            <p className="text-gray-400 text-[10px] font-semibold uppercase tracking-widest px-2 mb-1">
              {group.section}
            </p>
            <div className="flex flex-col gap-0.5">
              {group.items.map((item) => {
                const Icon = item.icon;
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
                      isActive
                        ? 'bg-gray-100 text-gray-900 font-semibold'
                        : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                    )}
                  >
                    <Icon size={16} />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
    </aside>
  );
}
