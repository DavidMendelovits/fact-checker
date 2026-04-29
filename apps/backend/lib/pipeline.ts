import { VideoAnnotation, RawCitation, ResolvedCitation, Source } from "@citecast/shared";
import { fetchTranscript } from "./transcript";
import { getLLMProvider } from "./llm";
import { getSearchProviders, routeClaim } from "./search";
import { SearchProvider } from "./search/types";

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

function isSourceRelevant(source: Source, claim: RawCitation): boolean {
  const keywords = extractKeywords(claim.claim);
  if (keywords.length === 0) return true; // Nothing to check against

  const searchable = `${source.title} ${source.snippet}`.toLowerCase();
  return keywords.some((kw) => searchable.includes(kw));
}

async function resolveOneCitation(
  citation: RawCitation,
  providers: Record<string, SearchProvider>
): Promise<ResolvedCitation> {
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
        return { ...citation, sources: finalSources };
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
  return { ...citation, sources: [] };
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
