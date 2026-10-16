import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Modal from "./Modal";
describe("modal input protection", () => {
  it("asks before discarding edited input and preserves it when continuing", async () => {
    const close = vi.fn(),
      user = userEvent.setup();
    render(
      <Modal open title="Produit" onClose={close}>
        <form data-guard-form>
          <label>
            Référence
            <input aria-label="Référence" />
          </label>
          <button type="button" onClick={close}>
            Annuler
          </button>
        </form>
      </Modal>,
    );
    await act(async () => {
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve()),
      );
    });
    const field = screen.getByLabelText("Référence");
    await waitFor(() => expect(document.activeElement).toBe(field));
    await user.type(field, "ABC");
    await user.keyboard("{Escape}");
    expect(close).not.toHaveBeenCalled();
    expect(screen.getByRole("alertdialog")).toBeTruthy();
    await user.click(
      screen.getByRole("button", { name: "Continuer la saisie" }),
    );
    expect((field as HTMLInputElement).value).toBe("ABC");
    await user.click(screen.getByRole("button", { name: "Annuler" }));
    expect(close).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Abandonner" }));
    expect(close).toHaveBeenCalledOnce();
  });
  it("guards add/remove line buttons even when no input event fires", async () => {
    const close = vi.fn(),
      user = userEvent.setup();
    render(
      <Modal open title="Lignes" onClose={close}>
        <form data-guard-form>
          <button type="button">Ajouter une ligne</button>
        </form>
      </Modal>,
    );
    await user.click(screen.getByRole("button", { name: "Ajouter une ligne" }));
    await user.keyboard("{Escape}");
    expect(close).not.toHaveBeenCalled();
    expect(screen.getByRole("alertdialog")).toBeTruthy();
  });
  it("does not mark a read-only pagination form as unsaved business input", async () => {
    const close = vi.fn(),
      user = userEvent.setup();
    render(
      <Modal open title="Détail" onClose={close}>
        <form>
          <input aria-label="Page" defaultValue="1" />
        </form>
      </Modal>,
    );
    await user.type(screen.getByLabelText("Page"), "2");
    await user.keyboard("{Escape}");
    expect(close).toHaveBeenCalledOnce();
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });
  it("traps focus and restores the trigger on unmount", async () => {
    // jsdom has no layout; expose visibility for the focus trap in this isolated test.
    const visibility = vi
      .spyOn(HTMLElement.prototype, "offsetParent", "get")
      .mockImplementation(function (this: HTMLElement) {
        return this.parentElement;
      });
    const trigger = document.createElement("button");
    document.body.append(trigger);
    trigger.focus();
    const user = userEvent.setup();
    const view = render(
      <Modal open title="Choix" onClose={() => {}}>
        <button>Premier</button>
        <button>Dernier</button>
      </Modal>,
    );
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByLabelText("Fermer la fenêtre"),
      ),
    );
    screen.getByRole("button", { name: "Dernier" }).focus();
    await user.tab();
    expect(document.activeElement).toBe(
      screen.getByLabelText("Fermer la fenêtre"),
    );
    await user.tab({ shift: true });
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Dernier" }),
    );
    view.unmount();
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
    visibility.mockRestore();
  });
});
