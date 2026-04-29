import type { ResolvedCitation, VideoAnnotation, Source } from "@citecast/shared";

export interface OverlayManager {
  showLoading(): void;
  hideLoading(): void;
  setAnnotations(annotations: VideoAnnotation, settings: { includeLowConfidence: boolean }): void;
  syncToTime(currentTime: number): void;
  addTimelineMarkers(progressBar: Element, duration: number): void;
  destroy(): void;
}

interface CitationState {
  citation: ResolvedCitation;
  shown: boolean;
  dismissedUntil: number; // timestamp after which we can re-show
}

function getFaviconUrl(sourceUrl: string): string {
  try {
    const domain = new URL(sourceUrl).hostname;
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=16`;
  } catch {
    return "";
  }
}

function getDomain(sourceUrl: string): string {
  try {
    return new URL(sourceUrl).hostname.replace(/^www\./, "");
  } catch {
    return sourceUrl;
  }
}

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
}

function createFavicon(source: Source): HTMLElement {
  const faviconUrl = getFaviconUrl(source.url);
  if (faviconUrl) {
    const img = document.createElement("img");
    img.className = "citecast-card-favicon";
    img.src = faviconUrl;
    img.alt = "";
    img.width = 16;
    img.height = 16;
    img.onerror = () => {
      const fallback = document.createElement("div");
      fallback.className = "citecast-card-favicon-fallback";
      fallback.textContent = "🌐";
      img.replaceWith(fallback);
    };
    return img;
  }
  const fallback = document.createElement("div");
  fallback.className = "citecast-card-favicon-fallback";
  fallback.textContent = "🌐";
  return fallback;
}

function buildCard(citation: ResolvedCitation, onClose: () => void): HTMLElement {
  const card = document.createElement("div");
  card.className = `citecast-card citecast-card--${citation.confidence}`;

  const inner = document.createElement("div");
  inner.className = "citecast-card-inner";

  // Header: claim + close button
  const header = document.createElement("div");
  header.className = "citecast-card-header";

  const claim = document.createElement("div");
  claim.className = "citecast-card-claim";
  claim.textContent = citation.claim;

  const closeBtn = document.createElement("button");
  closeBtn.className = "citecast-card-close";
  closeBtn.innerHTML = "&#x2715;";
  closeBtn.setAttribute("aria-label", "Dismiss citation");
  closeBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    onClose();
  });

  header.appendChild(claim);
  header.appendChild(closeBtn);
  inner.appendChild(header);

  // Primary source
  const primarySource = citation.sources[0];
  if (primarySource) {
    const sourceLink = document.createElement("a");
    sourceLink.className = "citecast-card-source";
    sourceLink.href = primarySource.url;
    sourceLink.target = "_blank";
    sourceLink.rel = "noopener noreferrer";
    sourceLink.addEventListener("click", (e) => e.stopPropagation());

    const favicon = createFavicon(primarySource);
    sourceLink.appendChild(favicon);

    const sourceInfo = document.createElement("div");
    sourceInfo.className = "citecast-card-source-info";

    const sourceTitle = document.createElement("div");
    sourceTitle.className = "citecast-card-source-title";
    sourceTitle.textContent = primarySource.title;

    const sourceDomain = document.createElement("div");
    sourceDomain.className = "citecast-card-source-domain";
    sourceDomain.textContent = getDomain(primarySource.url);

    sourceInfo.appendChild(sourceTitle);
    sourceInfo.appendChild(sourceDomain);
    sourceLink.appendChild(sourceInfo);
    inner.appendChild(sourceLink);
  }

  // "N more sources" if applicable
  const extraCount = citation.sources.length - 1;
  if (extraCount > 0) {
    const moreBtn = document.createElement("button");
    moreBtn.className = "citecast-card-more";
    moreBtn.textContent = `+${extraCount} more source${extraCount > 1 ? "s" : ""}`;
    inner.appendChild(moreBtn);
  }

  // Footer: confidence badge
  const footer = document.createElement("div");
  footer.className = "citecast-card-footer";

  const confidenceBadge = document.createElement("span");
  confidenceBadge.className = `citecast-card-confidence citecast-card-confidence--${citation.confidence}`;
  confidenceBadge.textContent = citation.confidence;

  footer.appendChild(confidenceBadge);
  inner.appendChild(footer);

  card.appendChild(inner);

  // Click card body → open primary source
  card.addEventListener("click", () => {
    if (primarySource) {
      window.open(primarySource.url, "_blank", "noopener,noreferrer");
    }
  });

  return card;
}

export function createOverlay(shadowRoot: ShadowRoot): OverlayManager {
  let loadingChip: HTMLElement | null = null;
  let currentCard: HTMLElement | null = null;
  let currentCardDismissTimeout: ReturnType<typeof setTimeout> | null = null;
  let citationStates: CitationState[] = [];
  let lastShownCitationId: string | null = null;
  let markerContainer: HTMLElement | null = null;

  function showLoading() {
    hideLoading();
    const chip = document.createElement("div");
    chip.className = "citecast-loading-chip";

    const icon = document.createElement("span");
    icon.className = "citecast-loading-chip-icon";
    icon.textContent = "🔍";

    const text = document.createElement("span");
    text.textContent = "Analyzing video...";

    chip.appendChild(icon);
    chip.appendChild(text);
    shadowRoot.appendChild(chip);
    loadingChip = chip;
  }

  function hideLoading() {
    if (loadingChip) {
      loadingChip.remove();
      loadingChip = null;
    }
  }

  function dismissCard(animated = true) {
    if (!currentCard) return;

    if (currentCardDismissTimeout !== null) {
      clearTimeout(currentCardDismissTimeout);
      currentCardDismissTimeout = null;
    }

    const card = currentCard;
    currentCard = null;
    lastShownCitationId = null;

    if (animated) {
      card.classList.add("citecast-card--exiting");
      card.addEventListener("animationend", () => card.remove(), { once: true });
    } else {
      card.remove();
    }
  }

  function showCard(citation: ResolvedCitation, endTime: number) {
    // If same card is already showing, don't re-render
    const cardId = `${citation.start_time}-${citation.end_time}`;
    if (lastShownCitationId === cardId && currentCard) return;

    dismissCard(false);

    lastShownCitationId = cardId;
    const card = buildCard(citation, () => {
      // Manual dismiss — suppress this citation for 30s
      const state = citationStates.find(
        (s) => s.citation.start_time === citation.start_time && s.citation.end_time === citation.end_time
      );
      if (state) {
        state.dismissedUntil = Date.now() + 30_000;
      }
      dismissCard(true);
    });

    shadowRoot.appendChild(card);
    currentCard = card;

    // Auto-dismiss 8s after end_time
    const now = Date.now();
    const endMs = endTime * 1000;
    const autoDismissIn = Math.max(endMs - now + 8000, 3000);

    currentCardDismissTimeout = setTimeout(() => {
      dismissCard(true);
    }, autoDismissIn);
  }

  function setAnnotations(
    annotations: VideoAnnotation,
    settings: { includeLowConfidence: boolean }
  ) {
    const filtered = annotations.citations.filter((c) => {
      if (!settings.includeLowConfidence && c.confidence === "low") return false;
      if (c.sources.length === 0) return false;
      return true;
    });

    citationStates = filtered.map((c) => ({
      citation: c,
      shown: false,
      dismissedUntil: 0,
    }));
  }

  function syncToTime(currentTime: number) {
    const now = Date.now();

    // Check which citation window we're in
    let activeCitation: ResolvedCitation | null = null;
    let activeEndTime = 0;

    for (const state of citationStates) {
      const { citation } = state;
      if (currentTime >= citation.start_time && currentTime <= citation.end_time) {
        // We're in this citation's window
        if (state.dismissedUntil > now) continue; // user dismissed, skip
        activeCitation = citation;
        activeEndTime = citation.end_time;

        // Reset shown state if we exited and re-entered
        if (!state.shown) {
          state.shown = true;
        }
        break;
      } else {
        // Reset shown state so re-entry triggers again
        if (state.shown && currentTime > citation.end_time + 8) {
          state.shown = false;
        }
      }
    }

    if (activeCitation) {
      showCard(activeCitation, activeEndTime);
    } else {
      // No active citation — dismiss card if showing
      const cardId = lastShownCitationId;
      if (cardId && currentCard) {
        // Check if any state matches what's showing and we're outside its window
        const stillActive = citationStates.some((s) => {
          const id = `${s.citation.start_time}-${s.citation.end_time}`;
          return id === cardId && currentTime >= s.citation.start_time && currentTime <= s.citation.end_time;
        });
        if (!stillActive) {
          dismissCard(true);
        }
      }
    }
  }

  function addTimelineMarkers(progressBar: Element, duration: number) {
    // Remove old markers
    if (markerContainer) {
      markerContainer.remove();
      markerContainer = null;
    }

    if (duration <= 0 || citationStates.length === 0) return;

    const container = document.createElement("div");
    container.style.cssText = "position:absolute;inset:0;pointer-events:none;z-index:100;";
    markerContainer = container;

    for (const state of citationStates) {
      const { citation } = state;
      const leftPct = (citation.start_time / duration) * 100;
      const marker = document.createElement("div");
      marker.className = `citecast-marker citecast-marker--${citation.confidence}`;
      marker.style.left = `${leftPct}%`;
      marker.title = formatTime(citation.start_time);
      container.appendChild(marker);
    }

    progressBar.appendChild(container);
  }

  function destroy() {
    hideLoading();
    dismissCard(false);
    if (markerContainer) {
      markerContainer.remove();
      markerContainer = null;
    }
    if (currentCardDismissTimeout !== null) {
      clearTimeout(currentCardDismissTimeout);
      currentCardDismissTimeout = null;
    }
    citationStates = [];
  }

  return {
    showLoading,
    hideLoading,
    setAnnotations,
    syncToTime,
    addTimelineMarkers,
    destroy,
  };
}
