import type { AnnotationResponse, ArticleAnnotationResponse } from "@citecast/shared";

export interface Settings {
  backendUrl: string;
  autoShow: boolean;
  includeLowConfidence: boolean;
  byokLlmKey?: string;
  byokBraveKey?: string;
  byokPerplexityKey?: string;
}

const DEFAULT_SETTINGS: Settings = {
  backendUrl: "http://localhost:3000",
  autoShow: true,
  includeLowConfidence: false,
};

export async function getSettings(): Promise<Settings> {
  return new Promise((resolve) => {
    chrome.storage.local.get(["citecast_settings"], (result) => {
      const stored = result["citecast_settings"] as Partial<Settings> | undefined;
      resolve({ ...DEFAULT_SETTINGS, ...stored });
    });
  });
}

export async function saveSettings(settings: Settings): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set({ citecast_settings: settings }, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve();
      }
    });
  });
}

export async function fetchAnnotations(videoId: string): Promise<AnnotationResponse> {
  const settings = await getSettings();
  const url = `${settings.backendUrl}/api/annotations/${encodeURIComponent(videoId)}`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (settings.byokLlmKey) {
    headers["X-LLM-Key"] = settings.byokLlmKey;
  }
  if (settings.byokBraveKey) {
    headers["X-Brave-Key"] = settings.byokBraveKey;
  }
  if (settings.byokPerplexityKey) {
    headers["X-Perplexity-Key"] = settings.byokPerplexityKey;
  }

  try {
    const response = await fetch(url, { headers });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error");
      return {
        error: "processing_failed",
        message: `Server returned ${response.status}: ${errorText}`,
        citations: [],
      };
    }

    const data = await response.json() as AnnotationResponse;
    return data;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Network error";
    return {
      error: "processing_failed",
      message: `Failed to reach backend: ${message}`,
      citations: [],
    };
  }
}

export async function fetchArticleAnnotations(
  url: string,
  text: string,
  title?: string
): Promise<ArticleAnnotationResponse> {
  const settings = await getSettings();
  const endpoint = `${settings.backendUrl}/api/annotations/article`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (settings.byokLlmKey) {
    headers["X-LLM-Key"] = settings.byokLlmKey;
  }
  if (settings.byokBraveKey) {
    headers["X-Brave-Key"] = settings.byokBraveKey;
  }
  if (settings.byokPerplexityKey) {
    headers["X-Perplexity-Key"] = settings.byokPerplexityKey;
  }

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({ url, text, title }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error");
      return {
        error: "processing_failed",
        message: `Server returned ${response.status}: ${errorText}`,
        citations: [],
      };
    }

    const data = await response.json() as ArticleAnnotationResponse;
    return data;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Network error";
    return {
      error: "processing_failed",
      message: `Failed to reach backend: ${message}`,
      citations: [],
    };
  }
}
