import { createHash } from "crypto";
import { VideoAnnotation, ArticleAnnotation } from "@citecast/shared";

const CACHE_TTL_SECONDS = 2592000; // 30 days

function isKvConfigured(): boolean {
  return !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

function getCacheKey(videoId: string): string {
  return `annotations:${videoId}`;
}

function getArticleCacheKey(url: string): string {
  const hash = createHash("sha256").update(url).digest("hex");
  return `article:${hash}`;
}

export async function getCachedAnnotation(videoId: string): Promise<VideoAnnotation | null> {
  if (!isKvConfigured()) {
    return null;
  }

  try {
    const { kv } = await import("@vercel/kv");
    const cached = await kv.get<VideoAnnotation>(getCacheKey(videoId));
    return cached ?? null;
  } catch (err) {
    console.warn("[cache] Failed to get cached annotation:", err);
    return null;
  }
}

export async function cacheAnnotation(annotation: VideoAnnotation): Promise<void> {
  if (!isKvConfigured()) {
    return;
  }

  try {
    const { kv } = await import("@vercel/kv");
    await kv.set(getCacheKey(annotation.video_id), annotation, { ex: CACHE_TTL_SECONDS });
  } catch (err) {
    console.warn("[cache] Failed to cache annotation:", err);
    // Non-fatal — continue without caching
  }
}

export async function getCachedArticleAnnotation(url: string): Promise<ArticleAnnotation | null> {
  if (!isKvConfigured()) {
    return null;
  }

  try {
    const { kv } = await import("@vercel/kv");
    const cached = await kv.get<ArticleAnnotation>(getArticleCacheKey(url));
    return cached ?? null;
  } catch (err) {
    console.warn("[cache] Failed to get cached article annotation:", err);
    return null;
  }
}

export async function cacheArticleAnnotation(annotation: ArticleAnnotation): Promise<void> {
  if (!isKvConfigured()) {
    return;
  }

  try {
    const { kv } = await import("@vercel/kv");
    await kv.set(getArticleCacheKey(annotation.url), annotation, { ex: CACHE_TTL_SECONDS });
  } catch (err) {
    console.warn("[cache] Failed to cache article annotation:", err);
    // Non-fatal — continue without caching
  }
}
