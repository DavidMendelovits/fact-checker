export type ClaimType =
  | "academic_paper"
  | "news_article"
  | "book"
  | "tweet"
  | "video"
  | "quote"
  | "statistic"
  | "general";

export type Confidence = "high" | "medium" | "low";

export type TranscriptQuality = "good" | "auto-generated" | "poor";

export interface TranscriptSegment {
  text: string;
  start: number;
  duration: number;
}

export interface RawCitation {
  start_time: number;
  end_time: number;
  spoken_text: string;
  claim: string;
  claim_type: ClaimType;
  search_query: string;
  confidence: Confidence;
}

export interface Source {
  url: string;
  title: string;
  snippet: string;
  publication?: string;
  authors?: string[];
  date?: string;
  provider: string;
}

export interface ResolvedCitation extends RawCitation {
  sources: Source[];
}

export interface VideoAnnotation {
  video_id: string;
  processed_at: string;
  transcript_quality: TranscriptQuality;
  citations: ResolvedCitation[];
  stats: {
    total_claims: number;
    resolved: number;
    unresolved: number;
  };
}

export interface AnnotationError {
  error: "no_transcript" | "no_content" | "rate_limit" | "processing_failed";
  message: string;
  citations: [];
}

export type AnnotationResponse = VideoAnnotation | AnnotationError;

// Article-specific citation — uses text spans instead of timestamps
export interface RawArticleCitation {
  excerpt: string;           // exact text from the article containing the reference (max 300 chars)
  claim: string;             // normalized version
  claim_type: ClaimType;
  search_query: string;
  confidence: Confidence;
}

export interface ResolvedArticleCitation extends RawArticleCitation {
  sources: Source[];
}

export interface ArticleAnnotation {
  url: string;
  title: string;
  processed_at: string;
  citations: ResolvedArticleCitation[];
  stats: {
    total_claims: number;
    resolved: number;
    unresolved: number;
  };
}

export type ArticleAnnotationResponse = ArticleAnnotation | AnnotationError;
