import { TranscriptSegment, RawCitation, RawArticleCitation } from "@citecast/shared";

export interface LLMProvider {
  name: string;
  extractCitations(transcript: TranscriptSegment[]): Promise<RawCitation[]>;
  extractArticleCitations(text: string, title?: string): Promise<RawArticleCitation[]>;
}
