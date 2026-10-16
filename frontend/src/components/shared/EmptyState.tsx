import { PackageSearch } from 'lucide-react';

interface EmptyStateProps {
  title?: string;
  description?: string;
}

export default function EmptyState({
  title = 'Aucun résultat',
  description = 'Aucune donnée à afficher.',
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <PackageSearch size={48} className="text-gray-300 mb-4" />
      <p className="text-gray-600 font-medium">{title}</p>
      <p className="text-gray-400 text-sm mt-1">{description}</p>
    </div>
  );
}
