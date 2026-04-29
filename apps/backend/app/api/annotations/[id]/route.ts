import { NextRequest, NextResponse } from "next/server";
import { AnnotationError } from "@citecast/shared";
import { getCachedAnnotation, cacheAnnotation } from "@/lib/cache";
import { processVideo } from "@/lib/pipeline";
import { TranscriptUnavailableError } from "@/lib/transcript";

export const runtime = "nodejs";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id: videoId } = await context.params;

  if (!videoId || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
    const error: AnnotationError = {
      error: "processing_failed",
      message: `Invalid YouTube video ID: "${videoId}"`,
      citations: [],
    };
    return NextResponse.json(error, { status: 400, headers: CORS_HEADERS });
  }

  // Check cache first
  try {
    const cached = await getCachedAnnotation(videoId);
    if (cached) {
      return NextResponse.json(cached, {
        status: 200,
        headers: {
          ...CORS_HEADERS,
          "X-Cache": "HIT",
        },
      });
    }
  } catch (err) {
    // Non-fatal — continue to process
    console.warn("[route] Cache lookup failed:", err);
  }

  // Run the pipeline
  try {
    const annotation = await processVideo(videoId);

    // Store in cache (non-blocking, best effort)
    cacheAnnotation(annotation).catch((err) => {
      console.warn("[route] Failed to cache annotation:", err);
    });

    return NextResponse.json(annotation, {
      status: 200,
      headers: {
        ...CORS_HEADERS,
        "X-Cache": "MISS",
      },
    });
  } catch (err) {
    if (err instanceof TranscriptUnavailableError) {
      const error: AnnotationError = {
        error: "no_transcript",
        message: err.message,
        citations: [],
      };
      return NextResponse.json(error, { status: 404, headers: CORS_HEADERS });
    }

    // Check for rate limit patterns
    const message = err instanceof Error ? err.message : String(err);
    if (
      message.toLowerCase().includes("rate limit") ||
      message.toLowerCase().includes("429") ||
      message.toLowerCase().includes("too many requests")
    ) {
      const error: AnnotationError = {
        error: "rate_limit",
        message: "Rate limit reached. Please try again later.",
        citations: [],
      };
      return NextResponse.json(error, { status: 429, headers: CORS_HEADERS });
    }

    console.error("[route] Unexpected error processing video:", videoId, err);
    const error: AnnotationError = {
      error: "processing_failed",
      message: `Failed to process video: ${message}`,
      citations: [],
    };
    return NextResponse.json(error, { status: 500, headers: CORS_HEADERS });
  }
}
