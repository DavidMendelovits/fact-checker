import { RawCitation, ClaimType, Confidence } from "@citecast/shared";

const VALID_CLAIM_TYPES: ClaimType[] = [
  "academic_paper",
  "news_article",
  "book",
  "tweet",
  "video",
  "quote",
  "statistic",
  "general",
];

const VALID_CONFIDENCE: Confidence[] = ["high", "medium", "low"];

function isValidClaimType(value: unknown): value is ClaimType {
  return typeof value === "string" && VALID_CLAIM_TYPES.includes(value as ClaimType);
}

function isValidConfidence(value: unknown): value is Confidence {
  return typeof value === "string" && VALID_CONFIDENCE.includes(value as Confidence);
}

function stripMarkdownFences(text: string): string {
  // Strip ```json ... ``` or ``` ... ``` wrappers
  return text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/, "");
}

function validateCitation(item: unknown): item is RawCitation {
  if (!item || typeof item !== "object") return false;
  const obj = item as Record<string, unknown>;

  return (
    typeof obj.start_time === "number" &&
    typeof obj.end_time === "number" &&
    typeof obj.spoken_text === "string" &&
    typeof obj.claim === "string" &&
    typeof obj.search_query === "string" &&
    isValidClaimType(obj.claim_type) &&
    isValidConfidence(obj.confidence)
  );
}

export function parseLLMResponse(raw: string): RawCitation[] {
  let text = raw.trim();

  // Strip markdown fences if present
  text = stripMarkdownFences(text);

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    // Maybe it's wrapped in an object like {"citations": [...]}
    // Try to extract an array substring
    const arrayMatch = text.match(/\[[\s\S]*\]/);
    if (!arrayMatch) {
      console.error("[llm/parse] Failed to parse JSON from LLM response");
      return [];
    }
    try {
      parsed = JSON.parse(arrayMatch[0]);
    } catch {
      console.error("[llm/parse] Failed to parse extracted array from LLM response");
      return [];
    }
  }

  // Handle object wrapper like {"citations": [...]}
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    const obj = parsed as Record<string, unknown>;
    const arrayKey = Object.keys(obj).find((k) => Array.isArray(obj[k]));
    if (arrayKey) {
      parsed = obj[arrayKey];
    } else {
      return [];
    }
  }

  if (!Array.isArray(parsed)) {
    return [];
  }

  // Validate each item and filter out invalid ones
  const valid: RawCitation[] = [];
  for (const item of parsed) {
    if (validateCitation(item)) {
      valid.push(item as RawCitation);
    } else {
      console.warn("[llm/parse] Skipping invalid citation item:", item);
    }
  }

  return valid;
}
