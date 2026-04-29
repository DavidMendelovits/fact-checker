import { describe, it, expect } from "vitest";
import { parseArticleLLMResponse } from "../lib/llm/parse";

const goodArticleCitations = [
  {
    excerpt: "In her 2018 book iGen, psychologist Jean Twenge analyzed generational data from over a million teenagers",
    claim: "Jean Twenge's 2018 book iGen documented generational mental health declines.",
    claim_type: "book",
    search_query: "Jean Twenge iGen book 2018",
    confidence: "high",
  },
  {
    excerpt: "According to a 2023 Pew Research Center survey, 46 percent of teens say social media makes them feel worse",
    claim: "A 2023 Pew Research Center survey found that 46% of teens report social media makes them feel worse.",
    claim_type: "statistic",
    search_query: "Pew Research 2023 teens social media",
    confidence: "high",
  },
  {
    excerpt: "A 2022 paper in Nature Human Behaviour by Amy Orben and Andrew Przybylski",
    claim: "A 2022 Nature Human Behaviour paper found the association between screen time and adolescent well-being is small.",
    claim_type: "academic_paper",
    search_query: "Orben Przybylski 2022 Nature screen time",
    confidence: "high",
  },
];

describe("parseArticleLLMResponse", () => {
  describe("valid input", () => {
    it("parses a valid JSON array of article citations", () => {
      const input = JSON.stringify(goodArticleCitations);
      const result = parseArticleLLMResponse(input);
      expect(result).toHaveLength(3);
    });

    it("returns correct claim types", () => {
      const input = JSON.stringify(goodArticleCitations);
      const result = parseArticleLLMResponse(input);
      const types = result.map((c) => c.claim_type);
      expect(types).toContain("book");
      expect(types).toContain("statistic");
      expect(types).toContain("academic_paper");
    });

    it("preserves all required article fields", () => {
      const input = JSON.stringify(goodArticleCitations);
      const result = parseArticleLLMResponse(input);

      for (const citation of result) {
        expect(typeof citation.excerpt).toBe("string");
        expect(typeof citation.claim).toBe("string");
        expect(typeof citation.search_query).toBe("string");
        expect(["high", "medium", "low"]).toContain(citation.confidence);
        expect(typeof citation.claim_type).toBe("string");
      }
    });

    it("does not include start_time, end_time, or spoken_text fields", () => {
      const input = JSON.stringify(goodArticleCitations);
      const result = parseArticleLLMResponse(input);

      for (const citation of result) {
        expect((citation as Record<string, unknown>).start_time).toBeUndefined();
        expect((citation as Record<string, unknown>).end_time).toBeUndefined();
        expect((citation as Record<string, unknown>).spoken_text).toBeUndefined();
      }
    });
  });

  describe("invalid input filtering", () => {
    it("skips items missing the excerpt field", () => {
      const input = JSON.stringify([
        {
          // missing excerpt
          claim: "Some claim",
          claim_type: "general",
          search_query: "some query",
          confidence: "low",
        },
        {
          excerpt: "Valid excerpt from the article",
          claim: "Valid claim",
          claim_type: "general",
          search_query: "valid query",
          confidence: "medium",
        },
      ]);

      const result = parseArticleLLMResponse(input);
      expect(result).toHaveLength(1);
      expect(result[0].excerpt).toBe("Valid excerpt from the article");
    });

    it("skips items with invalid claim_type", () => {
      const input = JSON.stringify([
        {
          excerpt: "Some excerpt",
          claim: "Some claim",
          claim_type: "invalid_type_xyz",
          search_query: "some query",
          confidence: "high",
        },
        {
          excerpt: "Valid excerpt",
          claim: "Valid claim",
          claim_type: "news_article",
          search_query: "valid query",
          confidence: "high",
        },
      ]);

      const result = parseArticleLLMResponse(input);
      expect(result).toHaveLength(1);
      expect(result[0].claim_type).toBe("news_article");
    });

    it("skips items with invalid confidence", () => {
      const input = JSON.stringify([
        {
          excerpt: "Some excerpt",
          claim: "Some claim",
          claim_type: "general",
          search_query: "some query",
          confidence: "very_high",
        },
        {
          excerpt: "Valid excerpt",
          claim: "Valid claim",
          claim_type: "general",
          search_query: "valid query",
          confidence: "low",
        },
      ]);

      const result = parseArticleLLMResponse(input);
      expect(result).toHaveLength(1);
    });

    it("skips items missing claim field", () => {
      const input = JSON.stringify([
        {
          excerpt: "Some excerpt",
          // missing claim
          claim_type: "general",
          search_query: "some query",
          confidence: "high",
        },
      ]);

      const result = parseArticleLLMResponse(input);
      expect(result).toHaveLength(0);
    });
  });

  describe("format handling", () => {
    it("strips markdown fences", () => {
      const input = "```json\n" + JSON.stringify(goodArticleCitations) + "\n```";
      const result = parseArticleLLMResponse(input);
      expect(result).toHaveLength(3);
    });

    it("strips markdown fences without language tag", () => {
      const input = "```\n" + JSON.stringify(goodArticleCitations) + "\n```";
      const result = parseArticleLLMResponse(input);
      expect(result).toHaveLength(3);
    });

    it("handles object wrapper like {citations: [...]}", () => {
      const wrapped = JSON.stringify({ citations: goodArticleCitations });
      const result = parseArticleLLMResponse(wrapped);
      expect(result).toHaveLength(3);
    });

    it("handles empty array", () => {
      expect(parseArticleLLMResponse("[]")).toEqual([]);
    });

    it("handles empty string gracefully", () => {
      expect(parseArticleLLMResponse("")).toEqual([]);
    });

    it("handles pure JSON garbage", () => {
      expect(parseArticleLLMResponse("{not valid json")).toEqual([]);
    });

    it("does not throw on any input", () => {
      const inputs = ["", "null", "undefined", "{}", "[]", "not json at all", "123"];
      for (const input of inputs) {
        expect(() => parseArticleLLMResponse(input)).not.toThrow();
      }
    });
  });
});
