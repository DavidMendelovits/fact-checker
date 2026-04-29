import { ClaimType, Source } from "@citecast/shared";

// Minimal shape that both RawCitation and RawArticleCitation satisfy
export interface BaseClaim {
  claim: string;
  claim_type: ClaimType;
  search_query: string;
  confidence: string;
}

export interface SearchProvider {
  name: string;
  supports: ClaimType[];
  search(query: string, claim: BaseClaim): Promise<Source[]>;
}
