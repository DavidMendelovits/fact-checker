import { VideoAnnotation } from "@citecast/shared";

const CACHE_TTL_SECONDS = 2592000; // 30 days

function isKvConfigured(): boolean {
  return !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

function getCacheKey(videoId: string): string {
  return `annotations:${videoId}`;
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
