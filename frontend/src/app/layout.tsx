import type { Metadata } from 'next';
import './globals.css';
import Providers from './providers';

export const metadata: Metadata = {
  title: 'APMS — Gestion Pièces Véhicules',
  description: 'Système de gestion des pièces de rechange auto (achats, ventes, stock, analytique)',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className="h-full">
      <body className="h-full bg-gray-50">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
