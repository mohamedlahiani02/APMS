"use client";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import Button from "@/components/ui/Button";
import { todayISO, formatDate } from "@/utils";

export type AuditDateMode = "range" | "day" | "week";
export function calendarWeek(value: string): [string, string] {
  const day = new Date(value + "T12:00:00Z");
  const offset = (day.getUTCDay() + 6) % 7;
  day.setUTCDate(day.getUTCDate() - offset);
  const from = day.toISOString().slice(0, 10);
  day.setUTCDate(day.getUTCDate() + 6);
  return [from, day.toISOString().slice(0, 10)];
}
export default function AuditDateFilter({
  mode,
  from,
  to,
  onModeChange,
  onChange,
}: {
  mode: AuditDateMode;
  from: string;
  to: string;
  onModeChange: (mode: AuditDateMode) => void;
  onChange: (from: string, to: string) => void;
}) {
  const today = todayISO();
  const previous = new Date(today + "T12:00:00Z");
  previous.setUTCDate(previous.getUTCDate() - 1);
  const yesterday = previous.toISOString().slice(0, 10);
  const lastWeek = new Date(today + "T12:00:00Z");
  lastWeek.setUTCDate(lastWeek.getUTCDate() - 7);
  const presets: [string, AuditDateMode, string, string][] = [
    ["Aujourd’hui", "day", today, today],
    ["Hier", "day", yesterday, yesterday],
    ["Cette semaine", "week", ...calendarWeek(today)],
    [
      "Semaine précédente",
      "week",
      ...calendarWeek(lastWeek.toISOString().slice(0, 10)),
    ],
    ["Ce mois", "range", today.slice(0, 8) + "01", today],
  ];
  const setMode = (next: AuditDateMode) => {
    onModeChange(next);
    if (next === "day") {
      const value = from || to || today;
      onChange(value, value);
    } else if (next === "week") onChange(...calendarWeek(from || to || today));
  };
  return (
    <fieldset className="min-w-0 rounded-xl border border-gray-200 bg-white p-4 space-y-3">
      <legend className="px-1 text-sm font-semibold text-gray-700">
        Date des actions
      </legend>
      <div className="flex flex-wrap items-end gap-3">
        <Select
          label="Sélection de dates"
          value={mode}
          onChange={(e) => setMode(e.target.value as AuditDateMode)}
          options={[
            { value: "range", label: "De… à…" },
            { value: "day", label: "Le… — jour précis" },
            { value: "week", label: "Par semaine — lundi à dimanche" },
          ]}
        />
        {mode === "range" ? (
          <>
            <Input
              label="Du"
              type="date"
              value={from}
              max={to || undefined}
              onChange={(e) => onChange(e.target.value, to)}
            />
            <Input
              label="Au"
              type="date"
              value={to}
              min={from || undefined}
              onChange={(e) => onChange(from, e.target.value)}
            />
          </>
        ) : mode === "day" ? (
          <Input
            label="Le"
            type="date"
            value={from}
            onChange={(e) => onChange(e.target.value, e.target.value)}
          />
        ) : (
          <Input
            label="Semaine contenant le"
            type="date"
            value={from}
            onChange={(e) =>
              onChange(
                ...(e.target.value
                  ? calendarWeek(e.target.value)
                  : (["", ""] as [string, string])),
              )
            }
          />
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {presets.map(([label, next, a, b]) => (
          <Button
            key={label}
            type="button"
            size="sm"
            variant={from === a && to === b ? "primary" : "secondary"}
            aria-pressed={from === a && to === b}
            onClick={() => {
              onModeChange(next);
              onChange(a, b);
            }}
          >
            {label}
          </Button>
        ))}
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => {
            onModeChange("range");
            onChange("", "");
          }}
        >
          Effacer les dates
        </Button>
      </div>
      <p className="text-xs text-gray-500" role="status">
        {from && to
          ? (from === to
              ? "Le " + formatDate(from)
              : "Du " + formatDate(from) + " au " + formatDate(to)) +
            " inclus · heure de Tunis"
          : from
            ? "À partir du " + formatDate(from) + " · heure de Tunis"
            : to
              ? "Jusqu’au " + formatDate(to) + " inclus · heure de Tunis"
              : "Toutes les dates · heure de Tunis"}
      </p>
    </fieldset>
  );
}
