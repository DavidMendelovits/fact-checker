import { fetchAnnotations, getSettings } from "./api.js";
import { createOverlay } from "./overlay.js";
import { createSidebar } from "./sidebar.js";
import type { OverlayManager } from "./overlay.js";
import type { SidebarManager } from "./sidebar.js";
import type { VideoAnnotation } from "@citecast/shared";

// Import CSS as a raw string so we can inject it into shadow DOM
import contentStyles from "../styles/content.css?raw";

// ===== State =====
let currentVideoId: string | null = null;
let shadowHost: HTMLElement | null = null;
let shadowRoot: ShadowRoot | null = null;
let overlayManager: OverlayManager | null = null;
let sidebarManager: SidebarManager | null = null;
let abortController: AbortController | null = null;
let timeupdateAbortController: AbortController | null = null;
let progressBarObserver: MutationObserver | null = null;
let playerObserver: MutationObserver | null = null;

// ===== Helpers =====

function getVideoId(): string | null {
  try {
    return new URL(location.href).searchParams.get("v");
  } catch {
    return null;
  }
}

function waitForElement<T extends Element>(
  selector: string,
  signal: AbortSignal,
  timeout = 15_000
): Promise<T | null> {
  return new Promise((resolve) => {
    const existing = document.querySelector<T>(selector);
    if (existing) {
      resolve(existing);
      return;
    }

    let timer: ReturnType<typeof setTimeout> | null = null;

    const observer = new MutationObserver(() => {
      const el = document.querySelector<T>(selector);
      if (el) {
        observer.disconnect();
        if (timer !== null) clearTimeout(timer);
        resolve(el);
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    timer = setTimeout(() => {
      observer.disconnect();
      resolve(null);
    }, timeout);

    signal.addEventListener("abort", () => {
      observer.disconnect();
      if (timer !== null) clearTimeout(timer);
      resolve(null);
    });
  });
}

// ===== Teardown =====

function teardown() {
  // Abort in-flight requests and observers
  abortController?.abort();
  abortController = null;

  timeupdateAbortController?.abort();
  timeupdateAbortController = null;

  // Destroy managers
  overlayManager?.destroy();
  overlayManager = null;

  sidebarManager?.destroy();
  sidebarManager = null;

  // Disconnect observers
  progressBarObserver?.disconnect();
  progressBarObserver = null;

  playerObserver?.disconnect();
  playerObserver = null;

  // Remove shadow host
  shadowHost?.remove();
  shadowHost = null;
  shadowRoot = null;

  currentVideoId = null;
}

// ===== Shadow DOM Setup =====

function attachShadowToPlayer(player: HTMLElement): { host: HTMLElement; root: ShadowRoot } {
  // Make player position relative if it isn't already
  const playerStyle = getComputedStyle(player);
  if (playerStyle.position === "static") {
    player.style.position = "relative";
  }

  const host = document.createElement("div");
  host.className = "citecast-host";
  host.style.cssText = "position:absolute;inset:0;pointer-events:none;z-index:9988;overflow:hidden;";
  player.appendChild(host);

  const root = host.attachShadow({ mode: "open" });

  // Inject styles into shadow root
  const styleEl = document.createElement("style");
  styleEl.textContent = contentStyles;
  root.appendChild(styleEl);

  // Allow pointer events on children
  const innerHost = document.createElement("div");
  // pointer-events:none so our overlay does NOT block YouTube's player controls.
  // Each interactive CiteCast element opts back in via pointer-events:auto in CSS.
  innerHost.style.cssText = "position:absolute;inset:0;pointer-events:none;overflow:hidden;";
  root.appendChild(innerHost);

  // Return an augmented root that appends to innerHost
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

// ===== Progress Bar Markers =====

function attachProgressBarMarkers(
  player: HTMLElement,
  overlay: OverlayManager,
  duration: number
) {
  const attachMarkers = () => {
    const progressBar = player.querySelector(".ytp-progress-bar");
    if (progressBar && duration > 0) {
      overlay.addTimelineMarkers(progressBar, duration);
    }
  };

  attachMarkers();

  // Re-attach if progress bar is re-created (theater mode, fullscreen)
  progressBarObserver?.disconnect();
  progressBarObserver = new MutationObserver(() => {
    const progressBar = player.querySelector(".ytp-progress-bar");
    if (progressBar) {
      overlay.addTimelineMarkers(progressBar, duration);
    }
  });
  progressBarObserver.observe(player, { childList: true, subtree: true });
}

// ===== Main Init =====

async function initForVideo(videoId: string) {
  const ac = new AbortController();
  abortController = ac;
  const { signal } = ac;

  // Wait for the player
  const player = await waitForElement<HTMLElement>("#movie_player", signal);
  if (!player || signal.aborted) return;

  // Set up shadow DOM
  const { host, root } = attachShadowToPlayer(player);
  shadowHost = host;
  shadowRoot = root;

  // Create managers
  const overlay = createOverlay(root);
  overlayManager = overlay;

  // Wait for video element
  const video = await waitForElement<HTMLVideoElement>("video.html5-main-video", signal);
  if (!video || signal.aborted) {
    overlay.destroy();
    return;
  }

  const sidebar = createSidebar(root, video);
  sidebarManager = sidebar;

  // Show loading
  overlay.showLoading();

  // Fetch settings + annotations in parallel
  const [settings, response] = await Promise.all([
    getSettings(),
    fetchAnnotations(videoId),
  ]);

  if (signal.aborted) return;

  overlay.hideLoading();

  if ("error" in response) {
    console.warn(`CiteCast: annotation error for ${videoId}:`, response.message);
    return;
  }

  const annotations = response as VideoAnnotation;

  overlay.setAnnotations(annotations, settings);
  sidebar.setAnnotations(annotations, settings);

  // Video duration (may not be set yet, wait a bit)
  const getDuration = (): number => {
    const dur = video.duration;
    return isFinite(dur) ? dur : 0;
  };

  const duration = getDuration() || (await new Promise<number>((res) => {
    if (video.readyState >= 1) { res(getDuration()); return; }
    const handler = () => { video.removeEventListener("loadedmetadata", handler); res(getDuration()); };
    video.addEventListener("loadedmetadata", handler);
    // Fallback timeout
    setTimeout(() => { video.removeEventListener("loadedmetadata", handler); res(getDuration()); }, 3000);
  }));

  if (!signal.aborted) {
    attachProgressBarMarkers(player, overlay, duration);
  }

  // Sync citation cards with video time
  timeupdateAbortController?.abort();
  const tuAc = new AbortController();
  timeupdateAbortController = tuAc;

  if (settings.autoShow) {
    video.addEventListener(
      "timeupdate",
      () => {
        if (!tuAc.signal.aborted) {
          overlay.syncToTime(video.currentTime);
        }
      },
      { signal: tuAc.signal }
    );
  }
}

// ===== SPA Navigation =====

function handleNavigation() {
  const newVideoId = getVideoId();

  if (!newVideoId) {
    teardown();
    return;
  }

  if (newVideoId === currentVideoId) {
    // Same video — no-op (e.g., seeking from a timestamp link)
    return;
  }

  // Tear down previous state
  teardown();

  currentVideoId = newVideoId;
  initForVideo(newVideoId).catch((err) => {
    console.error("CiteCast: init error", err);
  });
}

// ===== Entry Point =====

function main() {
  // Initial load
  const videoId = getVideoId();
  if (videoId) {
    currentVideoId = videoId;
    initForVideo(videoId).catch((err) => {
      console.error("CiteCast: init error", err);
    });
  }

  // Listen for YouTube SPA navigation
  document.addEventListener("yt-navigate-finish", handleNavigation);
}

main();
