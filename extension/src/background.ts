import { readSelectionInPage } from "./read-selection";

const MENU_ID = "atlas-explain-selection";
const COMMAND_ID = "explain-selection";
export const MENU_TITLE = "Explain with ATLAS Explain";

interface PendingExplain {
  selection: string;
  title: string;
  url: string;
  auto: boolean;
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: MENU_ID,
    title: MENU_TITLE,
    contexts: ["selection"],
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== MENU_ID || tab?.id == null) return;
  // Chrome passes only the highlighted text here. Nothing else on the page is read.
  void deliver({
    selection: (info.selectionText ?? "").slice(0, 4_000),
    title: tab.title ?? "",
    url: tab.url ?? "",
    auto: true,
  });
});

// Alt+Shift+X: the shortcut grants activeTab for this tab only, then reads the highlight.
chrome.commands.onCommand.addListener((command, tab) => {
  if (command !== COMMAND_ID || tab?.id == null) return;
  void chrome.scripting
    .executeScript({ target: { tabId: tab.id }, func: readSelectionInPage })
    .then(([injected]) =>
      deliver({
        selection: injected?.result?.selection ?? "",
        title: injected?.result?.title || tab.title || "",
        url: tab.url ?? "",
        auto: Boolean(injected?.result?.selection?.trim()),
      }),
    )
    .catch(() => deliver({ selection: "", title: tab.title ?? "", url: tab.url ?? "", auto: false }));
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.type !== "atlas-explain-selection") return;
  const tab = sender.tab;
  void deliver({
    selection: typeof message.selection === "string" ? message.selection.slice(0, 4_000) : "",
    title: typeof message.title === "string" ? message.title : tab?.title ?? "",
    url: tab?.url ?? "",
    auto: true,
  }).then((opened) => sendResponse({ ok: opened }));
  return true;
});

/** Park the highlight for the popup, then open it. If Chrome refuses, flag the toolbar icon. */
async function deliver(pending: PendingExplain): Promise<boolean> {
  await chrome.storage.session.set({ pending });
  try {
    await chrome.action.openPopup();
    return true;
  } catch {
    await chrome.action.setBadgeBackgroundColor({ color: "#0c6b5e" });
    await chrome.action.setBadgeText({ text: "1" });
    await chrome.action.setTitle({ title: "ATLAS Explain: your highlight is ready. Click to see the explanation." });
    return false;
  }
}
