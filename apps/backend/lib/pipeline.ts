import { VideoAnnotation, ArticleAnnotation, RawCitation, ResolvedCitation, RawArticleCitation, ResolvedArticleCitation, Source } from "@citecast/shared";
import { fetchTranscript } from "./transcript";
import { getLLMProvider } from "./llm";
import { getSearchProviders, routeClaim } from "./search";
import { SearchProvider, BaseClaim } from "./search/types";

const STOPWORDS = new Set([
  "the", "a", "an", "of", "in", "on", "at", "to", "for",
  "and", "or", "is", "are", "was", "were", "be", "been",
  "by", "as", "from", "that", "this", "it", "with",
]);

function extractKeywords(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[\s,;.!?()\[\]"']+/)
    .filter((token) => token.length >= 3 && !STOPWORDS.has(token));
}

function isSourceRelevant(source: Source, claim: BaseClaim): boolean {
  const keywords = extractKeywords(claim.claim);
  if (keywords.length === 0) return true; // Nothing to check against

  const searchable = `${source.title} ${source.snippet}`.toLowerCase();
  return keywords.some((kw) => searchable.includes(kw));
}

async function resolveCitation(
  citation: BaseClaim,
  providers: Record<string, SearchProvider>
): Promise<Source[]> {
  const orderedProviders = routeClaim(citation, providers);

  for (const provider of orderedProviders) {
    try {
      const sources = await provider.search(citation.search_query, citation);

      if (sources.length === 0) continue;

      // Filter by relevance
      const relevant = sources.filter((s) => isSourceRelevant(s, citation));

      // Accept relevant sources; fall back to unrelevant if we have something
      const finalSources = relevant.length > 0 ? relevant : sources;

      if (finalSources.length > 0) {
        return finalSources;
      }
    } catch (err) {
      console.warn(
        `[pipeline] Provider "${provider.name}" failed for claim "${citation.claim}":`,
        err instanceof Error ? err.message : err
      );
      // Continue to next provider
    }
  }

  // No provider returned results
  return [];
}

async function resolveOneCitation(
  citation: RawCitation,
  providers: Record<string, SearchProvider>
): Promise<ResolvedCitation> {
  const sources = await resolveCitation(citation, providers);
  return { ...citation, sources };
}

async function resolveOneArticleCitation(
  citation: RawArticleCitation,
  providers: Record<string, SearchProvider>
): Promise<ResolvedArticleCitation> {
  const sources = await resolveCitation(citation, providers);
  return { ...citation, sources };
}

export async function processArticle(
  url: string,
  text: string,
  title?: string
): Promise<ArticleAnnotation> {
  // 1. Extract citations via LLM
  const llmProvider = getLLMProvider();
  const rawCitations = await llmProvider.extractArticleCitations(text, title);

  // 2. Get search providers
  const searchProviders = getSearchProviders();

  // 3. Resolve all citations in parallel
  const settledResults = await Promise.allSettled(
    rawCitations.map((citation) => resolveOneArticleCitation(citation, searchProviders))
  );

  // 4. Collect results
  const citations: ResolvedArticleCitation[] = settledResults.map((result, i) => {
    if (result.status === "fulfilled") {
      return result.value;
    }
    // If the resolution itself threw (shouldn't happen given inner try/catch), return empty
    console.error(
      `[pipeline] Unexpected failure resolving article citation at index ${i}:`,
      result.reason
    );
    return { ...rawCitations[i], sources: [] };
  });

  // 5. Compute stats
  const resolved = citations.filter((c) => c.sources.length > 0).length;

  return {
    url,
    title: title ?? "",
    processed_at: new Date().toISOString(),
    citations,
    stats: {
      total_claims: citations.length,
      resolved,
      unresolved: citations.length - resolved,
    },
  };
}

export async function processVideo(videoId: string): Promise<VideoAnnotation> {
  // 1. Fetch transcript
  const { segments, quality } = await fetchTranscript(videoId);

  // 2. Extract citations via LLM
  const llmProvider = getLLMProvider();
  const rawCitations = await llmProvider.extractCitations(segments);

  // 3. Get search providers
  const searchProviders = getSearchProviders();

  // 4. Resolve all citations in parallel
  const settledResults = await Promise.allSettled(
    rawCitations.map((citation) => resolveOneCitation(citation, searchProviders))
  );

  // 5. Collect results
  const citations: ResolvedCitation[] = settledResults.map((result, i) => {
    if (result.status === "fulfilled") {
      return result.value;
    }
    // If the resolution itself threw (shouldn't happen given inner try/catch), return empty
    console.error(
      `[pipeline] Unexpected failure resolving citation at index ${i}:`,
      result.reason
    );
    return { ...rawCitations[i], sources: [] };
  });

  // 6. Compute stats
  const resolved = citations.filter((c) => c.sources.length > 0).length;

  return {
    video_id: videoId,
    processed_at: new Date().toISOString(),
    transcript_quality: quality,
    citations,
    stats: {
      total_claims: citations.length,
      resolved,
      unresolved: citations.length - resolved,
    },
  };
}
