"use client";
import {
  Fragment,
  useMemo,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from "react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import ApiErrorBanner from "./ApiErrorBanner";

export interface Column<T> {
  key: string;
  label: string;
  render: (row: T) => ReactNode;
  sortValue?: (row: T) => string | number | null;
  sortable?: boolean;
  numeric?: boolean;
}
export interface TableState {
  page: number;
  size: number;
  sortBy: string;
  sortDirection: "asc" | "desc";
}
export function useTableState(
  sortBy: string,
  sortDirection: "asc" | "desc" = "asc",
) {
  const [state, setState] = useState<TableState>({
    page: 0,
    size: 10,
    sortBy,
    sortDirection,
  });
  const setPage = useCallback(
    (page: number) => setState((s) => ({ ...s, page })),
    [],
  );
  const setSize = useCallback(
    (size: number) => setState((s) => ({ ...s, size, page: 0 })),
    [],
  );
  const resetPage = useCallback(
    () => setState((s) => (s.page === 0 ? s : { ...s, page: 0 })),
    [],
  );
  const onSort = useCallback(
    (key: string) =>
      setState((s) => ({
        ...s,
        page: 0,
        sortBy: key,
        sortDirection:
          s.sortBy === key && s.sortDirection === "asc" ? "desc" : "asc",
      })),
    [],
  );
  return { ...state, setPage, setSize, resetPage, onSort };
}
export function Pagination({
  page,
  size,
  total,
  onPage,
  onSize,
  disabled = false,
}: {
  page: number;
  size: number;
  total: number;
  onPage: (p: number) => void;
  onSize: (s: number) => void;
  disabled?: boolean;
}) {
  const pages = Math.max(1, Math.ceil(total / size));
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t bg-white px-4 py-3 text-sm text-gray-600">
      <span aria-live="polite">
        {total === 0 ? 0 : page * size + 1}–{Math.min((page + 1) * size, total)}{" "}
        sur {total}
      </span>
      <label className="flex items-center gap-2">
        Lignes par page
        <select
          aria-label="Lignes par page"
          value={size}
          disabled={disabled}
          onChange={(e) => onSize(Number(e.target.value))}
          className="rounded-md border px-2 py-1.5 bg-white"
        >
          {[10, 20, 50].map((n) => (
            <option key={n}>{n}</option>
          ))}
        </select>
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="secondary"
          aria-label="Première page"
          disabled={disabled || page === 0}
          onClick={() => onPage(0)}
        >
          «
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={disabled || page === 0}
          onClick={() => onPage(page - 1)}
        >
          Précédent
        </Button>
        <form
          key={page + "-" + pages}
          className="flex items-center gap-1"
          onSubmit={(e) => {
            e.preventDefault();
            const value = Number(new FormData(e.currentTarget).get("page"));
            if (Number.isFinite(value))
              onPage(Math.max(0, Math.min(pages - 1, value - 1)));
          }}
        >
          <label className="flex items-center gap-1">
            Page
            <input
              aria-label="Aller à la page"
              name="page"
              type="number"
              min={1}
              max={pages}
              defaultValue={Math.min(page + 1, pages)}
              disabled={disabled}
              className="w-16 rounded-md border px-2 py-1.5"
            />
            /{pages}
          </label>
          <button
            disabled={disabled}
            className="rounded-md px-2 py-1.5 text-gray-800 underline"
          >
            Aller
          </button>
        </form>
        <Button
          size="sm"
          variant="secondary"
          disabled={disabled || page + 1 >= pages}
          onClick={() => onPage(page + 1)}
        >
          Suivant
        </Button>
        <Button
          size="sm"
          variant="secondary"
          aria-label="Dernière page"
          disabled={disabled || page + 1 >= pages}
          onClick={() => onPage(pages - 1)}
        >
          »
        </Button>
      </div>
    </div>
  );
}
export function DataTable<T>({
  label,
  rows,
  columns,
  rowKey,
  total,
  state,
  loading = false,
  busy = false,
  error,
  detail,
}: {
  label: string;
  rows: T[];
  columns: Column<T>[];
  rowKey: (r: T) => string;
  total: number;
  state: TableState & {
    setPage: (p: number) => void;
    setSize: (s: number) => void;
    onSort: (s: string) => void;
  };
  loading?: boolean;
  busy?: boolean;
  error?: unknown;
  detail?: (r: T) => ReactNode;
}) {
  const { page, size, setPage } = state;
  const lastPage = Math.max(0, Math.ceil(total / size) - 1);
  useEffect(() => {
    if (!loading && !busy && !error && page > lastPage) setPage(lastPage);
  }, [loading, busy, error, page, setPage, lastPage]);
  return (
    <section
      className="rounded-xl border border-gray-200 bg-white overflow-hidden"
      aria-label={label}
      aria-busy={busy || loading}
    >
      <ApiErrorBanner error={error} />
      <div
        className="max-h-[65vh] overflow-auto"
        tabIndex={0}
        aria-label={label + " — tableau défilant"}
      >
        <table className="w-full min-w-[560px] text-sm">
          <caption className="sr-only">{label}</caption>
          <thead className="sticky top-0 z-10 bg-gray-50 text-gray-600">
            <tr>
              {columns.map((c) => (
                <th
                  key={c.key}
                  className={
                    "px-4 py-3 font-semibold " +
                    (c.numeric ? "text-right" : "text-left")
                  }
                  aria-sort={
                    state.sortBy === c.key
                      ? state.sortDirection === "asc"
                        ? "ascending"
                        : "descending"
                      : undefined
                  }
                >
                  {c.sortable ? (
                    <button
                      className="inline-flex items-center gap-2 whitespace-nowrap rounded focus-visible:outline-2 focus-visible:outline-gray-900"
                      onClick={() => state.onSort(c.key)}
                      aria-label={"Trier par " + c.label}
                    >
                      {c.label}
                      <span aria-hidden="true">
                        {state.sortBy === c.key
                          ? state.sortDirection === "asc"
                            ? "↑"
                            : "↓"
                          : "↕"}
                      </span>
                    </button>
                  ) : (
                    c.label
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className={busy ? "opacity-60 pointer-events-none" : ""}>
            {loading ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="p-8 text-center text-gray-500"
                  role="status"
                >
                  Chargement…
                </td>
              </tr>
            ) : error ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="p-8 text-center text-gray-500"
                >
                  Les données n’ont pas pu être chargées.
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="p-8 text-center text-gray-500"
                >
                  Aucun résultat pour ces critères.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <Fragment key={rowKey(r)}>
                  <tr className="border-t hover:bg-gray-50">
                    {columns.map((c) => (
                      <td
                        key={c.key}
                        className={
                          "px-4 py-3 " +
                          (c.numeric
                            ? "text-right tabular-nums whitespace-nowrap"
                            : "text-left")
                        }
                      >
                        {c.render(r)}
                      </td>
                    ))}
                  </tr>
                  {detail?.(r) && (
                    <tr>
                      <td
                        colSpan={columns.length}
                        className="border-t bg-gray-50 p-4"
                      >
                        {detail(r)}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))
            )}
          </tbody>
        </table>
      </div>
      <Pagination
        page={state.page}
        size={state.size}
        total={total}
        onPage={state.setPage}
        onSize={state.setSize}
        disabled={busy || loading}
      />
    </section>
  );
}
export function ClientTable<T>({
  label,
  rows,
  columns,
  rowKey,
  searchText,
  detail,
}: {
  label: string;
  rows: T[];
  columns: Column<T>[];
  rowKey: (r: T) => string;
  searchText: (r: T) => string;
  detail?: (r: T) => ReactNode;
}) {
  const state = useTableState(columns.find((c) => c.sortValue)?.key ?? "");
  const [search, setSearch] = useState("");
  const filtered = useMemo(() => {
    const term = search.toLocaleLowerCase("fr");
    const result = rows.filter((r) =>
      searchText(r).toLocaleLowerCase("fr").includes(term),
    );
    const col = columns.find((c) => c.key === state.sortBy);
    return col?.sortValue
      ? result.sort((a, b) => {
          const x = col.sortValue!(a),
            y = col.sortValue!(b);
          const cmp =
            typeof x === "number" && typeof y === "number"
              ? x - y
              : String(x ?? "").localeCompare(String(y ?? ""), "fr", {
                  numeric: true,
                });
          return state.sortDirection === "asc" ? cmp : -cmp;
        })
      : result;
  }, [rows, search, searchText, columns, state.sortBy, state.sortDirection]);
  const page = Math.min(
    state.page,
    Math.max(0, Math.ceil(filtered.length / state.size) - 1),
  );
  return (
    <div className="space-y-3">
      <Input
        aria-label={"Rechercher dans " + label}
        placeholder="Rechercher dans ce tableau…"
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          state.resetPage();
        }}
      />
      <DataTable
        label={label}
        rows={filtered.slice(page * state.size, (page + 1) * state.size)}
        columns={columns.map((c) => ({ ...c, sortable: !!c.sortValue }))}
        rowKey={rowKey}
        total={filtered.length}
        state={{ ...state, page }}
        detail={detail}
      />
    </div>
  );
}
