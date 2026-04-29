import { NextRequest, NextResponse } from "next/server";
import { AnnotationError } from "@citecast/shared";
import { getCachedArticleAnnotation, cacheArticleAnnotation } from "@/lib/cache";
import { processArticle } from "@/lib/pipeline";

export const runtime = "nodejs";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    const error: AnnotationError = {
      error: "processing_failed",
      message: "Invalid JSON in request body.",
      citations: [],
    };
    return NextResponse.json(error, { status: 400, headers: CORS_HEADERS });
  }

  if (!body || typeof body !== "object") {
    const error: AnnotationError = {
      error: "processing_failed",
      message: "Request body must be a JSON object.",
      citations: [],
    };
    return NextResponse.json(error, { status: 400, headers: CORS_HEADERS });
  }

  const { url, text, title } = body as Record<string, unknown>;

  if (typeof url !== "string" || !url) {
    const error: AnnotationError = {
      error: "processing_failed",
      message: "Missing or invalid required field: url.",
      citations: [],
    };
    return NextResponse.json(error, { status: 400, headers: CORS_HEADERS });
  }

  if (typeof text !== "string" || !text) {
    const error: AnnotationError = {
      error: "no_content",
      message: "Missing or invalid required field: text.",
      citations: [],
    };
    return NextResponse.json(error, { status: 400, headers: CORS_HEADERS });
  }

  if (text.length >= 100_000) {
    const error: AnnotationError = {
      error: "no_content",
      message: "Article text is too long. Maximum is 100,000 characters.",
      citations: [],
    };
    return NextResponse.json(error, { status: 400, headers: CORS_HEADERS });
  }

  const articleTitle = typeof title === "string" ? title : undefined;

  // Check cache first
  try {
    const cached = await getCachedArticleAnnotation(url);
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
    console.warn("[route/article] Cache lookup failed:", err);
  }

  // Run the pipeline
  try {
    const annotation = await processArticle(url, text, articleTitle);

    // Store in cache (non-blocking, best effort)
    cacheArticleAnnotation(annotation).catch((err) => {
      console.warn("[route/article] Failed to cache article annotation:", err);
    });

    return NextResponse.json(annotation, {
      status: 200,
      headers: {
        ...CORS_HEADERS,
        "X-Cache": "MISS",
      },
    });
  } catch (err) {
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

    console.error("[route/article] Unexpected error processing article:", url, err);
    const error: AnnotationError = {
      error: "processing_failed",
      message: `Failed to process article: ${message}`,
      citations: [],
    };
    return NextResponse.json(error, { status: 500, headers: CORS_HEADERS });
  }
}
