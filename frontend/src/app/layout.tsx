import type { Metadata, Viewport } from 'next';
import PwaProvider from '@/components/pwa/PwaProvider';
import './globals.css';
import Providers from './providers';

export const viewport: Viewport = { themeColor: '#111827' };

export const metadata: Metadata = {
  applicationName: 'APMS',
  appleWebApp: { capable: true, title: 'APMS', statusBarStyle: 'default' },
  icons: { icon: '/icons/sia-192.png', apple: '/icons/sia-180.png' },
  title: 'APMS — Gestion Pièces Véhicules',
  description: 'Système de gestion des pièces de rechange auto (achats, ventes, stock, analytique)',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className="h-full">
      <body className="h-full bg-gray-50">
        <PwaProvider><Providers>{children}</Providers></PwaProvider>
      </body>
    </html>
  );
}
