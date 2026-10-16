import type { QueryClient } from '@tanstack/react-query';
export function invalidateReference(client: QueryClient, resource: string) {
  for (const key of [resource, 'analytics', 'stock', 'bl-achats', 'ventes']) {
    void client.invalidateQueries({ queryKey: [key] });
  }
  void client.invalidateQueries({ queryKey: ['search-select', resource] });
}
