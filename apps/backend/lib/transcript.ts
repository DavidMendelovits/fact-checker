import { TranscriptSegment, TranscriptQuality } from "@citecast/shared";

export class TranscriptUnavailableError extends Error {
  constructor(videoId: string, reason?: string) {
    super(`No transcript available for video ${videoId}${reason ? `: ${reason}` : ""}`);
    this.name = "TranscriptUnavailableError";
  }
}

function detectQuality(segments: TranscriptSegment[]): TranscriptQuality {
  if (segments.length === 0) return "poor";

  // Check for auto-generated characteristics:
  // - No sentence-ending punctuation (. ! ?)
  // - All or mostly lowercase text
  let noPunctuationCount = 0;
  let allLowercaseCount = 0;

  for (const seg of segments) {
    const text = seg.text.trim();
    if (!text) continue;

    if (!/[.!?]$/.test(text)) {
      noPunctuationCount++;
    }

    // Check if the text is all lowercase (ignoring whitespace and numbers)
    const letters = text.replace(/[^a-zA-Z]/g, "");
    if (letters && letters === letters.toLowerCase()) {
      allLowercaseCount++;
    }
  }

  const ratio = segments.length > 0 ? noPunctuationCount / segments.length : 0;
  const lowercaseRatio = segments.length > 0 ? allLowercaseCount / segments.length : 0;

  if (ratio > 0.7 && lowercaseRatio > 0.7) {
    return "auto-generated";
  }

  return "good";
}

export async function fetchTranscript(
  videoId: string
): Promise<{ segments: TranscriptSegment[]; quality: TranscriptQuality }> {
  // Dynamically import to avoid issues at build time
  const { YoutubeTranscript } = await import("youtube-transcript");

  let rawSegments: Array<{ text: string; offset: number; duration: number }>;

  try {
    rawSegments = await YoutubeTranscript.fetchTranscript(videoId);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    const lowerMessage = message.toLowerCase();

    // Map known error patterns to TranscriptUnavailableError
    if (
      lowerMessage.includes("no transcript") ||
      lowerMessage.includes("transcript disabled") ||
      lowerMessage.includes("could not retrieve") ||
      lowerMessage.includes("subtitles are disabled") ||
      lowerMessage.includes("video unavailable") ||
      lowerMessage.includes("private video") ||
      lowerMessage.includes("404")
    ) {
      throw new TranscriptUnavailableError(videoId, message);
    }

    // Re-throw unknown errors as transcript unavailable to be safe at API boundary
    throw new TranscriptUnavailableError(videoId, message);
  }

  if (!rawSegments || rawSegments.length === 0) {
    throw new TranscriptUnavailableError(videoId, "Empty transcript returned");
  }

  const segments: TranscriptSegment[] = rawSegments.map((seg) => ({
    text: seg.text,
    start: seg.offset / 1000, // youtube-transcript returns offset in ms
    duration: seg.duration / 1000,
  }));

  const quality = detectQuality(segments);

  return { segments, quality };
}
