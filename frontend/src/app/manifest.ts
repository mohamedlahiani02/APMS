import type { MetadataRoute } from 'next';
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/', name: 'APMS — Gestion Pièces Véhicules', short_name: 'APMS',
    description: 'Achats, ventes, stock et suivi des pièces véhicules SIA',
    lang: 'fr', start_url: '/', scope: '/', display: 'standalone',
    background_color: '#f9fafb', theme_color: '#111827',
    icons: [192, 512].map(size => ({ src: '/pwa-icon/' + size, sizes: size + 'x' + size, type: 'image/png', purpose: 'any' })),
  };
}
