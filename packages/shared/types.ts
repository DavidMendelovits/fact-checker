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
  error: "no_transcript" | "rate_limit" | "processing_failed";
  message: string;
  citations: [];
}

export type AnnotationResponse = VideoAnnotation | AnnotationError;
