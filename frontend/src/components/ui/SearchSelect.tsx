'use client';

import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { useEffect, useState, useId } from 'react';

/**
 * Searchable async combobox backed by a `/{resource}/lookup?q=` endpoint — per
 * API_CONTRACT.md, référentiel pickers must search the server (debounced),
 * never filter a client-held page.
 */
export default function SearchSelect<T>({
  value,
  onChange,
  onSearch,
  getId,
  getLabel,
  initialLabel,
  label,
  placeholder = 'Rechercher...',
  error,
  disabled,
  queryKey,
}: {
  value: string;
  onChange: (id: string, item?: T) => void;
  onSearch: (q: string | undefined) => Promise<T[]>;
  getId: (item: T) => string;
  getLabel: (item: T) => string;
  /** Pre-filled label to show before the user has typed anything (edit mode). */
  initialLabel?: string;
  label?: string;
  placeholder?: string;
  error?: string;
  disabled?: boolean;
  queryKey: string;
}) {
  const inputId = useId();
  const [chosen, setChosen] = useState<{ id: string; label: string } | null>(null);
  const [term, setTerm] = useState('');
  const [open, setOpen] = useState(false);
  const [debounced, setDebounced] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setDebounced(term), 250);
    return () => clearTimeout(t);
  }, [term]);

  const { data: results = [], isFetching } = useQuery({
    queryKey: ['search-select', queryKey, debounced],
    queryFn: () => onSearch(debounced || undefined),
    staleTime: 30_000,
    enabled: open,
  });

  const selected = results.find((r) => getId(r) === value);
  const displayValue = term || (selected ? getLabel(selected) : value ? (chosen?.id === value ? chosen.label : initialLabel ?? '') : '');

  return (
    <div className="relative flex flex-col gap-1">
      {label && <label htmlFor={inputId} className="text-sm font-medium text-gray-700">{label}</label>}
      <div className="relative">
        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          id={inputId}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={inputId + "-options"}
          autoComplete="off"
          disabled={disabled}
          placeholder={placeholder}
          className="w-full rounded-lg border border-gray-300 bg-gray-50 pl-8 pr-2 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:bg-white disabled:opacity-60"
          value={displayValue}
          onChange={(e) => {
            setTerm(e.target.value);
            setOpen(true);
            if (value) onChange('');
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
        />
      </div>
      {open && !disabled && (
        <div id={inputId + "-options"} role="listbox" className="absolute z-20 top-full mt-1 w-full max-h-56 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg">
          {isFetching ? (
            <div className="px-3 py-2 text-xs text-gray-400">Recherche...</div>
          ) : results.length === 0 ? (
            <div className="px-3 py-2 text-xs text-gray-400">Aucun résultat.</div>
          ) : (
            results.map((item) => (
              <button
                type="button"
                key={getId(item)}
                className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 text-gray-900"
                onMouseDown={(e) => {
                  e.preventDefault();
                  setChosen({ id: getId(item), label: getLabel(item) });
                  onChange(getId(item), item);
                  setTerm('');
                  setOpen(false);
                }}
              >
                {getLabel(item)}
              </button>
            ))
          )}
        </div>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
