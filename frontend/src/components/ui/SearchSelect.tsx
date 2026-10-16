"use client";
import { useQuery } from "@tanstack/react-query";
import { Search, X } from "lucide-react";
import {
  useEffect,
  useLayoutEffect,
  useState,
  useId,
  useRef,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";

export default function SearchSelect<T>({
  value,
  onChange,
  onSearch,
  getId,
  getLabel,
  initialLabel,
  label,
  placeholder = "Rechercher…",
  error,
  disabled,
  queryKey,
}: {
  value: string;
  onChange: (id: string, item?: T) => void;
  onSearch: (q: string | undefined) => Promise<T[]>;
  getId: (r: T) => string;
  getLabel: (r: T) => string;
  initialLabel?: string;
  label?: string;
  placeholder?: string;
  error?: string;
  disabled?: boolean;
  queryKey: string;
}) {
  const id = useId(),
    input = useRef<HTMLInputElement>(null);
  const [term, setTerm] = useState(""),
    [open, setOpen] = useState(false),
    [debounced, setDebounced] = useState(""),
    [active, setActive] = useState(0);
  const [chosen, setChosen] = useState<{ id: string; label: string } | null>(
    null,
  );
  const [position, setPosition] = useState<CSSProperties>({});
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(term), 250);
    return () => clearTimeout(timer);
  }, [term]);
  useLayoutEffect(() => {
    if (!open) return;
    const update = () => {
      const rect = input.current?.getBoundingClientRect();
      if (!rect) return;
      const below = window.innerHeight - rect.bottom,
        above = rect.top,
        up = below < 180 && above > below;
      setPosition({
        position: "fixed",
        left: Math.max(
          8,
          Math.min(rect.left, window.innerWidth - rect.width - 8),
        ),
        width: Math.min(rect.width, window.innerWidth - 16),
        ...(up
          ? { bottom: window.innerHeight - rect.top + 4 }
          : { top: rect.bottom + 4 }),
        maxHeight: Math.max(80, Math.min(260, (up ? above : below) - 12)),
      });
    };
    const frame = requestAnimationFrame(update);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open]);
  const query = useQuery({
    queryKey: ["search-select", queryKey, debounced],
    queryFn: () => onSearch(debounced || undefined),
    staleTime: 30000,
    enabled: open,
  });
  const results = query.data ?? [],
    selected = results.find((r) => getId(r) === value);
  const selectedLabel =
    chosen?.id === value
      ? chosen.label
      : selected
        ? getLabel(selected)
        : (initialLabel ?? "");
  const notify = () =>
    input.current?.dispatchEvent(
      new CustomEvent("apms:form-change", { bubbles: true }),
    );
  const choose = (item: T) => {
    setChosen({ id: getId(item), label: getLabel(item) });
    onChange(getId(item), item);
    setTerm("");
    setOpen(false);
    notify();
    input.current?.focus();
  };
  const index = Math.min(active, results.length - 1);
  useEffect(() => {
    if (open)
      document
        .getElementById(id + "-option-" + index)
        ?.scrollIntoView?.({ block: "nearest" });
  }, [open, index, id]);
  const popup =
    open && !disabled ? (
      <div
        id={id + "-list"}
        role="listbox"
        aria-label={label ?? placeholder}
        className="z-[80] overflow-auto rounded-lg border border-gray-200 bg-white shadow-xl"
        style={position}
      >
        {query.isError ? (
          <div role="alert" className="p-3 text-sm text-red-700">
            Recherche indisponible.{" "}
            <button
              type="button"
              onPointerDown={(e) => e.preventDefault()}
              onClick={() => query.refetch()}
              className="underline"
            >
              Réessayer
            </button>
          </div>
        ) : query.isFetching || term !== debounced ? (
          <div role="status" className="p-3 text-sm text-gray-500">
            Recherche…
          </div>
        ) : results.length === 0 ? (
          <div role="status" className="p-3 text-sm text-gray-500">
            Aucun résultat.
          </div>
        ) : (
          results.map((item, i) => (
            <div
              key={getId(item)}
              id={id + "-option-" + i}
              role="option"
              aria-selected={getId(item) === value}
              className={
                "cursor-pointer px-3 py-2.5 text-sm " +
                (i === index ? "bg-gray-100 text-gray-950" : "text-gray-700")
              }
              onPointerDown={(e) => e.preventDefault()}
              onPointerMove={() => setActive(i)}
              onClick={() => choose(item)}
            >
              {getLabel(item)}
            </div>
          ))
        )}
        {results.length > 0 && !query.isError && (
          <div className="border-t px-3 py-2 text-xs text-gray-500">
            Affinez la recherche si nécessaire.
          </div>
        )}
      </div>
    ) : null;
  return (
    <div className="min-w-0 flex flex-col gap-1">
      {label && (
        <label htmlFor={id} className="text-sm font-medium text-gray-700">
          {label}
        </label>
      )}
      <div className="relative">
        <Search
          size={14}
          className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400"
        />
        <input
          ref={input}
          id={id}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={open ? id + "-list" : undefined}
          aria-activedescendant={
            open &&
            index >= 0 &&
            !query.isFetching &&
            !query.isError &&
            term === debounced
              ? id + "-option-" + index
              : undefined
          }
          aria-label={label ? undefined : placeholder}
          aria-invalid={!!error}
          aria-describedby={error ? id + "-error" : undefined}
          autoComplete="off"
          disabled={disabled}
          placeholder={placeholder}
          value={open ? term : value ? selectedLabel : term}
          className="w-full rounded-lg border border-gray-300 bg-white pl-8 pr-9 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 disabled:opacity-60"
          onChange={(e) => {
            setTerm(e.target.value);
            setOpen(true);
            setActive(0);
            if (value) onChange("");
          }}
          onClick={() => setOpen(true)}
          onFocus={() => {
            setOpen(true);
            setActive(0);
          }}
          onBlur={() => setOpen(false)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              setOpen(true);
              setActive((i) =>
                e.key === "ArrowDown"
                  ? Math.min(i + 1, Math.max(0, results.length - 1))
                  : Math.max(0, i - 1),
              );
            }
            if (e.key === "Enter" && open) {
              e.preventDefault();
              if (query.isError) void query.refetch();
              else if (
                !query.isFetching &&
                term === debounced &&
                results[index]
              )
                choose(results[index]);
            }
            if (e.key === "Escape" && open) {
              e.preventDefault();
              e.stopPropagation();
              setOpen(false);
              setTerm("");
            }
          }}
        />
        {(value || term) && !disabled && (
          <button
            type="button"
            aria-label={"Effacer " + (label ?? "la sélection")}
            className="absolute right-1 top-1/2 -translate-y-1/2 rounded p-1.5 text-gray-500 hover:bg-gray-100"
            onPointerDown={(e) => e.preventDefault()}
            onClick={() => {
              onChange("");
              setChosen(null);
              setTerm("");
              setOpen(false);
              notify();
            }}
          >
            <X size={14} />
          </button>
        )}
      </div>
      {open &&
        typeof document !== "undefined" &&
        createPortal(popup, document.body)}
      {error && (
        <p id={id + "-error"} className="text-xs text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
