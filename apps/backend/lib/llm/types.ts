import { TranscriptSegment, RawCitation } from "@citecast/shared";

export interface LLMProvider {
  name: string;
  extractCitations(transcript: TranscriptSegment[]): Promise<RawCitation[]>;
}
