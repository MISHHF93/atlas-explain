/**
 * Account tab, "Your data": download everything we keep, delete the account (signed in),
 * or clear this browser's copy (signed out). Plain copy; deletion needs a second, explicit click.
 */
import { buildExport, exportFileName, LOCAL_DATA_KEYS, type ExportInput } from "../core/account-data";
import { group, row } from "./cards";
import { el, labelledButton } from "./dom";

export interface YourDataHandlers {
  /** Gathers everything for the export file. */
  collect: () => Promise<Omit<ExportInput, "exportedAt">>;
  /** Deletes the signed-in account and its data. */
  deleteAccount: () => Promise<{ status: "deleted" | "reauth-needed"; keptToday: boolean }>;
  /** Called after local data is cleared or the account is deleted, so the app can refresh. */
  afterClear: () => void;
  openSheet: (title: string, nodes: Node[]) => void;
  closeSheet: () => void;
}

export function yourDataGroup(handlers: YourDataHandlers): { node: HTMLElement; setSignedIn: (signedIn: boolean) => void } {
  const status = el("p", "fine");
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  const download = row("doc", "Download my data", () => void doDownload());
  const remove = row("close", "Delete my account", () => confirmDelete());
  const clear = row("close", "Clear data on this browser", () => confirmClear());
  const intro = el("p", "fine");
  const node = group("Your data", [intro, download, remove, clear, status]);
  setSignedIn(false);

  function setSignedIn(next: boolean): void {
    remove.hidden = !next;
    clear.hidden = next;
    intro.textContent = next
      ? "Download a copy of everything ATLAS Explain keeps for your account and this browser, or delete your account."
      : "Without an account, your history, watchlist and recently viewed assets stay in this browser only.";
  }

  async function doDownload(): Promise<void> {
    status.textContent = "Preparing your file…";
    try {
      const data = buildExport({ ...(await handlers.collect()), exportedAt: new Date() });
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = exportFileName(new Date());
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      status.textContent = "Your file is downloading.";
    } catch {
      status.textContent = "We couldn't prepare your file just now. Check your connection and try again.";
    }
  }

  function confirmDelete(): void {
    const note = el("p", "fine");
    note.setAttribute("role", "status");
    const yes = labelledButton("close", "Yes, delete my account", "secondary danger");
    const no = labelledButton("back", "Keep my account", "secondary");
    no.addEventListener("click", () => handlers.closeSheet());
    yes.addEventListener("click", () => {
      yes.disabled = true;
      no.disabled = true;
      note.textContent = "Deleting…";
      void handlers.deleteAccount().then((r) => {
        if (r.status === "reauth-needed") {
          note.textContent = "Your saved data is deleted. To finish removing the account itself, sign out, sign in again with your email link, and choose Delete my account once more.";
          no.disabled = false;
          return;
        }
        clearLocal();
        handlers.afterClear();
        note.textContent = r.keptToday
          ? "Your account and data are deleted. Today's anonymous usage count remains until it expires from our records; it can't be linked to you."
          : "Your account and data are deleted.";
        no.replaceChildren(document.createTextNode("Done"));
        no.disabled = false;
      }, (error: unknown) => {
        note.textContent = error instanceof Error ? error.message : "That didn't finish. Nothing more was deleted; try again.";
        yes.disabled = false;
        no.disabled = false;
      });
    });
    handlers.openSheet("Delete your account", [
      el("p", undefined, "This permanently deletes your ATLAS Explain account and what it keeps: saved explanations, settings and your watchlist. History in this browser is cleared too."),
      el("p", "fine", "You can download your data first. You can keep using ATLAS Explain without an account afterwards."),
      yes,
      no,
      note,
    ]);
  }

  function confirmClear(): void {
    const yes = labelledButton("close", "Clear this browser's data", "secondary danger");
    const no = labelledButton("back", "Cancel", "secondary");
    no.addEventListener("click", () => handlers.closeSheet());
    yes.addEventListener("click", () => {
      clearLocal();
      handlers.afterClear();
      handlers.closeSheet();
      status.textContent = "This browser's history, watchlist and recently viewed assets are cleared.";
    });
    handlers.openSheet("Clear data on this browser", [
      el("p", undefined, "This removes your explanation history, watchlist and recently viewed assets from this browser."),
      yes,
      no,
    ]);
  }

  function clearLocal(): void {
    for (const key of LOCAL_DATA_KEYS) {
      try {
        localStorage.removeItem(key);
      } catch {
        // Private mode: nothing was stored.
      }
    }
  }

  return { node, setSignedIn };
}
