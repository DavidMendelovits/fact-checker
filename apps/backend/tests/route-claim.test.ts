import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { routeClaim } from "../lib/search/route";
import { SearchProvider } from "../lib/search/types";
import { RawCitation, ClaimType } from "@citecast/shared";

// Build a minimal fake provider factory
function makeProvider(name: string, supports: ClaimType[]): SearchProvider {
  return {
    name,
    supports,
    search: vi.fn().mockResolvedValue([]),
  };
}

const fakeProviders: Record<string, SearchProvider> = {
  "semantic-scholar": makeProvider("semantic-scholar", ["academic_paper"]),
  brave: makeProvider("brave", [
    "academic_paper",
    "news_article",
    "book",
    "tweet",
    "video",
    "quote",
    "statistic",
    "general",
  ]),
  perplexity: makeProvider("perplexity", [
    "academic_paper",
    "news_article",
    "book",
    "tweet",
    "video",
    "quote",
    "statistic",
    "general",
  ]),
};

function makeClaim(claim_type: ClaimType): RawCitation {
  return {
    start_time: 0,
    end_time: 10,
    spoken_text: "test",
    claim: "test claim",
    claim_type,
    search_query: "test query",
    confidence: "high",
  };
}

describe("routeClaim", () => {
  beforeEach(() => {
    delete process.env.SEARCH_ROUTING_JSON;
  });

  afterEach(() => {
    delete process.env.SEARCH_ROUTING_JSON;
  });

  it("routes academic_paper to semantic-scholar first, then brave", () => {
    const result = routeClaim(makeClaim("academic_paper"), fakeProviders);
    expect(result.map((p) => p.name)).toEqual(["semantic-scholar", "brave"]);
  });

  it("routes news_article to brave first, then perplexity", () => {
    const result = routeClaim(makeClaim("news_article"), fakeProviders);
    expect(result.map((p) => p.name)).toEqual(["brave", "perplexity"]);
  });

  it("routes book to brave only", () => {
    const result = routeClaim(makeClaim("book"), fakeProviders);
    expect(result.map((p) => p.name)).toEqual(["brave"]);
  });

  it("routes tweet to brave and perplexity", () => {
    const result = routeClaim(makeClaim("tweet"), fakeProviders);
    expect(result.map((p) => p.name)).toEqual(["brave", "perplexity"]);
  });

  it("routes video to brave and perplexity", () => {
    const result = routeClaim(makeClaim("video"), fakeProviders);
    expect(result.map((p) => p.name)).toEqual(["brave", "perplexity"]);
  });

  it("routes statistic to brave and perplexity", () => {
    const result = routeClaim(makeClaim("statistic"), fakeProviders);
    expect(result.map((p) => p.name)).toEqual(["brave", "perplexity"]);
  });

  it("routes general to brave and perplexity", () => {
    const result = routeClaim(makeClaim("general"), fakeProviders);
    expect(result.map((p) => p.name)).toEqual(["brave", "perplexity"]);
  });

  it("skips providers that are not configured", () => {
    const limitedProviders = { brave: fakeProviders.brave };
    const result = routeClaim(makeClaim("academic_paper"), limitedProviders);
    // semantic-scholar missing, so only brave should be returned
    expect(result.map((p) => p.name)).toEqual(["brave"]);
  });

  it("returns empty array when no configured providers match", () => {
    const emptyProviders = {};
    const result = routeClaim(makeClaim("academic_paper"), emptyProviders);
    expect(result).toEqual([]);
  });

  describe("SEARCH_ROUTING_JSON override", () => {
    it("uses custom routing when SEARCH_ROUTING_JSON is set", () => {
      process.env.SEARCH_ROUTING_JSON = JSON.stringify({
        academic_paper: ["brave"],
      });

      const result = routeClaim(makeClaim("academic_paper"), fakeProviders);
      expect(result.map((p) => p.name)).toEqual(["brave"]);
    });

    it("falls back to defaults for types not in SEARCH_ROUTING_JSON", () => {
      process.env.SEARCH_ROUTING_JSON = JSON.stringify({
        academic_paper: ["perplexity"],
      });

      // news_article not overridden, should use defaults
      const result = routeClaim(makeClaim("news_article"), fakeProviders);
      expect(result.map((p) => p.name)).toEqual(["brave", "perplexity"]);
    });

    it("falls back to defaults on invalid JSON in SEARCH_ROUTING_JSON", () => {
      process.env.SEARCH_ROUTING_JSON = "not valid json {{{";

      const result = routeClaim(makeClaim("academic_paper"), fakeProviders);
      expect(result.map((p) => p.name)).toEqual(["semantic-scholar", "brave"]);
    });

    it("allows remapping multiple claim types", () => {
      process.env.SEARCH_ROUTING_JSON = JSON.stringify({
        news_article: ["perplexity"],
        book: ["brave", "perplexity"],
      });

      const newsResult = routeClaim(makeClaim("news_article"), fakeProviders);
      expect(newsResult.map((p) => p.name)).toEqual(["perplexity"]);

      const bookResult = routeClaim(makeClaim("book"), fakeProviders);
      expect(bookResult.map((p) => p.name)).toEqual(["brave", "perplexity"]);
    });
  });
});
