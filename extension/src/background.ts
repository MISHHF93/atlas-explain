const MENU_ID = "atlas-explain-selection";

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: MENU_ID,
    title: "Explain with ATLAS",
    contexts: ["selection"],
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== MENU_ID || tab?.id == null) return;
  const pending = {
    selection: info.selectionText ?? "",
    title: tab.title ?? "",
    url: tab.url ?? "",
    auto: true,
  };
  void chrome.storage.session.set({ pending }).then(async () => {
    try {
      await chrome.action.openPopup();
    } catch {
      // The toolbar icon still opens the popup with this selection waiting.
    }
  });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.type !== "atlas-explain-selection") return;
  const tab = sender.tab;
  const pending = {
    selection: typeof message.selection === "string" ? message.selection : "",
    title: typeof message.title === "string" ? message.title : tab?.title ?? "",
    url: tab?.url ?? "",
    auto: true,
  };
  void chrome.storage.session.set({ pending }).then(async () => {
    try {
      await chrome.action.openPopup();
    } catch {
      sendResponse({ ok: false });
      return;
    }
    sendResponse({ ok: true });
  });
  return true;
});
