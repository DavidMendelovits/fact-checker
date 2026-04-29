import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ArticleAnnotation, RawArticleCitation, Source } from "@citecast/shared";

// ---- Mock modules before importing pipeline ----
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
  getCachedArticleAnnotation: vi.fn().mockResolvedValue(null),
  cacheArticleAnnotation: vi.fn().mockResolvedValue(undefined),
}));

import { processArticle } from "../lib/pipeline";
import { getLLMProvider } from "../lib/llm";
import { getSearchProviders, routeClaim } from "../lib/search";
import articleFixture from "./fixtures/article-text.json";

const mockGetLLMProvider = vi.mocked(getLLMProvider);
const mockGetSearchProviders = vi.mocked(getSearchProviders);
const mockRouteClaim = vi.mocked(routeClaim);

const fakeArticleCitations: RawArticleCitation[] = [
  {
    excerpt: "In her 2018 book iGen, psychologist Jean Twenge analyzed generational data from over a million teenagers",
    claim: "Jean Twenge's 2018 book iGen documented generational mental health declines correlated with smartphone adoption, based on data from over a million teenagers.",
    claim_type: "book",
    search_query: "Jean Twenge iGen book 2018 teenagers mental health",
    confidence: "high",
  },
  {
    excerpt: "According to a 2023 Pew Research Center survey, 46 percent of teens say social media makes them feel worse about their own lives",
    claim: "A 2023 Pew Research Center survey found that 46% of teens report social media makes them feel worse about their own lives.",
    claim_type: "statistic",
    search_query: "Pew Research 2023 teens social media feel worse lives",
    confidence: "high",
  },
  {
    excerpt: "A 2022 paper published in Nature Human Behaviour by Amy Orben and Andrew Przybylski found that the association between screen time and adolescent well-being is actually quite small",
    claim: "A 2022 Nature Human Behaviour paper by Amy Orben and Andrew Przybylski found the association between screen time and adolescent well-being is small.",
    claim_type: "academic_paper",
    search_query: "Orben Przybylski 2022 Nature Human Behaviour screen time adolescent wellbeing",
    confidence: "high",
  },
];

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

  mockGetLLMProvider.mockReturnValue({
    name: "test-llm",
    extractCitations: vi.fn().mockResolvedValue([]),
    extractArticleCitations: vi.fn().mockResolvedValue(fakeArticleCitations),
  });
  mockGetSearchProviders.mockReturnValue({ brave: fakeSearchProvider });
  mockRouteClaim.mockReturnValue([fakeSearchProvider]);
});

describe("processArticle", () => {
  it("returns an ArticleAnnotation with the correct url", async () => {
    const result = await processArticle(articleFixture.url, articleFixture.text, articleFixture.title);
    expect(result.url).toBe(articleFixture.url);
  });

  it("returns an ArticleAnnotation with the correct title", async () => {
    const result = await processArticle(articleFixture.url, articleFixture.text, articleFixture.title);
    expect(result.title).toBe(articleFixture.title);
  });

  it("returns an ArticleAnnotation with empty title when not provided", async () => {
    const result = await processArticle(articleFixture.url, articleFixture.text);
    expect(result.title).toBe("");
  });

  it("returns an ArticleAnnotation with a processed_at ISO timestamp", async () => {
    const result = await processArticle(articleFixture.url, articleFixture.text, articleFixture.title);
    expect(() => new Date(result.processed_at)).not.toThrow();
    const parsed = new Date(result.processed_at);
    expect(parsed.toISOString()).toBe(result.processed_at);
  });

  it("returns citations equal in count to LLM output", async () => {
    const result = await processArticle(articleFixture.url, articleFixture.text, articleFixture.title);
    expect(result.citations).toHaveLength(fakeArticleCitations.length);
  });

  it("computes correct stats for all-resolved scenario", async () => {
    const result = await processArticle(articleFixture.url, articleFixture.text, articleFixture.title);
    expect(result.stats.total_claims).toBe(fakeArticleCitations.length);
    expect(result.stats.resolved).toBe(fakeArticleCitations.length);
    expect(result.stats.unresolved).toBe(0);
  });

  it("counts unresolved citations when search returns nothing", async () => {
    fakeSearchProvider.search
      .mockResolvedValueOnce([]) // First citation: no results
      .mockResolvedValue(fakeSources); // Rest: have results

    const result = await processArticle(articleFixture.url, articleFixture.text, articleFixture.title);
    expect(result.stats.unresolved).toBe(1);
    expect(result.stats.resolved).toBe(fakeArticleCitations.length - 1);
  });

  it("each resolved citation has sources array", async () => {
    const result = await processArticle(articleFixture.url, articleFixture.text, articleFixture.title);
    for (const citation of result.citations) {
      expect(Array.isArray(citation.sources)).toBe(true);
    }
  });

  it("calls LLM extractArticleCitations with text and title", async () => {
    const mockExtract = vi.fn().mockResolvedValue(fakeArticleCitations);
    mockGetLLMProvider.mockReturnValue({
      name: "test-llm",
      extractCitations: vi.fn().mockResolvedValue([]),
      extractArticleCitations: mockExtract,
    });

    await processArticle(articleFixture.url, articleFixture.text, articleFixture.title);

    expect(mockExtract).toHaveBeenCalledWith(articleFixture.text, articleFixture.title);
  });

  it("calls routeClaim for each raw citation", async () => {
    await processArticle(articleFixture.url, articleFixture.text, articleFixture.title);
    expect(mockRouteClaim).toHaveBeenCalledTimes(fakeArticleCitations.length);
  });

  it("handles search provider throwing gracefully — marks citation as unresolved", async () => {
    fakeSearchProvider.search.mockRejectedValue(new Error("Network timeout"));

    const result = await processArticle(articleFixture.url, articleFixture.text, articleFixture.title);

    expect(result.stats.unresolved).toBe(fakeArticleCitations.length);
    expect(result.stats.resolved).toBe(0);
  });

  it("handles LLM returning empty array — no citations", async () => {
    mockGetLLMProvider.mockReturnValue({
      name: "test-llm",
      extractCitations: vi.fn().mockResolvedValue([]),
      extractArticleCitations: vi.fn().mockResolvedValue([]),
    });

    const result = await processArticle(articleFixture.url, articleFixture.text, articleFixture.title);

    expect(result.citations).toHaveLength(0);
    expect(result.stats.total_claims).toBe(0);
    expect(result.stats.resolved).toBe(0);
    expect(result.stats.unresolved).toBe(0);
  });

  it("preserves citation fields from LLM output in resolved citations", async () => {
    const result = await processArticle(articleFixture.url, articleFixture.text, articleFixture.title);
    const firstCitation = result.citations[0];
    const firstRaw = fakeArticleCitations[0];

    expect(firstCitation.excerpt).toBe(firstRaw.excerpt);
    expect(firstCitation.claim).toBe(firstRaw.claim);
    expect(firstCitation.claim_type).toBe(firstRaw.claim_type);
    expect(firstCitation.search_query).toBe(firstRaw.search_query);
    expect(firstCitation.confidence).toBe(firstRaw.confidence);
  });

  it("citations have excerpt field instead of start_time/end_time", async () => {
    const result = await processArticle(articleFixture.url, articleFixture.text, articleFixture.title);
    const firstCitation = result.citations[0];

    expect(typeof firstCitation.excerpt).toBe("string");
    expect((firstCitation as Record<string, unknown>).start_time).toBeUndefined();
    expect((firstCitation as Record<string, unknown>).end_time).toBeUndefined();
  });
});
