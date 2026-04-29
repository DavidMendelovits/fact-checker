import { getSettings, saveSettings } from "./api.js";
import type { Settings } from "./api.js";

async function init() {
  const settings = await getSettings();

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
