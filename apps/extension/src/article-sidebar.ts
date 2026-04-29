import type { ArticleAnnotation, ResolvedArticleCitation, Source, ClaimType, Confidence } from "@citecast/shared";

export interface ArticleSidebarManager {
  setAnnotations(annotations: ArticleAnnotation, settings: { includeLowConfidence: boolean }): void;
  scrollToHighlight(index: number): void;
  toggle(): void;
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

function createSourceFavicon(source: Source): HTMLElement {
  const faviconUrl = getFaviconUrl(source.url);
  if (faviconUrl) {
    const img = document.createElement("img");
    img.className = "citecast-source-favicon";
    img.src = faviconUrl;
    img.alt = "";
    img.width = 16;
    img.height = 16;
    img.onerror = () => {
      const span = document.createElement("span");
      span.style.cssText = "width:16px;height:16px;flex-shrink:0;font-size:10px;";
      span.textContent = "🌐";
      img.replaceWith(span);
    };
    return img;
  }
  const span = document.createElement("span");
  span.style.cssText = "width:16px;height:16px;flex-shrink:0;font-size:10px;";
  span.textContent = "🌐";
  return span;
}

function truncateExcerpt(excerpt: string, maxLen = 80): string {
  if (excerpt.length <= maxLen) return excerpt;
  return excerpt.slice(0, maxLen - 1) + "…";
}

function generateBibTeX(citations: ResolvedArticleCitation[]): string {
  const entries: string[] = [];
  citations.forEach((citation, idx) => {
    citation.sources.forEach((source, sIdx) => {
      const key = `citecast${idx + 1}_${sIdx + 1}`;
      const domain = getDomain(source.url);
      const year = source.date ? source.date.split("-")[0] : "n.d.";
      entries.push(
        `@misc{${key},\n  title={${source.title}},\n  author={${(source.authors ?? [domain]).join(" and ")}},\n  year={${year}},\n  url={${source.url}},\n  note={${citation.claim}}\n}`
      );
    });
  });
  return entries.join("\n\n");
}

function generateMarkdown(citations: ResolvedArticleCitation[]): string {
  const lines: string[] = ["# CiteCast Bibliography\n"];
  citations.forEach((citation, idx) => {
    lines.push(`## ${idx + 1}. ${citation.claim}\n`);
    lines.push(`> ${truncateExcerpt(citation.excerpt, 200)}\n`);
    citation.sources.forEach((source, sIdx) => {
      const domain = getDomain(source.url);
      const date = source.date ? ` (${source.date})` : "";
      lines.push(`${sIdx + 1}. [${source.title}](${source.url}) — ${domain}${date}`);
    });
    lines.push("");
  });
  return lines.join("\n");
}

export function createArticleSidebar(shadowRoot: ShadowRoot): ArticleSidebarManager {
  let allCitations: ResolvedArticleCitation[] = [];
  let citationIndices: number[] = []; // original indices of filtered citations
  let isOpen = false;

  // Toggle button — fixed position in bottom-right
  const toggleBtn = document.createElement("button");
  toggleBtn.className = "citecast-article-sidebar-toggle";
  toggleBtn.textContent = "📚";
  toggleBtn.setAttribute("aria-label", "Toggle citations sidebar");
  toggleBtn.title = "Citations";
  shadowRoot.appendChild(toggleBtn);

  // Sidebar panel — fixed position from right edge
  const sidebar = document.createElement("div");
  sidebar.className = "citecast-article-sidebar";

  // Header
  const header = document.createElement("div");
  header.className = "citecast-sidebar-header";

  const titleRow = document.createElement("div");
  titleRow.className = "citecast-sidebar-title-row";

  const title = document.createElement("div");
  title.className = "citecast-sidebar-title";
  title.textContent = "Citations (0)";

  const closeBtn = document.createElement("button");
  closeBtn.className = "citecast-sidebar-close";
  closeBtn.innerHTML = "&#x2715;";
  closeBtn.setAttribute("aria-label", "Close sidebar");

  titleRow.appendChild(title);
  titleRow.appendChild(closeBtn);

  // Filters
  const filtersRow = document.createElement("div");
  filtersRow.className = "citecast-sidebar-filters";

  const claimTypeSelect = document.createElement("select");
  claimTypeSelect.className = "citecast-filter-select";
  claimTypeSelect.setAttribute("aria-label", "Filter by claim type");

  const claimTypeOptions: Array<{ value: string; label: string }> = [
    { value: "", label: "All types" },
    { value: "academic_paper", label: "Academic" },
    { value: "news_article", label: "News" },
    { value: "book", label: "Book" },
    { value: "tweet", label: "Tweet" },
    { value: "video", label: "Video" },
    { value: "quote", label: "Quote" },
    { value: "statistic", label: "Statistic" },
    { value: "general", label: "General" },
  ];
  claimTypeOptions.forEach((opt) => {
    const option = document.createElement("option");
    option.value = opt.value;
    option.textContent = opt.label;
    claimTypeSelect.appendChild(option);
  });

  const confidenceSelect = document.createElement("select");
  confidenceSelect.className = "citecast-filter-select";
  confidenceSelect.setAttribute("aria-label", "Filter by confidence");

  const confidenceOptions: Array<{ value: string; label: string }> = [
    { value: "", label: "All confidence" },
    { value: "high", label: "High" },
    { value: "medium", label: "Medium" },
    { value: "low", label: "Low" },
  ];
  confidenceOptions.forEach((opt) => {
    const option = document.createElement("option");
    option.value = opt.value;
    option.textContent = opt.label;
    confidenceSelect.appendChild(option);
  });

  filtersRow.appendChild(claimTypeSelect);
  filtersRow.appendChild(confidenceSelect);

  header.appendChild(titleRow);
  header.appendChild(filtersRow);

  // Citation list container
  const listContainer = document.createElement("div");
  listContainer.className = "citecast-sidebar-list";

  // Footer with export
  const footer = document.createElement("div");
  footer.className = "citecast-sidebar-footer";

  const exportBtn = document.createElement("button");
  exportBtn.className = "citecast-export-btn";
  exportBtn.textContent = "Export Bibliography";
  footer.appendChild(exportBtn);

  sidebar.appendChild(header);
  sidebar.appendChild(listContainer);
  sidebar.appendChild(footer);
  shadowRoot.appendChild(sidebar);

  // ===== Rendering =====

  function renderList() {
    const typeFilter = claimTypeSelect.value as ClaimType | "";
    const confidenceFilter = confidenceSelect.value as Confidence | "";

    // Build filtered list with original indices for highlight scrolling
    const filteredWithIndices = allCitations
      .map((c, i) => ({ citation: c, originalIndex: i }))
      .filter(({ citation }) => {
        if (typeFilter && citation.claim_type !== typeFilter) return false;
        if (confidenceFilter && citation.confidence !== confidenceFilter) return false;
        return true;
      });

    title.textContent = `Citations (${filteredWithIndices.length})`;
    listContainer.innerHTML = "";

    if (filteredWithIndices.length === 0) {
      const empty = document.createElement("div");
      empty.className = "citecast-sidebar-empty";
      empty.textContent = "No citations match the current filters.";
      listContainer.appendChild(empty);
      return;
    }

    filteredWithIndices.forEach(({ citation, originalIndex }) => {
      const item = document.createElement("div");
      item.className = "citecast-citation-item";

      const summary = document.createElement("div");
      summary.className = "citecast-citation-summary";

      // Excerpt chip (replaces timestamp for articles)
      const excerptChip = document.createElement("span");
      excerptChip.className = "citecast-citation-timestamp citecast-citation-excerpt-chip";
      excerptChip.textContent = truncateExcerpt(citation.excerpt, 40);
      excerptChip.title = `Go to: "${citation.excerpt}"`;
      excerptChip.addEventListener("click", (e) => {
        e.stopPropagation();
        // Scroll to the highlight element in the main DOM
        const highlightEl = document.querySelector<HTMLElement>(
          `[data-citecast-index="${originalIndex}"]`
        );
        if (highlightEl) {
          highlightEl.scrollIntoView({ behavior: "smooth", block: "center" });
          // Briefly pulse the highlight
          highlightEl.classList.add("citecast-highlight--active");
          setTimeout(() => highlightEl.classList.remove("citecast-highlight--active"), 1500);
        }
      });

      const textGroup = document.createElement("div");
      textGroup.className = "citecast-citation-text-group";

      const claimText = document.createElement("div");
      claimText.className = "citecast-citation-claim";
      claimText.textContent = citation.claim;

      const meta = document.createElement("div");
      meta.className = "citecast-citation-meta";

      const badge = document.createElement("span");
      badge.className = "citecast-citation-badge";
      badge.textContent = `${citation.sources.length} source${citation.sources.length !== 1 ? "s" : ""}`;

      const typeTag = document.createElement("span");
      typeTag.className = "citecast-citation-type";
      typeTag.textContent = citation.claim_type.replace(/_/g, " ");

      meta.appendChild(badge);
      meta.appendChild(typeTag);

      textGroup.appendChild(claimText);
      textGroup.appendChild(meta);

      const expandIcon = document.createElement("span");
      expandIcon.className = "citecast-citation-expand-icon";
      expandIcon.textContent = "▶";

      summary.appendChild(excerptChip);
      summary.appendChild(textGroup);
      summary.appendChild(expandIcon);

      // Source list
      const sourceList = document.createElement("div");
      sourceList.className = "citecast-source-list";

      citation.sources.forEach((source) => {
        const sourceItem = document.createElement("a");
        sourceItem.className = "citecast-source-item";
        sourceItem.href = source.url;
        sourceItem.target = "_blank";
        sourceItem.rel = "noopener noreferrer";

        const favicon = createSourceFavicon(source);
        const info = document.createElement("div");
        info.className = "citecast-source-info";

        const sourceTitle = document.createElement("div");
        sourceTitle.className = "citecast-source-title";
        sourceTitle.textContent = source.title;

        const domain = document.createElement("div");
        domain.className = "citecast-source-domain";
        domain.textContent = getDomain(source.url);

        info.appendChild(sourceTitle);
        info.appendChild(domain);

        if (source.date) {
          const date = document.createElement("div");
          date.className = "citecast-source-date";
          date.textContent = source.date;
          info.appendChild(date);
        }

        sourceItem.appendChild(favicon);
        sourceItem.appendChild(info);
        sourceList.appendChild(sourceItem);
      });

      // Toggle expand on click
      summary.addEventListener("click", () => {
        item.classList.toggle("citecast-citation-item--expanded");
      });

      item.appendChild(summary);
      item.appendChild(sourceList);
      listContainer.appendChild(item);
    });
  }

  // ===== Event Handlers =====

  function openSidebar() {
    isOpen = true;
    sidebar.classList.add("citecast-article-sidebar--open");
    toggleBtn.classList.add("citecast-sidebar-toggle--active");
  }

  function closeSidebar() {
    isOpen = false;
    sidebar.classList.remove("citecast-article-sidebar--open");
    toggleBtn.classList.remove("citecast-sidebar-toggle--active");
  }

  function toggle() {
    if (isOpen) {
      closeSidebar();
    } else {
      openSidebar();
    }
  }

  toggleBtn.addEventListener("click", () => toggle());
  closeBtn.addEventListener("click", () => closeSidebar());
  claimTypeSelect.addEventListener("change", () => renderList());
  confidenceSelect.addEventListener("change", () => renderList());

  // Export handler
  exportBtn.addEventListener("click", async () => {
    const text = generateMarkdown(allCitations);
    try {
      await navigator.clipboard.writeText(text);
      const original = exportBtn.textContent;
      exportBtn.textContent = "Copied to clipboard!";
      setTimeout(() => {
        exportBtn.textContent = original;
      }, 2000);
    } catch {
      const bibtex = generateBibTeX(allCitations);
      const blob = new Blob([bibtex], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    }
  });

  // ===== Public API =====

  function setAnnotations(
    annotations: ArticleAnnotation,
    settings: { includeLowConfidence: boolean }
  ) {
    allCitations = annotations.citations.filter((c) => {
      if (!settings.includeLowConfidence && c.confidence === "low") return false;
      return true;
    });
    renderList();
  }

  function scrollToHighlight(index: number) {
    const highlightEl = document.querySelector<HTMLElement>(
      `[data-citecast-index="${index}"]`
    );
    if (highlightEl) {
      highlightEl.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }

  function destroy() {
    toggleBtn.remove();
    sidebar.remove();
    allCitations = [];
  }

  return {
    setAnnotations,
    scrollToHighlight,
    toggle,
    destroy,
  };
}
