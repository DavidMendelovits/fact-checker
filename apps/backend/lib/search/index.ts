import { SearchProvider } from "./types";
import { BraveSearchProvider } from "./brave";
import { SemanticScholarProvider } from "./semantic-scholar";
import { PerplexityProvider } from "./perplexity";

export { routeClaim } from "./route";

export function getSearchProviders(): Record<string, SearchProvider> {
  const providers: Record<string, SearchProvider> = {};

  // Brave — requires BRAVE_API_KEY
  const braveKey = process.env.BRAVE_API_KEY;
  if (braveKey) {
    providers["brave"] = new BraveSearchProvider(braveKey);
  }

  // Semantic Scholar — no API key required, but uses one if provided
  const semanticScholarKey = process.env.SEMANTIC_SCHOLAR_API_KEY;
  providers["semantic-scholar"] = new SemanticScholarProvider(semanticScholarKey);

  // Perplexity — requires PERPLEXITY_API_KEY
  const perplexityKey = process.env.PERPLEXITY_API_KEY;
  if (perplexityKey) {
    providers["perplexity"] = new PerplexityProvider(perplexityKey);
  }

  return providers;
}
