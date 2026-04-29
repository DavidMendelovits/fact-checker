import { ClaimType, RawCitation } from "@citecast/shared";
import { SearchProvider } from "./types";

type ProviderName = "semantic-scholar" | "brave" | "perplexity";

type RoutingTable = Partial<Record<ClaimType, ProviderName[]>>;

const DEFAULT_ROUTING: Record<ClaimType, ProviderName[]> = {
  academic_paper: ["semantic-scholar", "brave"],
  news_article: ["brave", "perplexity"],
  book: ["brave"],
  tweet: ["brave", "perplexity"],
  video: ["brave", "perplexity"],
  quote: ["brave", "perplexity"],
  statistic: ["brave", "perplexity"],
  general: ["brave", "perplexity"],
};

function getRoutingTable(): Record<ClaimType, ProviderName[]> {
  const envRouting = process.env.SEARCH_ROUTING_JSON;
  if (!envRouting) {
    return DEFAULT_ROUTING;
  }

  try {
    const parsed: RoutingTable = JSON.parse(envRouting);
    // Merge with defaults so any missing keys fall back
    return { ...DEFAULT_ROUTING, ...parsed } as Record<ClaimType, ProviderName[]>;
  } catch (err) {
    console.warn("[search/route] Failed to parse SEARCH_ROUTING_JSON, using defaults:", err);
    return DEFAULT_ROUTING;
  }
}

export function routeClaim(
  claim: RawCitation,
  providers: Record<string, SearchProvider>
): SearchProvider[] {
  const routing = getRoutingTable();
  const providerNames = routing[claim.claim_type] ?? DEFAULT_ROUTING.general;

  return providerNames
    .map((name) => providers[name])
    .filter((p): p is SearchProvider => p !== undefined);
}
