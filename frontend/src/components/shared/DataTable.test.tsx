import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ClientTable } from "./DataTable";
const rows = Array.from({ length: 43 }, (_, i) => ({
  id: String(i + 1),
  name: "Produit " + (i + 1),
  amount: 43 - i,
}));
function setup() {
  render(
    <ClientTable
      label="Stocks"
      rows={rows}
      rowKey={(r) => r.id}
      searchText={(r) => r.name}
      columns={[
        {
          key: "name",
          label: "Produit",
          sortValue: (r) => r.name,
          render: (r) => r.name,
        },
        {
          key: "amount",
          label: "Valeur",
          numeric: true,
          sortValue: (r) => r.amount,
          render: (r) => r.amount,
        },
      ]}
    />,
  );
  return userEvent.setup();
}
describe("bounded tables", () => {
  it("defaults to ten rows, navigates to the last page and resets on size changes", async () => {
    const user = setup();
    expect(screen.getByText("1–10 sur 43")).toBeTruthy();
    expect(screen.getAllByRole("row")).toHaveLength(11);
    await user.click(screen.getByRole("button", { name: "Dernière page" }));
    expect(screen.getByText("41–43 sur 43")).toBeTruthy();
    await user.selectOptions(screen.getByLabelText("Lignes par page"), "20");
    expect(screen.getByText("1–20 sur 43")).toBeTruthy();
    const page = screen.getByLabelText("Aller à la page");
    await user.clear(page);
    await user.type(page, "2");
    await user.click(screen.getByRole("button", { name: "Aller" }));
    expect(screen.getByText("21–40 sur 43")).toBeTruthy();
  });
  it("sorts numbers across the full result set and searches before pagination", async () => {
    const user = setup();
    await user.click(screen.getByRole("button", { name: "Trier par Valeur" }));
    const first = screen.getAllByRole("row")[1];
    expect(within(first).getByText("Produit 43")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Trier par Valeur" }));
    expect(
      within(screen.getAllByRole("row")[1]).getByText("Produit 1"),
    ).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Dernière page" }));
    await user.type(screen.getByRole("textbox"), "Produit 43");
    expect(screen.getByText("1–1 sur 1")).toBeTruthy();
    expect(screen.getAllByRole("row")).toHaveLength(2);
  });
});
