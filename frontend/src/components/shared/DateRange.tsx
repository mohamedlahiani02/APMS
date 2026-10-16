"use client";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import { todayISO } from "@/utils";
export default function DateRange({
  from,
  to,
  onChange,
}: {
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
}) {
  const today = todayISO();
  const start = (days: number) => {
    const date = new Date(today + "T12:00:00Z");
    date.setUTCDate(date.getUTCDate() - days);
    return date.toISOString().slice(0, 10);
  };
  return (
    <div className="flex flex-wrap items-end gap-2">
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
      <div className="flex flex-wrap gap-1 pb-0.5">
        {[
          { label: "Aujourd’hui", from: today },
          { label: "7 jours", from: start(6) },
          { label: "30 jours", from: start(29) },
          { label: "Ce mois", from: today.slice(0, 8) + "01" },
        ].map((p) => (
          <Button
            key={p.label}
            size="sm"
            variant={from === p.from && to === today ? "primary" : "secondary"}
            onClick={() => onChange(p.from, today)}
          >
            {p.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
