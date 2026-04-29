// CiteCast Background Service Worker
// Listens for messages from the popup and injects the article content script
// into the active tab using chrome.scripting (MV3).

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "inject-article-script") {
    handleInjectArticleScript()
      .then(() => sendResponse({ success: true }))
      .catch((err: unknown) => {
        console.error("CiteCast background: injection failed", err);
        const msg = err instanceof Error ? err.message : "Injection failed";
        sendResponse({ success: false, error: msg });
      });
    // Return true to signal we'll call sendResponse asynchronously
    return true;
  }
});

async function handleInjectArticleScript(): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    throw new Error("No active tab found");
  }

  const tabId = tab.id;

  // Inject the CSS into the main document (for .citecast-highlight and article UI).
  // The article-content script also injects styles into its shadow DOM via ?raw,
  // but highlights live in the main DOM and need this CSS.
  await chrome.scripting.insertCSS({
    target: { tabId },
    files: ["dist/content.css"],
  });

  // Inject the article content script
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["dist/article-content.js"],
  });
}
