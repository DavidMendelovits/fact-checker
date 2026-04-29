import { getSettings, saveSettings } from "./api.js";
import type { Settings } from "./api.js";

function isYouTubeWatchUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      (parsed.hostname === "www.youtube.com" || parsed.hostname === "youtube.com") &&
      parsed.pathname === "/watch"
    );
  } catch {
    return false;
  }
}

async function initContextSection(tab: chrome.tabs.Tab) {
  const contextSection = document.getElementById("contextSection") as HTMLElement;

  if (!tab.url) {
    contextSection.style.display = "none";
    return;
  }

  if (isYouTubeWatchUrl(tab.url)) {
    // YouTube watch page — show active status
    const container = document.createElement("div");
    container.className = "context-youtube";

    const dot = document.createElement("div");
    dot.className = "context-youtube-dot";

    const textEl = document.createElement("div");
    textEl.className = "context-youtube-text";
    textEl.innerHTML = "<strong>CiteCast is active</strong>Citations are being analyzed for this video.";

    container.appendChild(dot);
    container.appendChild(textEl);
    contextSection.appendChild(container);
  } else {
    // Non-YouTube page — show analyze button
    const btn = document.createElement("button");
    btn.className = "btn-analyze";
    btn.id = "analyzeBtn";
    btn.innerHTML = "🔍 Analyze this page";

    const hint = document.createElement("div");
    hint.className = "analyze-hint";
    hint.textContent = "Extract and fact-check claims in this article using CiteCast.";

    const status = document.createElement("div");
    status.className = "analyze-status";
    status.id = "analyzeStatus";

    contextSection.appendChild(btn);
    contextSection.appendChild(hint);
    contextSection.appendChild(status);

    btn.addEventListener("click", async () => {
      btn.disabled = true;
      btn.textContent = "Injecting…";
      status.textContent = "";
      status.className = "analyze-status";

      try {
        const response = await new Promise<{ success: boolean; error?: string }>(
          (resolve, reject) => {
            chrome.runtime.sendMessage({ type: "inject-article-script" }, (resp) => {
              if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
              } else {
                resolve(resp as { success: boolean; error?: string });
              }
            });
          }
        );

        if (response.success) {
          status.textContent = "Analysis started! Check the page.";
          status.className = "analyze-status success";
          btn.textContent = "Analysis running…";
        } else {
          status.textContent = response.error ?? "Injection failed.";
          status.className = "analyze-status error";
          btn.disabled = false;
          btn.innerHTML = "🔍 Analyze this page";
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        status.textContent = `Error: ${msg}`;
        status.className = "analyze-status error";
        btn.disabled = false;
        btn.innerHTML = "🔍 Analyze this page";
      }
    });
  }
}

async function init() {
  const settings = await getSettings();

  // Get current tab to decide which context section to show
  const [tab] = await new Promise<chrome.tabs.Tab[]>((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, resolve);
  });

  await initContextSection(tab);

  const backendUrlInput = document.getElementById("backendUrl") as HTMLInputElement;
  const autoShowInput = document.getElementById("autoShow") as HTMLInputElement;
  const includeLowConfidenceInput = document.getElementById("includeLowConfidence") as HTMLInputElement;
  const byokLlmKeyInput = document.getElementById("byokLlmKey") as HTMLInputElement;
  const byokBraveKeyInput = document.getElementById("byokBraveKey") as HTMLInputElement;
  const byokPerplexityKeyInput = document.getElementById("byokPerplexityKey") as HTMLInputElement;
  const saveBtn = document.getElementById("saveBtn") as HTMLButtonElement;
  const saveStatus = document.getElementById("saveStatus") as HTMLSpanElement;

  // Populate form from settings
  backendUrlInput.value = settings.backendUrl;
  autoShowInput.checked = settings.autoShow;
  includeLowConfidenceInput.checked = settings.includeLowConfidence;
  byokLlmKeyInput.value = settings.byokLlmKey ?? "";
  byokBraveKeyInput.value = settings.byokBraveKey ?? "";
  byokPerplexityKeyInput.value = settings.byokPerplexityKey ?? "";

  saveBtn.addEventListener("click", async () => {
    const newSettings: Settings = {
      backendUrl: backendUrlInput.value.trim() || "http://localhost:3000",
      autoShow: autoShowInput.checked,
      includeLowConfidence: includeLowConfidenceInput.checked,
    };

    const llmKey = byokLlmKeyInput.value.trim();
    const braveKey = byokBraveKeyInput.value.trim();
    const perplexityKey = byokPerplexityKeyInput.value.trim();

    if (llmKey) newSettings.byokLlmKey = llmKey;
    if (braveKey) newSettings.byokBraveKey = braveKey;
    if (perplexityKey) newSettings.byokPerplexityKey = perplexityKey;

    saveBtn.disabled = true;
    try {
      await saveSettings(newSettings);
      saveStatus.classList.add("visible");
      setTimeout(() => saveStatus.classList.remove("visible"), 2500);
    } catch (err) {
      console.error("CiteCast: failed to save settings", err);
    } finally {
      saveBtn.disabled = false;
    }
  });
}

document.addEventListener("DOMContentLoaded", init);
