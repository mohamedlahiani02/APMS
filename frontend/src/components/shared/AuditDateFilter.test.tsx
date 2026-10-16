import { useState } from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import AuditDateFilter, {
  type AuditDateMode,
  calendarWeek,
} from "./AuditDateFilter";
afterEach(() => vi.useRealTimers());
function setup() {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-16T12:00:00Z"));
  const changed = vi.fn();
  function Fixture() {
    const [mode, setMode] = useState<AuditDateMode>("range"),
      [dates, setDates] = useState(["", ""]);
    return (
      <AuditDateFilter
        mode={mode}
        from={dates[0]}
        to={dates[1]}
        onModeChange={setMode}
        onChange={(a, b) => {
          setDates([a, b]);
          changed(a, b);
        }}
      />
    );
  }
  render(<Fixture />);
  return changed;
}
describe("audit calendar modes", () => {
  it("filters one full day with identical inclusive boundaries", () => {
    const changed = setup();
    fireEvent.change(screen.getByLabelText("Sélection de dates"), {
      target: { value: "day" },
    });
    fireEvent.change(screen.getByLabelText("Le"), {
      target: { value: "2026-10-05" },
    });
    expect(changed).toHaveBeenLastCalledWith("2026-10-05", "2026-10-05");
    expect(screen.queryByLabelText("Au")).toBeNull();
  });
  it("selects calendar weeks rather than seven sliding days, including Sunday", () => {
    const changed = setup();
    fireEvent.click(screen.getByRole("button", { name: "Cette semaine" }));
    expect(changed).toHaveBeenLastCalledWith("2026-10-12", "2026-10-18");
    fireEvent.change(screen.getByLabelText("Semaine contenant le"), {
      target: { value: "2026-10-04" },
    });
    expect(changed).toHaveBeenLastCalledWith("2026-09-28", "2026-10-04");
    fireEvent.click(screen.getByRole("button", { name: "Semaine précédente" }));
    expect(changed).toHaveBeenLastCalledWith("2026-10-05", "2026-10-11");
  });
  it("allows a custom range and clears only dates", () => {
    const changed = setup();
    fireEvent.change(screen.getByLabelText("Du"), {
      target: { value: "2026-09-01" },
    });
    fireEvent.change(screen.getByLabelText("Au"), {
      target: { value: "2026-10-16" },
    });
    expect(changed).toHaveBeenLastCalledWith("2026-09-01", "2026-10-16");
    fireEvent.click(screen.getByRole("button", { name: "Effacer les dates" }));
    expect(changed).toHaveBeenLastCalledWith("", "");
    expect(screen.getByRole("status").textContent).toContain(
      "Toutes les dates",
    );
  });
  it("handles a calendar week crossing a year boundary", () => {
    expect(calendarWeek("2027-01-01")).toEqual(["2026-12-28", "2027-01-03"]);
  });
});
