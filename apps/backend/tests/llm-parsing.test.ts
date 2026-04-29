import { describe, it, expect } from "vitest";
import { parseLLMResponse } from "../lib/llm/parse";
import goodFixture from "./fixtures/llm-response-good.json";
import badFixture from "./fixtures/llm-response-bad.json";

describe("parseLLMResponse", () => {
  describe("good fixture", () => {
    it("parses the good JSON array correctly", () => {
      const input = JSON.stringify(goodFixture);
      const result = parseLLMResponse(input);

      expect(result).toHaveLength(4);
    });

    it("returns correct claim types", () => {
      const input = JSON.stringify(goodFixture);
      const result = parseLLMResponse(input);

      const types = result.map((c) => c.claim_type);
      expect(types).toContain("book");
      expect(types).toContain("news_article");
      expect(types).toContain("statistic");
      expect(types).toContain("academic_paper");
    });

    it("preserves all required fields", () => {
      const input = JSON.stringify(goodFixture);
      const result = parseLLMResponse(input);

      for (const citation of result) {
        expect(typeof citation.start_time).toBe("number");
        expect(typeof citation.end_time).toBe("number");
        expect(typeof citation.spoken_text).toBe("string");
        expect(typeof citation.claim).toBe("string");
        expect(typeof citation.search_query).toBe("string");
        expect(["high", "medium", "low"]).toContain(citation.confidence);
      }
    });
  });

  describe("bad fixture (markdown fences, missing fields, invalid types)", () => {
    it("does not throw on malformed input", () => {
      const input = badFixture as string;
      expect(() => parseLLMResponse(input)).not.toThrow();
    });

    it("strips markdown fences and returns valid items", () => {
      const input = badFixture as string;
      const result = parseLLMResponse(input);

      // Should not return empty — at least some items should be valid
      expect(result.length).toBeGreaterThan(0);
    });

    it("skips items with missing required fields", () => {
      const input = badFixture as string;
      const result = parseLLMResponse(input);

      // Item #2 in bad fixture is missing end_time, claim_type, search_query, confidence
      // It should be excluded
      for (const citation of result) {
        expect(typeof citation.end_time).toBe("number");
        expect(typeof citation.claim_type).toBe("string");
        expect(typeof citation.search_query).toBe("string");
        expect(typeof citation.confidence).toBe("string");
      }
    });

    it("skips items with invalid claim_type", () => {
      const input = badFixture as string;
      const result = parseLLMResponse(input);

      const validTypes = [
        "academic_paper",
        "news_article",
        "book",
        "tweet",
        "video",
        "quote",
        "statistic",
        "general",
      ];

      for (const citation of result) {
        expect(validTypes).toContain(citation.claim_type);
      }
    });

    it("returns exactly 2 valid citations from the bad fixture", () => {
      // Bad fixture has:
      // Item 1: valid (book, all fields present)
      // Item 2: invalid (missing end_time, claim_type, search_query, confidence)
      // Item 3: invalid (invalid claim_type "invalid_type_xyz")
      // Item 4: valid (academic_paper, all fields present)
      const input = badFixture as string;
      const result = parseLLMResponse(input);

      expect(result).toHaveLength(2);
    });
  });

  describe("edge cases", () => {
    it("handles empty string gracefully", () => {
      expect(parseLLMResponse("")).toEqual([]);
    });

    it("handles empty array", () => {
      expect(parseLLMResponse("[]")).toEqual([]);
    });

    it("handles pure JSON garbage", () => {
      expect(parseLLMResponse("{not valid json")).toEqual([]);
    });

    it("handles object wrapper like {citations: [...]}", () => {
      const wrapped = JSON.stringify({
        citations: [
          {
            start_time: 0,
            end_time: 10,
            spoken_text: "test text",
            claim: "test claim",
            claim_type: "general",
            search_query: "test query",
            confidence: "low",
          },
        ],
      });

      const result = parseLLMResponse(wrapped);
      expect(result).toHaveLength(1);
      expect(result[0].claim_type).toBe("general");
    });

    it("strips leading/trailing markdown fences", () => {
      const withFences = "```json\n[]\n```";
      expect(parseLLMResponse(withFences)).toEqual([]);
    });

    it("handles markdown fences without language tag", () => {
      const withFences = "```\n[]\n```";
      expect(parseLLMResponse(withFences)).toEqual([]);
    });
  });
});
