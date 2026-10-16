'use client';
import { useState } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import {
  listAudit,
  getEntityHistory,
} from '@/features/audit/services/auditService';
import { listUsers } from '@/features/users/services/userService';
import { formatDateTime } from '@/utils';
import type { AuditEntry } from '@/types';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import ApiErrorBanner from '@/components/shared/ApiErrorBanner';
import LoadingSpinner from '@/components/shared/LoadingSpinner';

function History({ entry }: { entry: AuditEntry }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['audit-history', entry.entityType, entry.entityId],
    queryFn: () => getEntityHistory(entry.entityType, entry.entityId!),
  });
  return (
    <div className="space-y-3">
      <ApiErrorBanner error={error} />
      {isLoading && <LoadingSpinner />}
      {data?.map((r) => (
        <div key={r.id} className="border rounded-lg p-3 text-sm">
          <p className="font-semibold">
            {r.action} — {formatDateTime(r.timestamp)}
          </p>
          <p className="text-gray-500">{r.actorEmail ?? 'Système'}</p>
          <p className="mt-1">{r.summary}</p>
          {r.changes != null && (
            <pre className="mt-2 bg-gray-50 p-3 overflow-auto text-xs">
              {JSON.stringify(r.changes, null, 2)}
            </pre>
          )}
        </div>
      ))}
    </div>
  );
}
export default function AuditPage() {
  const [entityType, setEntityType] = useState('');
  const [actorId, setActorId] = useState('');
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<AuditEntry | null>(null);
  const users = useQuery({
    queryKey: ['users', 'audit-filter'],
    queryFn: () => listUsers({ page: 0, size: 100 }),
  });
  const { data, isLoading, error, isPlaceholderData } = useQuery({
    queryKey: ['audit', page, entityType, actorId],
    queryFn: () =>
      listAudit({
        page,
        size: 20,
        entityType: entityType || undefined,
        actorId: actorId || undefined,
      }),
    placeholderData: keepPreviousData,
  });
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Journal d’audit</h1>
        <p className="text-sm text-gray-500 mt-1">
          Historique des actions et modifications
        </p>
      </div>
      <div className="flex gap-3">
        <select
          aria-label="Type d’entité"
          className="border rounded-lg p-2 bg-white"
          value={entityType}
          onChange={(e) => {
            setEntityType(e.target.value);
            setPage(0);
          }}
        >
          <option value="">Toutes les entités</option>
          {[
            'USER',
            'AUTH',
            'FAMILLE',
            'FOURNISSEUR',
            'MAGASIN',
            'PRODUIT',
            'BL_ACHAT',
            'VENTE',
          ].map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
        <select
          aria-label="Auteur"
          className="border rounded-lg p-2 bg-white"
          value={actorId}
          onChange={(e) => {
            setActorId(e.target.value);
            setPage(0);
          }}
        >
          <option value="">Tous les auteurs</option>
          {users.data?.content.map((u) => (
            <option key={u.id} value={u.id}>
              {u.email}
            </option>
          ))}
        </select>
      </div>
      <ApiErrorBanner error={error || users.error} />
      {isLoading ? (
        <LoadingSpinner />
      ) : (
        <div className="bg-white border rounded-xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                {['Date', 'Auteur', 'Entité', 'Action', 'Résumé', ''].map(
                  (t, i) => (
                    <th key={i} className="text-left p-4">
                      {t}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {data?.content.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="p-4 whitespace-nowrap">
                    {formatDateTime(r.timestamp)}
                  </td>
                  <td className="p-4">{r.actorEmail ?? 'Système'}</td>
                  <td className="p-4">{r.entityType}</td>
                  <td className="p-4">{r.action}</td>
                  <td className="p-4">{r.summary}</td>
                  <td className="p-4">
                    {r.entityId && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setSelected(r)}
                      >
                        Historique
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
              {data?.content.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-gray-500">
                    Aucune action trouvée
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      <div className="flex justify-between text-sm text-gray-500">
        <span>{data?.page.totalElements ?? 0} actions</span>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            disabled={page === 0 || isPlaceholderData}
            onClick={() => setPage((p) => p - 1)}
          >
            Précédent
          </Button>
          <span className="p-2">
            {page + 1} / {Math.max(data?.page.totalPages ?? 1, 1)}
          </span>
          <Button
            variant="secondary"
            disabled={
              isPlaceholderData || page + 1 >= (data?.page.totalPages ?? 0)
            }
            onClick={() => setPage((p) => p + 1)}
          >
            Suivant
          </Button>
        </div>
      </div>
      <Modal
        open={!!selected}
        onClose={() => setSelected(null)}
        title="Historique de l’entité"
        size="lg"
      >
        {selected && <History entry={selected} />}
      </Modal>
    </div>
  );
}
