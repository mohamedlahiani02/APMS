"use client";
import { X } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { cn } from "@/utils";

const focusable =
  'button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex="0"]';
export default function Modal({
  open,
  onClose,
  title,
  children,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
}) {
  const root = useRef<HTMLDivElement>(null),
    dirty = useRef(false);
  const [discard, setDiscard] = useState(false);
  const titleId = useId();
  useEffect(() => {
    if (!open) return;
    dirty.current = false;
    const previous = document.activeElement as HTMLElement | null;
    const dialog = root.current;
    const markDirty = (event: Event) => {
      if ((event.target as HTMLElement).closest("form[data-guard-form]"))
        dirty.current = true;
    };
    dialog?.addEventListener("apms:form-change", markDirty);
    const frame = requestAnimationFrame(() => {
      (
        (dialog?.querySelector(
          "form[data-guard-form] input,form[data-guard-form] select",
        ) ?? dialog?.querySelector(focusable)) as HTMLElement | null
      )?.focus();
    });
    const unload = (event: BeforeUnloadEvent) => {
      if (dirty.current) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", unload);
    return () => {
      cancelAnimationFrame(frame);
      dialog?.removeEventListener("apms:form-change", markDirty);
      window.removeEventListener("beforeunload", unload);
      previous?.focus();
    };
  }, [open]);
  const requestClose = () => {
    if (dirty.current) setDiscard(true);
    else {
      setDiscard(false);
      onClose();
    }
  };
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
      <div
        className="absolute inset-0 bg-black/50"
        aria-hidden="true"
        onClick={requestClose}
      />
      <div
        ref={root}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onInputCapture={(e) => {
          if ((e.target as HTMLElement).closest("form[data-guard-form]"))
            dirty.current = true;
        }}
        onChangeCapture={(e) => {
          if ((e.target as HTMLElement).closest("form[data-guard-form]"))
            dirty.current = true;
        }}
        onClickCapture={(e) => {
          const button = (e.target as HTMLElement).closest("button");
          if (
            button &&
            ["Annuler", "Fermer"].includes(button.textContent?.trim() ?? "") &&
            !discard
          ) {
            e.preventDefault();
            e.stopPropagation();
            requestClose();
            return;
          }
          if (
            button?.type === "button" &&
            button.closest("form[data-guard-form]") &&
            !button.closest('[role="combobox"]')
          )
            dirty.current = true;
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            if (discard) {
              setDiscard(false);
              requestAnimationFrame(() => root.current?.focus());
            } else requestClose();
          }
          if (e.key === "Tab") {
            const active =
              root.current?.querySelector('[role="alertdialog"]') ??
              root.current;
            const elements = Array.from(
              active?.querySelectorAll<HTMLElement>(focusable) ?? [],
            ).filter((el) => el.offsetParent !== null);
            const first = elements[0],
              last = elements[elements.length - 1];
            if (!first) {
              e.preventDefault();
              root.current?.focus();
            } else if (
              e.shiftKey &&
              (document.activeElement === first ||
                document.activeElement === root.current)
            ) {
              e.preventDefault();
              last?.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
              e.preventDefault();
              first.focus();
            }
          }
        }}
        className={cn(
          "relative bg-white rounded-xl shadow-2xl w-full flex flex-col max-h-[92vh]",
          {
            "max-w-sm": size === "sm",
            "max-w-lg": size === "md",
            "max-w-2xl": size === "lg",
            "max-w-4xl": size === "xl",
          },
        )}
      >
        <div
          inert={discard}
          className="flex items-center justify-between gap-3 px-5 py-4 border-b"
        >
          <h2 id={titleId} className="text-lg font-semibold">
            {title}
          </h2>
          <button
            type="button"
            aria-label="Fermer la fenêtre"
            onClick={requestClose}
            className="rounded-lg p-2 hover:bg-gray-100"
          >
            <X size={20} />
          </button>
        </div>
        <div inert={discard} className="overflow-y-auto flex-1 px-5 py-4">
          {children}
        </div>
        {discard && (
          <div
            role="alertdialog"
            aria-modal="true"
            aria-label="Modifications non enregistrées"
            className="absolute inset-0 z-10 flex items-center justify-center bg-white/95 rounded-xl p-6"
          >
            <div className="max-w-sm space-y-4">
              <h3 className="font-semibold text-lg">
                Abandonner les modifications ?
              </h3>
              <p className="text-sm text-gray-600">
                Votre saisie n’a pas été enregistrée.
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  ref={(node) => node?.focus()}
                  className="rounded-lg border px-4 py-2"
                  onClick={() => {
                    setDiscard(false);
                    requestAnimationFrame(() => root.current?.focus());
                  }}
                >
                  Continuer la saisie
                </button>
                <button
                  type="button"
                  className="rounded-lg bg-red-600 text-white px-4 py-2"
                  onClick={() => {
                    dirty.current = false;
                    setDiscard(false);
                    onClose();
                  }}
                >
                  Abandonner
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
