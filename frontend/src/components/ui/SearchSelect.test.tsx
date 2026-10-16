import { useState } from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import SearchSelect from "./SearchSelect";
const items = [
  { id: "a", name: "Alpha" },
  { id: "b", name: "Beta" },
];
function setup(search = vi.fn().mockResolvedValue(items)) {
  const changed = vi.fn(),
    escape = vi.fn(),
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Fixture() {
    const [value, setValue] = useState("");
    return (
      <div
        onKeyDown={(e) => {
          if (e.key === "Escape") escape();
        }}
      >
        <SearchSelect<(typeof items)[number]>
          label="Magasin"
          value={value}
          onChange={(id) => {
            setValue(id);
            changed(id);
          }}
          onSearch={search}
          queryKey="fixture"
          getId={(r) => r.id}
          getLabel={(r) => r.name}
        />
      </div>
    );
  }
  render(
    <QueryClientProvider client={client}>
      <Fixture />
    </QueryClientProvider>,
  );
  return { user: userEvent.setup(), changed, escape, search };
}
describe("searchable selectors", () => {
  it("selects with the keyboard, clears and keeps Escape inside its popup", async () => {
    const { user, changed, escape } = setup();
    const input = screen.getByRole("combobox");
    await user.click(input);
    await screen.findByRole("option", { name: "Alpha" });
    await user.keyboard("{ArrowDown}{Enter}");
    expect(changed).toHaveBeenLastCalledWith("b");
    expect((input as HTMLInputElement).value).toBe("Beta");
    await user.click(screen.getByRole("button", { name: "Effacer Magasin" }));
    expect(changed).toHaveBeenLastCalledWith("");
    await user.click(input);
    await user.keyboard("{Escape}");
    expect(escape).not.toHaveBeenCalled();
    expect(screen.queryByRole("listbox")).toBeNull();
  });
  it("selects a portal option without losing it to input blur", async () => {
    const { user, changed } = setup();
    await user.click(screen.getByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: "Alpha" }));
    expect(changed).toHaveBeenLastCalledWith("a");
    expect(screen.queryByRole("listbox")).toBeNull();
  });
  it("distinguishes a failed request from an empty result and supports retry", async () => {
    const search = vi
        .fn()
        .mockRejectedValueOnce(new Error("offline"))
        .mockResolvedValue([]),
      { user } = setup(search);
    await user.click(screen.getByRole("combobox"));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.queryByText("Aucun résultat.")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Réessayer" }));
    await waitFor(() =>
      expect(screen.getByText("Aucun résultat.")).toBeTruthy(),
    );
    expect(search).toHaveBeenCalledTimes(2);
  });
});
