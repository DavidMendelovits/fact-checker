import { fetchArticleAnnotations, getSettings } from "./api.js";
import { createArticleOverlay } from "./article-overlay.js";
import { createArticleSidebar } from "./article-sidebar.js";
import type { ArticleOverlayManager } from "./article-overlay.js";
import type { ArticleSidebarManager } from "./article-sidebar.js";
import type { ResolvedArticleCitation, ArticleAnnotation } from "@citecast/shared";

// Import CSS as a raw string so we can inject it into shadow DOM
import contentStyles from "../styles/content.css?raw";

// ===== Re-injection guard =====
// If article-content.js is injected twice (e.g., user clicks "Analyze" again),
// bail out early so we don't double-wire handlers.
declare global {
  interface Window {
    __citecastArticleInjected?: boolean;
  }
}
if (window.__citecastArticleInjected) {
  // Already running — nothing to do
  // eslint-disable-next-line no-throw-literal
  throw new Error("CiteCast article: already injected, skipping");
}
window.__citecastArticleInjected = true;

// ===== Article Text Extraction =====

function extractArticleContent(): { text: string; title: string } | null {
  // Clone the document body so we can remove noise elements without touching the page
  const body = document.body.cloneNode(true) as HTMLElement;

  // Remove script, style, nav, header, footer, aside elements
  const noiseSelectors = ["script", "style", "nav", "header", "footer", "aside", "noscript", "iframe"];
  noiseSelectors.forEach((sel) => {
    body.querySelectorAll(sel).forEach((el) => el.remove());
  });

  // Try to find the main article container
  const candidates = [
    body.querySelector("article"),
    body.querySelector('[role="main"]'),
    body.querySelector("main"),
    body.querySelector(".article-body"),
    body.querySelector(".post-content"),
    body.querySelector(".entry-content"),
    body.querySelector("#article-body"),
    body.querySelector("#content"),
    body,
  ];

  const el = candidates.find((c): c is HTMLElement => c !== null && c instanceof HTMLElement);
  if (!el) return null;

  const text = (el.innerText ?? el.textContent ?? "").trim();

  if (text.length < 100) {
    // Too short — likely a login wall or empty page
    return null;
  }

  return {
    text,
    title: document.title,
  };
}

// ===== Text Highlight Engine =====
// Uses a buffer-based approach to handle excerpts that span inline elements.
// Builds a flattened text representation of the DOM with references back to
// the specific text nodes and their offsets, then locates excerpt matches
// and wraps them using a DOM Range.

interface TextNodeEntry {
  node: Text;
  start: number; // offset of this node's start in the flat buffer
  end: number;   // offset of this node's end (exclusive) in the flat buffer
}

function buildTextBuffer(root: Element): { buffer: string; entries: TextNodeEntry[] } {
  const entries: TextNodeEntry[] = [];
  let buffer = "";

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      // Skip text in script/style/noscript
      const parent = node.parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;
      const tag = parent.tagName.toLowerCase();
      if (["script", "style", "noscript", "textarea"].includes(tag)) {
        return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  let node: Node | null;
  while ((node = walker.nextNode())) {
    const textNode = node as Text;
    const text = textNode.textContent ?? "";
    if (text.length === 0) continue;

    const start = buffer.length;
    buffer += text;
    const end = buffer.length;
    entries.push({ node: textNode, start, end });
  }

  return { buffer, entries };
}

function findMatchRange(
  bufferLower: string,
  entries: TextNodeEntry[],
  excerptLower: string
): { startEntry: TextNodeEntry; startOffset: number; endEntry: TextNodeEntry; endOffset: number } | null {
  // Try to find an exact substring match first, then fall back to partial match
  let matchStart = bufferLower.indexOf(excerptLower);

  if (matchStart === -1) {
    // Try partial match: first 60 chars of excerpt (handles truncated excerpts)
    const partial = excerptLower.slice(0, 60).trim();
    if (partial.length < 20) return null;
    matchStart = bufferLower.indexOf(partial);
    if (matchStart === -1) return null;
  }

  const matchEnd = matchStart + excerptLower.length;

  // Find which text nodes contain the match start and end
  const startEntry = entries.find((e) => e.start <= matchStart && e.end > matchStart);
  const endEntry = entries.find((e) => e.start < matchEnd && e.end >= matchEnd);

  if (!startEntry || !endEntry) return null;

  return {
    startEntry,
    startOffset: matchStart - startEntry.start,
    endEntry,
    endOffset: matchEnd - endEntry.start,
  };
}

type HighlightElement = HTMLElement;

function highlightExcerpts(
  citations: ResolvedArticleCitation[],
  onHighlightClick: (citation: ResolvedArticleCitation, citationIndex: number, rect: DOMRect) => void
): HighlightElement[] {
  // Find the best root element to search for text within
  const root =
    document.querySelector<Element>("article") ??
    document.querySelector<Element>('[role="main"]') ??
    document.querySelector<Element>("main") ??
    document.body;

  const { buffer, entries } = buildTextBuffer(root);
  const bufferLower = buffer.toLowerCase();

  const highlightEls: HighlightElement[] = [];

  citations.forEach((citation, citationIndex) => {
    const excerptLower = citation.excerpt.toLowerCase();
    const match = findMatchRange(bufferLower, entries, excerptLower);

    if (!match) {
      console.debug(`CiteCast article: could not locate excerpt for citation ${citationIndex}:`, citation.excerpt.slice(0, 80));
      return;
    }

    try {
      const range = document.createRange();
      range.setStart(match.startEntry.node, match.startOffset);
      range.setEnd(match.endEntry.node, match.endOffset);

      const mark = document.createElement("mark");
      mark.className = "citecast-highlight";
      mark.dataset.citationIndex = String(citationIndex);
      mark.setAttribute("data-citecast-index", String(citationIndex));
      mark.title = citation.claim;

      range.surroundContents(mark);

      mark.addEventListener("click", (e) => {
        e.stopPropagation();
        const rect = mark.getBoundingClientRect();
        onHighlightClick(citation, citationIndex, rect);
      });

      highlightEls.push(mark);
    } catch (err) {
      // surroundContents fails when the range spans multiple block elements
      // In that case, we skip the highlight for this citation
      console.debug(`CiteCast article: could not wrap citation ${citationIndex}:`, err);
    }
  });

  return highlightEls;
}

// ===== Shadow DOM Setup =====

function createShadowHost(): { host: HTMLElement; root: ShadowRoot } {
  const host = document.createElement("div");
  host.id = "citecast-article-host";
  host.style.cssText = [
    "position: fixed",
    "top: 0",
    "left: 0",
    "width: 0",
    "height: 0",
    "z-index: 2147483647",
    "pointer-events: none",
    "overflow: visible",
  ].join(";");

  document.body.appendChild(host);

  const root = host.attachShadow({ mode: "open" });

  // Inject styles into shadow root
  const styleEl = document.createElement("style");
  styleEl.textContent = contentStyles;
  root.appendChild(styleEl);

  // Inner host div — pointer-events auto so UI is interactive
  const innerHost = document.createElement("div");
  innerHost.style.cssText = "position:fixed;top:0;left:0;width:0;height:0;overflow:visible;pointer-events:none;";
  root.appendChild(innerHost);

  // Proxy root so appendChild targets innerHost
  const proxyRoot = new Proxy(root, {
    get(target, prop) {
      if (prop === "appendChild" || prop === "append") {
        return (child: Node) => innerHost.appendChild(child);
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const value = (target as any)[prop];
      return typeof value === "function" ? value.bind(target) : value;
    },
  });

  return { host, root: proxyRoot as ShadowRoot };
}

// ===== Main =====

async function main() {
  const articleContent = extractArticleContent();

  const { host, root } = createShadowHost();

  const overlay: ArticleOverlayManager = createArticleOverlay(root);
  const sidebar: ArticleSidebarManager = createArticleSidebar(root);

  if (!articleContent) {
    // Show error state — no readable content found
    console.warn("CiteCast article: no readable content found on this page.");
    // Show a brief error chip
    const errorChip = document.createElement("div");
    errorChip.className = "citecast-article-loading-chip";
    errorChip.textContent = "CiteCast: No readable article found on this page.";
    errorChip.style.background = "rgba(200,50,50,0.92)";
    root.appendChild(errorChip);
    setTimeout(() => errorChip.remove(), 4000);
    return;
  }

  // Show loading state
  overlay.showLoading();

  // Fetch settings and annotations in parallel
  const [settings, response] = await Promise.all([
    getSettings(),
    fetchArticleAnnotations(location.href, articleContent.text, articleContent.title),
  ]);

  overlay.hideLoading();

  if ("error" in response) {
    console.warn("CiteCast article: annotation error:", response.message);
    const errorChip = document.createElement("div");
    errorChip.className = "citecast-article-loading-chip";
    errorChip.textContent = `CiteCast: ${response.message}`;
    errorChip.style.background = "rgba(200,50,50,0.92)";
    root.appendChild(errorChip);
    setTimeout(() => errorChip.remove(), 5000);
    return;
  }

  const annotations = response as ArticleAnnotation;

  // Filter citations
  const visibleCitations = annotations.citations.filter((c) => {
    if (!settings.includeLowConfidence && c.confidence === "low") return false;
    if (c.sources.length === 0) return false;
    return true;
  });

  if (visibleCitations.length === 0) {
    console.info("CiteCast article: no citations with sources found.");
    const infoChip = document.createElement("div");
    infoChip.className = "citecast-article-loading-chip";
    infoChip.textContent = "CiteCast: No verifiable citations found in this article.";
    root.appendChild(infoChip);
    setTimeout(() => infoChip.remove(), 4000);
    return;
  }

  // Inject inline highlights into the page DOM
  highlightExcerpts(visibleCitations, (citation, _citationIndex, rect) => {
    overlay.showCardForCitation(citation, rect);
  });

  // Set up sidebar with all annotations (uses same filtering logic internally)
  sidebar.setAnnotations(annotations, settings);

  // Auto-open the sidebar after a short delay to signal success
  setTimeout(() => {
    sidebar.toggle();
  }, 400);
}

main().catch((err) => {
  console.error("CiteCast article: init error", err);
});
