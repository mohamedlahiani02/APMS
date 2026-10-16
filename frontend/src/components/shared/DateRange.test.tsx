import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import DateRange from "./DateRange";
describe("calendar quick filters", () => {
  it("uses inclusive seven-day and calendar-month ranges and constrains manual dates", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-16T12:00:00Z"));
    try {
      const changed = vi.fn();
      render(
        <DateRange from="2026-10-01" to="2026-10-16" onChange={changed} />,
      );
      fireEvent.click(screen.getByRole("button", { name: "7 jours" }));
      expect(changed).toHaveBeenLastCalledWith("2026-10-10", "2026-10-16");
      fireEvent.click(screen.getByRole("button", { name: "Ce mois" }));
      expect(changed).toHaveBeenLastCalledWith("2026-10-01", "2026-10-16");
      expect(screen.getByLabelText("Du").getAttribute("max")).toBe(
        "2026-10-16",
      );
      expect(screen.getByLabelText("Au").getAttribute("min")).toBe(
        "2026-10-01",
      );
    } finally {
      vi.useRealTimers();
    }
  });
});
