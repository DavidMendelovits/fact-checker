import { describe, it, expect, vi, beforeEach } from "vitest";
import type { VideoAnnotation, RawCitation, Source, TranscriptSegment } from "@citecast/shared";

// ---- Mock modules before importing pipeline ----
vi.mock("../lib/transcript", () => ({
  fetchTranscript: vi.fn(),
  TranscriptUnavailableError: class TranscriptUnavailableError extends Error {
    constructor(videoId: string, reason?: string) {
      super(`No transcript available for video ${videoId}${reason ? `: ${reason}` : ""}`);
      this.name = "TranscriptUnavailableError";
    }
  },
}));

vi.mock("../lib/llm", () => ({
  getLLMProvider: vi.fn(),
}));

vi.mock("../lib/search", () => ({
  getSearchProviders: vi.fn(),
  routeClaim: vi.fn(),
}));

vi.mock("../lib/cache", () => ({
  getCachedAnnotation: vi.fn().mockResolvedValue(null),
  cacheAnnotation: vi.fn().mockResolvedValue(undefined),
}));

import { processVideo } from "../lib/pipeline";
import { fetchTranscript } from "../lib/transcript";
import { getLLMProvider } from "../lib/llm";
import { getSearchProviders, routeClaim } from "../lib/search";
import transcriptFixture from "./fixtures/transcript.json";
import goodCitationsFixture from "./fixtures/llm-response-good.json";

const mockFetchTranscript = vi.mocked(fetchTranscript);
const mockGetLLMProvider = vi.mocked(getLLMProvider);
const mockGetSearchProviders = vi.mocked(getSearchProviders);
const mockRouteClaim = vi.mocked(routeClaim);

const fakeTranscriptResult = {
  segments: transcriptFixture as TranscriptSegment[],
  quality: "good" as const,
};

const fakeSources: Source[] = [
  {
    url: "https://example.com/source",
    title: "Relevant Source Title",
    snippet: "This contains relevant keywords from the claim about mental health",
    provider: "brave",
  },
];

const fakeSearchProvider = {
  name: "brave",
  supports: ["general" as const],
  search: vi.fn().mockResolvedValue(fakeSources),
};

beforeEach(() => {
  vi.clearAllMocks();

  mockFetchTranscript.mockResolvedValue(fakeTranscriptResult);
  mockGetLLMProvider.mockReturnValue({
    name: "test-llm",
    extractCitations: vi.fn().mockResolvedValue(goodCitationsFixture as RawCitation[]),
  });
  mockGetSearchProviders.mockReturnValue({ brave: fakeSearchProvider });
  mockRouteClaim.mockReturnValue([fakeSearchProvider]);
});

describe("processVideo", () => {
  it("returns a VideoAnnotation with the correct video_id", async () => {
    const result = await processVideo("dQw4w9WgXcQ");
    expect(result.video_id).toBe("dQw4w9WgXcQ");
  });

  it("returns a VideoAnnotation with a processed_at ISO timestamp", async () => {
    const result = await processVideo("dQw4w9WgXcQ");
    expect(() => new Date(result.processed_at)).not.toThrow();
    const parsed = new Date(result.processed_at);
    expect(parsed.toISOString()).toBe(result.processed_at);
  });

  it("includes transcript_quality from the transcript fetch", async () => {
    const result = await processVideo("dQw4w9WgXcQ");
    expect(result.transcript_quality).toBe("good");
  });

  it("returns citations equal in count to LLM output", async () => {
    const result = await processVideo("dQw4w9WgXcQ");
    expect(result.citations).toHaveLength(goodCitationsFixture.length);
  });

  it("computes correct stats for all-resolved scenario", async () => {
    const result = await processVideo("dQw4w9WgXcQ");

    expect(result.stats.total_claims).toBe(goodCitationsFixture.length);
    expect(result.stats.resolved).toBe(goodCitationsFixture.length);
    expect(result.stats.unresolved).toBe(0);
  });

  it("counts unresolved citations when search returns nothing", async () => {
    // Make search provider return empty results for first citation only
    fakeSearchProvider.search
      .mockResolvedValueOnce([]) // First citation: no results
      .mockResolvedValue(fakeSources); // Rest: have results

    const result = await processVideo("dQw4w9WgXcQ");

    expect(result.stats.unresolved).toBe(1);
    expect(result.stats.resolved).toBe(goodCitationsFixture.length - 1);
  });

  it("each resolved citation has sources array", async () => {
    const result = await processVideo("dQw4w9WgXcQ");

    for (const citation of result.citations) {
      expect(Array.isArray(citation.sources)).toBe(true);
    }
  });

  it("calls fetchTranscript with the video ID", async () => {
    await processVideo("dQw4w9WgXcQ");
    expect(mockFetchTranscript).toHaveBeenCalledWith("dQw4w9WgXcQ");
  });

  it("calls LLM extractCitations with transcript segments", async () => {
    const mockExtract = vi.fn().mockResolvedValue(goodCitationsFixture as RawCitation[]);
    mockGetLLMProvider.mockReturnValue({ name: "test-llm", extractCitations: mockExtract });

    await processVideo("dQw4w9WgXcQ");

    expect(mockExtract).toHaveBeenCalledWith(fakeTranscriptResult.segments);
  });

  it("calls routeClaim for each raw citation", async () => {
    await processVideo("dQw4w9WgXcQ");
    expect(mockRouteClaim).toHaveBeenCalledTimes(goodCitationsFixture.length);
  });

  it("handles search provider throwing gracefully — marks citation as unresolved", async () => {
    fakeSearchProvider.search.mockRejectedValue(new Error("Network timeout"));

    const result = await processVideo("dQw4w9WgXcQ");

    // All citations should be unresolved since provider threw
    expect(result.stats.unresolved).toBe(goodCitationsFixture.length);
    expect(result.stats.resolved).toBe(0);
  });

  it("handles LLM returning empty array — no citations", async () => {
    mockGetLLMProvider.mockReturnValue({
      name: "test-llm",
      extractCitations: vi.fn().mockResolvedValue([]),
    });

    const result = await processVideo("dQw4w9WgXcQ");

    expect(result.citations).toHaveLength(0);
    expect(result.stats.total_claims).toBe(0);
    expect(result.stats.resolved).toBe(0);
    expect(result.stats.unresolved).toBe(0);
  });

  it("propagates TranscriptUnavailableError when transcript not found", async () => {
    const { TranscriptUnavailableError } = await import("../lib/transcript");
    mockFetchTranscript.mockRejectedValue(
      new TranscriptUnavailableError("dQw4w9WgXcQ", "No captions available")
    );

    await expect(processVideo("dQw4w9WgXcQ")).rejects.toThrow("No transcript available");
  });

  it("preserves citation fields from LLM output in resolved citations", async () => {
    const result = await processVideo("dQw4w9WgXcQ");
    const firstCitation = result.citations[0];
    const firstRaw = goodCitationsFixture[0];

    expect(firstCitation.start_time).toBe(firstRaw.start_time);
    expect(firstCitation.end_time).toBe(firstRaw.end_time);
    expect(firstCitation.claim).toBe(firstRaw.claim);
    expect(firstCitation.claim_type).toBe(firstRaw.claim_type);
    expect(firstCitation.search_query).toBe(firstRaw.search_query);
    expect(firstCitation.confidence).toBe(firstRaw.confidence);
  });

  it("transcript_quality is auto-generated when segments have no punctuation and are lowercase", async () => {
    const autoGenSegments: TranscriptSegment[] = Array.from({ length: 10 }, (_, i) => ({
      text: `this is segment ${i} with no punctuation`,
      start: i * 5,
      duration: 5,
    }));

    mockFetchTranscript.mockResolvedValue({
      segments: autoGenSegments,
      quality: "auto-generated",
    });

    const result = await processVideo("dQw4w9WgXcQ");
    expect(result.transcript_quality).toBe("auto-generated");
  });
});
