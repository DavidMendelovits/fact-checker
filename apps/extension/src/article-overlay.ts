import type { ResolvedArticleCitation, Source } from "@citecast/shared";

export interface ArticleOverlayManager {
  showLoading(): void;
  hideLoading(): void;
  showCardForCitation(citation: ResolvedArticleCitation, anchorRect: DOMRect): void;
  dismissCard(): void;
  destroy(): void;
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

function buildCard(
  citation: ResolvedArticleCitation,
  anchorRect: DOMRect,
  onClose: () => void
): HTMLElement {
  const card = document.createElement("div");
  card.className = `citecast-article-card citecast-card citecast-card--${citation.confidence}`;

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

  // Extra sources count
  const extraCount = citation.sources.length - 1;
  if (extraCount > 0) {
    const moreBtn = document.createElement("button");
    moreBtn.className = "citecast-card-more";
    moreBtn.textContent = `+${extraCount} more source${extraCount > 1 ? "s" : ""}`;
    inner.appendChild(moreBtn);
  }

  // Footer: confidence badge + excerpt
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

  // Position the card near the anchor element
  // Decide above or below based on available space
  const viewportHeight = window.innerHeight;
  const spaceAbove = anchorRect.top;
  const spaceBelow = viewportHeight - anchorRect.bottom;

  const cardWidth = 320;
  const estimatedCardHeight = 160;

  let top: number;
  let left: number;

  if (spaceBelow >= estimatedCardHeight || spaceBelow >= spaceAbove) {
    // Place below the anchor
    top = anchorRect.bottom + window.scrollY + 8;
  } else {
    // Place above the anchor
    top = anchorRect.top + window.scrollY - estimatedCardHeight - 8;
  }

  // Clamp left so card doesn't go off-screen
  left = anchorRect.left + window.scrollX;
  const maxLeft = window.scrollX + window.innerWidth - cardWidth - 16;
  left = Math.max(window.scrollX + 8, Math.min(left, maxLeft));

  card.style.position = "absolute";
  card.style.top = `${top}px`;
  card.style.left = `${left}px`;
  card.style.width = `${cardWidth}px`;
  card.style.zIndex = "2147483646";

  return card;
}

export function createArticleOverlay(shadowRoot: ShadowRoot): ArticleOverlayManager {
  // We need a container in the main document for positioning the card
  // (since the card uses absolute positioning relative to the document).
  // We'll attach the card directly to document.body.
  let loadingChip: HTMLElement | null = null;
  let currentCard: HTMLElement | null = null;

  function showLoading() {
    hideLoading();
    const chip = document.createElement("div");
    chip.className = "citecast-article-loading-chip";

    const icon = document.createElement("span");
    icon.className = "citecast-loading-chip-icon";
    icon.textContent = "🔍";

    const text = document.createElement("span");
    text.textContent = "Analyzing article...";

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

  function dismissCard() {
    if (!currentCard) return;
    const card = currentCard;
    currentCard = null;
    card.classList.add("citecast-card--exiting");
    card.addEventListener("animationend", () => card.remove(), { once: true });
  }

  function showCardForCitation(citation: ResolvedArticleCitation, anchorRect: DOMRect) {
    dismissCard();

    const card = buildCard(citation, anchorRect, () => {
      const c = currentCard;
      currentCard = null;
      if (c) {
        c.classList.add("citecast-card--exiting");
        c.addEventListener("animationend", () => c.remove(), { once: true });
      }
    });

    document.body.appendChild(card);
    currentCard = card;

    // Dismiss when clicking outside
    const outsideClickHandler = (e: MouseEvent) => {
      if (currentCard && !currentCard.contains(e.target as Node)) {
        dismissCard();
        document.removeEventListener("click", outsideClickHandler, { capture: true });
      }
    };
    // Delay to avoid the triggering click
    setTimeout(() => {
      document.addEventListener("click", outsideClickHandler, { capture: true, once: false });
    }, 0);
  }

  function destroy() {
    hideLoading();
    if (currentCard) {
      currentCard.remove();
      currentCard = null;
    }
  }

  return {
    showLoading,
    hideLoading,
    showCardForCitation,
    dismissCard,
    destroy,
  };
}
